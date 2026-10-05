import { ehDoServidor, normalizarLogico } from "@/lib/dominios/dns/conteudo";
import type { EntradaRegistroDns, RegistroDns } from "@/lib/dominios/dns/tipos";

/**
 * Versões de uma zona de DNS: o que guardar e como voltar a uma delas.
 *
 * O contrato com o titular (cliente.avilaops.com, externo 02 §7) promete
 * histórico de versões com restauração, e o regimento interno 13 diz "a cada
 * alteração". Uma versão é a zona inteira depois de uma alteração — não a
 * linha mexida —, porque restaurar é voltar a um estado, e um estado só se
 * reconstrói a partir de linhas soltas se nenhuma alteração tiver escapado da
 * trilha. Mudança feita direto no painel do fornecedor escapa.
 *
 * Funções puras e sem import de Node: o mesmo cálculo de diferença roda no
 * servidor, para restaurar, e na tela, para mostrar antes o que vai mudar.
 */

/** Uma linha da zona como fica guardada na versão: sem id, que muda de servidor para servidor. */
export type LinhaVersao = {
  tipo: string;
  nome: string;
  conteudo: string;
  ttl: number;
  prioridade: number | null;
  proxy: boolean;
};

/** Linhas do titular, prontas para guardar: forma lógica, sem SOA e NS do servidor, em ordem. */
export function linhasDoTitular(registros: RegistroDns[], zona: string): LinhaVersao[] {
  return ordenarLinhas(registros.filter((r) => !ehDoServidor(r, zona)).map(paraLinha));
}

export function paraLinha(registro: RegistroDns): LinhaVersao {
  return {
    tipo: registro.tipo.toUpperCase(),
    nome: registro.nome.trim().toLowerCase().replace(/\.$/, ""),
    conteudo: normalizarLogico(registro.tipo, registro.conteudo),
    ttl: registro.ttl,
    prioridade: registro.prioridade,
    proxy: registro.proxy,
  };
}

/** Ordem estável: duas versões iguais têm o mesmo JSON, e a tela lista sempre igual. */
export function ordenarLinhas(linhas: LinhaVersao[]): LinhaVersao[] {
  return [...linhas].sort(
    (a, b) =>
      a.nome.localeCompare(b.nome) ||
      a.tipo.localeCompare(b.tipo) ||
      (a.prioridade ?? -1) - (b.prioridade ?? -1) ||
      a.conteudo.localeCompare(b.conteudo),
  );
}

/**
 * O que identifica uma linha. TTL e proxy ficam de fora de propósito: mudar
 * só um deles é alteração da mesma linha, não apagar e criar outra — apagar
 * e criar deixa o nome sem resposta no intervalo.
 */
function chave(linha: { tipo: string; nome: string; conteudo: string; prioridade: number | null }): string {
  const nome = linha.nome.trim().toLowerCase().replace(/\.$/, "");
  return `${linha.tipo.toUpperCase()}|${nome}|${linha.prioridade ?? ""}|${normalizarLogico(linha.tipo, linha.conteudo)}`;
}

export type DiferencaZona = {
  /** Existem agora e não existiam na versão: saem. */
  sair: RegistroDns[];
  /** Existiam na versão e não existem agora: entram. */
  entrar: LinhaVersao[];
  /** Mesma linha, com TTL ou proxy diferentes: voltam ao valor da versão. */
  ajustar: { atual: RegistroDns; alvo: LinhaVersao }[];
};

/**
 * O que aplicar para a zona voltar à versão. SOA e NS do próprio domínio
 * ficam de fora dos dois lados: são do servidor, não do titular.
 */
export function diferencaParaVersao(atual: RegistroDns[], versao: LinhaVersao[], zona: string): DiferencaZona {
  atual = atual.filter((r) => !ehDoServidor(r, zona));
  versao = versao.filter((l) => !ehDoServidor(l, zona));
  const restantes = new Map<string, LinhaVersao[]>();
  for (const linha of versao) {
    const k = chave(linha);
    restantes.set(k, [...(restantes.get(k) ?? []), linha]);
  }

  const sair: RegistroDns[] = [];
  const ajustar: DiferencaZona["ajustar"] = [];
  for (const registro of atual) {
    const k = chave(registro);
    const fila = restantes.get(k);
    const alvo = fila?.shift();
    if (!alvo) {
      sair.push(registro);
      continue;
    }
    if (alvo.ttl !== registro.ttl || alvo.proxy !== registro.proxy) ajustar.push({ atual: registro, alvo });
  }

  const entrar = [...restantes.values()].flat();
  return { sair, entrar, ajustar };
}

export function zonaIgual(diferenca: DiferencaZona): boolean {
  return diferenca.sair.length === 0 && diferenca.entrar.length === 0 && diferenca.ajustar.length === 0;
}

export function paraEntrada(linha: LinhaVersao): EntradaRegistroDns {
  return {
    tipo: linha.tipo,
    nome: linha.nome,
    conteudo: linha.conteudo,
    ttl: linha.ttl,
    proxy: linha.proxy,
    ...(linha.prioridade !== null ? { prioridade: linha.prioridade } : {}),
  };
}

/** Lê o JSON guardado no banco em forma lógica, descartando o que não tiver forma de linha. */
export function lerLinhas(bruto: unknown): LinhaVersao[] {
  if (!Array.isArray(bruto)) return [];
  return bruto.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const l = item as Record<string, unknown>;
    if (typeof l.tipo !== "string" || typeof l.nome !== "string" || typeof l.conteudo !== "string") return [];
    return [
      {
        tipo: l.tipo.toUpperCase(),
        nome: l.nome.trim().toLowerCase().replace(/\.$/, ""),
        // É este conteúdo que vai para o servidor ao restaurar, então a
        // normalização vale aqui também, não só na chave de comparação.
        conteudo: normalizarLogico(l.tipo, l.conteudo),
        ttl: typeof l.ttl === "number" ? l.ttl : 1,
        prioridade: typeof l.prioridade === "number" ? l.prioridade : null,
        proxy: l.proxy === true,
      },
    ];
  });
}

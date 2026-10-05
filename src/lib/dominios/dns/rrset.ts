import { conteudoDeApresentacao } from "@/lib/dominios/dns/conteudo";
import type { EntradaRegistroDns, RegistroDns } from "@/lib/dominios/dns/tipos";

/**
 * A tradução entre "um registro" e "um conjunto de registros".
 *
 * Um servidor DNS autoritativo não guarda linhas soltas: guarda **RRsets**,
 * conjuntos identificados por nome e tipo, cada um com uma lista de conteúdos
 * e um TTL só. A tela, e a cabeça de quem opera, pensam em linhas: "o MX do
 * cliente", "aquele TXT de verificação".
 *
 * Traduzir errado aqui apaga mais do que se pediu. Mandar `DELETE` para
 * remover uma linha de um conjunto com três conteúdos derruba os três, e o
 * sintoma disso é e-mail parando de chegar. Por isso as funções abaixo são
 * puras e testadas: elas decidem, para cada operação de uma linha, qual é o
 * conjunto resultante.
 */

/** Um RRset como o servidor autoritativo o entende. */
export type RRset = {
  /** Nome completo, com ponto final. */
  name: string;
  type: string;
  ttl: number;
  records: { content: string; disabled?: boolean }[];
};

/** A operação a aplicar num conjunto. `DELETE` remove o conjunto inteiro. */
export type Mudanca =
  | { changetype: "REPLACE"; name: string; type: string; ttl: number; records: { content: string; disabled: boolean }[] }
  | { changetype: "DELETE"; name: string; type: string };

/** Garante o ponto final, que o protocolo exige e as pessoas esquecem. */
export function comPontoFinal(nome: string): string {
  const limpo = nome.trim().toLowerCase();
  return limpo.endsWith(".") ? limpo : `${limpo}.`;
}

export function semPontoFinal(nome: string): string {
  return nome.trim().replace(/\.$/, "");
}

/**
 * Id sintético de uma linha dentro da zona.
 *
 * Nome, tipo e conteúdo juntos identificam a linha sem ambiguidade, e é o que
 * sobra quando o servidor não dá id próprio. Vai em base64url porque o id
 * viaja na URL e no corpo de uma requisição.
 */
export function idDoRegistro(nome: string, tipo: string, conteudo: string): string {
  const cru = `${comPontoFinal(nome)}|${tipo.toUpperCase()}|${conteudo}`;
  return Buffer.from(cru, "utf8").toString("base64url");
}

export function lerIdDoRegistro(id: string): { nome: string; tipo: string; conteudo: string } | null {
  try {
    const cru = Buffer.from(id, "base64url").toString("utf8");
    const primeiro = cru.indexOf("|");
    const segundo = cru.indexOf("|", primeiro + 1);
    if (primeiro < 1 || segundo < 0) return null;
    return {
      nome: cru.slice(0, primeiro),
      tipo: cru.slice(primeiro + 1, segundo),
      conteudo: cru.slice(segundo + 1),
    };
  } catch {
    return null;
  }
}

/**
 * MX e SRV carregam a prioridade dentro do conteúdo, separada por espaço.
 * A tela mostra os dois campos; o protocolo guarda um texto só.
 */
const COM_PRIORIDADE = new Set(["MX", "SRV"]);

export function montarConteudo(entrada: EntradaRegistroDns): string {
  const tipo = entrada.tipo.toUpperCase();
  // O servidor autoritativo só aceita a forma de apresentação: TXT entre
  // aspas, host com ponto final. Quem chega aqui pode trazer a forma lógica
  // (o portal, uma versão guardada do serviço externo).
  const conteudo = conteudoDeApresentacao(tipo, entrada.conteudo);
  if (!COM_PRIORIDADE.has(tipo) || entrada.prioridade === undefined) return conteudo;
  // Conteúdo que já vem com a prioridade na frente não ganha outra.
  if (/^\d+\s/.test(conteudo)) return conteudo;
  return `${entrada.prioridade} ${conteudo}`;
}

export function separarPrioridade(tipo: string, conteudo: string): { conteudo: string; prioridade: number | null } {
  if (!COM_PRIORIDADE.has(tipo.toUpperCase())) return { conteudo, prioridade: null };
  const casa = conteudo.match(/^(\d+)\s+(.*)$/);
  if (!casa) return { conteudo, prioridade: null };
  return { conteudo: casa[2], prioridade: Number(casa[1]) };
}

/** Achata os conjuntos da zona em linhas, que é como a tela pensa. */
export function achatar(rrsets: RRset[]): RegistroDns[] {
  const linhas: RegistroDns[] = [];
  for (const conjunto of rrsets) {
    for (const registro of conjunto.records) {
      if (registro.disabled) continue;
      const { conteudo, prioridade } = separarPrioridade(conjunto.type, registro.content);
      linhas.push({
        id: idDoRegistro(conjunto.name, conjunto.type, registro.content),
        tipo: conjunto.type,
        nome: semPontoFinal(conjunto.name),
        conteudo,
        ttl: conjunto.ttl,
        // Proxy é recurso de rede de borda, não de DNS autoritativo.
        proxy: false,
        prioridade,
      });
    }
  }
  return linhas;
}

function conjuntoDe(rrsets: RRset[], nome: string, tipo: string): RRset | null {
  const alvoNome = comPontoFinal(nome);
  const alvoTipo = tipo.toUpperCase();
  return rrsets.find((c) => comPontoFinal(c.name) === alvoNome && c.type.toUpperCase() === alvoTipo) ?? null;
}

/**
 * Acrescentar uma linha: o conjunto inteiro é reescrito com o que já havia
 * mais a nova. Mandar só a linha nova apagaria as antigas, porque `REPLACE`
 * substitui o conjunto, não acrescenta a ele.
 */
export function mudancaParaCriar(rrsets: RRset[], entrada: EntradaRegistroDns): Mudanca {
  const tipo = entrada.tipo.toUpperCase();
  const nome = comPontoFinal(entrada.nome);
  const conteudo = montarConteudo(entrada);
  const atual = conjuntoDe(rrsets, nome, tipo);

  const conteudos = atual ? atual.records.filter((r) => !r.disabled).map((r) => r.content) : [];
  if (!conteudos.includes(conteudo)) conteudos.push(conteudo);

  return {
    changetype: "REPLACE",
    name: nome,
    type: tipo,
    ttl: entrada.ttl ?? atual?.ttl ?? 3600,
    records: conteudos.map((content) => ({ content, disabled: false })),
  };
}

/**
 * Alterar uma linha. Quando o nome ou o tipo mudam, a linha sai de um conjunto
 * e entra em outro: são duas mudanças, e a ordem importa pouco porque o
 * servidor aplica o lote inteiro de uma vez.
 */
export function mudancasParaAlterar(
  rrsets: RRset[],
  alvo: { nome: string; tipo: string; conteudo: string },
  entrada: EntradaRegistroDns,
): Mudanca[] {
  const mesmoLugar =
    comPontoFinal(alvo.nome) === comPontoFinal(entrada.nome) &&
    alvo.tipo.toUpperCase() === entrada.tipo.toUpperCase();

  const novoConteudo = montarConteudo(entrada);

  if (mesmoLugar) {
    const atual = conjuntoDe(rrsets, alvo.nome, alvo.tipo);
    const conteudos = (atual?.records ?? [])
      .filter((r) => !r.disabled)
      .map((r) => (r.content === alvo.conteudo ? novoConteudo : r.content));
    if (!conteudos.includes(novoConteudo)) conteudos.push(novoConteudo);

    return [
      {
        changetype: "REPLACE",
        name: comPontoFinal(entrada.nome),
        type: entrada.tipo.toUpperCase(),
        ttl: entrada.ttl ?? atual?.ttl ?? 3600,
        records: [...new Set(conteudos)].map((content) => ({ content, disabled: false })),
      },
    ];
  }

  return [...mudancasParaRemover(rrsets, alvo), mudancaParaCriar(rrsets, entrada)];
}

/**
 * Remover uma linha. Só quando ela era a última do conjunto é que o conjunto
 * inteiro sai; caso contrário o conjunto é reescrito sem ela. É aqui que um
 * `DELETE` apressado derrubaria os outros conteúdos junto.
 */
export function mudancasParaRemover(
  rrsets: RRset[],
  alvo: { nome: string; tipo: string; conteudo: string },
): Mudanca[] {
  const nome = comPontoFinal(alvo.nome);
  const tipo = alvo.tipo.toUpperCase();
  const atual = conjuntoDe(rrsets, nome, tipo);
  if (!atual) return [];

  const restantes = atual.records.filter((r) => !r.disabled && r.content !== alvo.conteudo);

  if (restantes.length === 0) return [{ changetype: "DELETE", name: nome, type: tipo }];

  return [
    {
      changetype: "REPLACE",
      name: nome,
      type: tipo,
      ttl: atual.ttl,
      records: restantes.map((r) => ({ content: r.content, disabled: false })),
    },
  ];
}

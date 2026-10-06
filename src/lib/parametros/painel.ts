import { CATALOGO, valorEmTexto, type Camada, type DefinicaoParametro, type EstadoParametro } from "@/lib/parametros/catalogo";
import { ESCOPO_GLOBAL, resolver, vigenteAte, type Resolucao, type VersaoParametro } from "@/lib/parametros/resolver";
import { conflitos, type Conflito } from "@/lib/parametros/validacao";

/**
 * O que a tela de parâmetros mostra, montado das versões guardadas. Puro: a
 * página só carrega as versões e a data de hoje.
 */

export type VersaoNaTela = VersaoParametro & { vigenteAte: string | null; emVigorHoje: boolean; agendada: boolean };

export type ParametroNaTela = {
  definicao: DefinicaoParametro;
  /** Escopo global, hoje. Outros escopos aparecem no detalhe. */
  hoje: Resolucao;
  valorHoje: string | null;
  agendadas: VersaoParametro[];
  escopos: string[];
  versoes: VersaoNaTela[];
  conflitos: Conflito[];
};

export const ROTULO_CAMADA: Record<Camada, string> = {
  REGRA_EXTERNA: "Regra externa",
  REGRA_FORNECEDOR: "Regra do fornecedor",
  POLITICA_PRODUTO: "Política do produto",
};

export const ROTULO_ESTADO: Record<EstadoParametro, string> = {
  VIGENTE: "Vigente",
  PENDENTE_DE_CONFIRMACAO: "Pendente",
  MONITORADA: "Monitorada",
};

export function montarPainel(versoes: VersaoParametro[], hoje: string): ParametroNaTela[] {
  const todosConflitos = conflitos(versoes, hoje);
  return CATALOGO.map((definicao) => {
    const daChave = versoes.filter((v) => v.chave === definicao.chave);
    const resolucao = resolver(versoes, definicao.chave, { escopos: [ESCOPO_GLOBAL], data: hoje });
    const emVigorPorEscopo = new Set(
      [...new Set(daChave.map((v) => v.escopo))]
        .map((escopo) => resolver(daChave, definicao.chave, { escopos: [escopo], data: hoje }))
        .flatMap((r) => (r.tipo === "ausente" ? [] : [r.versao.id])),
    );
    return {
      definicao,
      hoje: resolucao,
      valorHoje: resolucao.tipo === "ausente" ? null : valorEmTexto(definicao.tipo, resolucao.versao.valor),
      agendadas: daChave.filter((v) => v.vigenteDesde > hoje),
      escopos: [...new Set(daChave.map((v) => v.escopo))],
      versoes: [...daChave]
        .sort((a, b) => b.vigenteDesde.localeCompare(a.vigenteDesde) || b.registradaEm.localeCompare(a.registradaEm))
        .map((v) => ({
          ...v,
          vigenteAte: vigenteAte(daChave, v),
          emVigorHoje: emVigorPorEscopo.has(v.id),
          agendada: v.vigenteDesde > hoje,
        })),
      conflitos: todosConflitos.filter((c) => c.chave === definicao.chave),
    };
  });
}

/** Resumo para a central: quantas chaves esperam decisão e quantas contrariam regra externa. */
export function resumoDoPainel(painel: ParametroNaTela[]) {
  return {
    pendentes: painel.filter((p) => p.hoje.tipo === "pendente").length,
    semValor: painel.filter((p) => p.hoje.tipo === "ausente").length,
    conflitos: painel.reduce((n, p) => n + p.conflitos.length, 0),
  };
}

/** AAAA-MM-DD → DD/MM/AAAA. */
export function dataBr(iso: string | null): string | null {
  if (!iso) return null;
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

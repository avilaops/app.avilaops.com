/**
 * As chaves que o sistema conhece: o que cada uma significa, de que camada é,
 * que forma o valor tem e o que ela não pode contrariar.
 *
 * O **valor** não está aqui. Ele vive em `operations.policy_parameter_versions`,
 * com fonte, dono e data de vigência (POLITICAS-E-PARAMETROS.md do
 * cliente.avilaops.com). Aqui fica só o que é regra de forma: uma chave nova
 * entra no catálogo junto com o código que a lê, e o valor dela entra no banco.
 */

export type Camada = "REGRA_EXTERNA" | "REGRA_FORNECEDOR" | "POLITICA_PRODUTO";
export type EstadoParametro = "VIGENTE" | "PENDENTE_DE_CONFIRMACAO" | "MONITORADA";

export const CAMADAS: readonly Camada[] = ["REGRA_EXTERNA", "REGRA_FORNECEDOR", "POLITICA_PRODUTO"];
export const ESTADOS: readonly EstadoParametro[] = ["VIGENTE", "PENDENTE_DE_CONFIRMACAO", "MONITORADA"];

export type Intervalo = { min: number; max: number };

export type TipoDeValor = "inteiro" | "listaDeInteiros" | "intervalo" | "booleano";

/** Lê o valor vigente de outra chave, para conferir uma restrição. */
export type LerOutra = (chave: string) => unknown | undefined;

export type DefinicaoParametro = {
  chave: string;
  camada: Camada;
  tipo: TipoDeValor;
  /** Unidade em palavras, como aparece na tela: "dias corridos". */
  unidade: string;
  descricao: string;
  /** Onde o valor é usado: código, documento, texto público. */
  usadoEm: string[];
  /**
   * Política do produto pode ser mais protetora que a regra externa, nunca
   * menos (POLITICAS-E-PARAMETROS §1). Devolve o problema, ou nada se o valor
   * respeita a regra ou se a regra externa não está vigente para conferir.
   */
  naoPodeContrariar?: { chaves: string[]; conferir: (valor: unknown, ler: LerOutra) => string | null };
};

const ehInteiro = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);

export function ehIntervalo(v: unknown): v is Intervalo {
  return (
    typeof v === "object" && v !== null && ehInteiro((v as Intervalo).min) && ehInteiro((v as Intervalo).max) &&
    (v as Intervalo).min <= (v as Intervalo).max
  );
}

/** O valor tem a forma que a chave pede? Devolve o problema em palavras. */
export function conferirForma(tipo: TipoDeValor, valor: unknown): string | null {
  switch (tipo) {
    case "inteiro":
      return ehInteiro(valor) && valor >= 0 ? null : "O valor é um número inteiro, zero ou maior.";
    case "listaDeInteiros":
      return Array.isArray(valor) && valor.length > 0 && valor.every((v) => ehInteiro(v) && v >= 0)
        ? null
        : "O valor é uma lista de números inteiros, separados por vírgula.";
    case "intervalo":
      return ehIntervalo(valor) ? null : "O valor é um intervalo: mínimo e máximo, inteiros, com mínimo ≤ máximo.";
    case "booleano":
      return typeof valor === "boolean" ? null : "O valor é sim ou não.";
  }
}

function dentro(n: number, i: Intervalo) {
  return n >= i.min && n <= i.max;
}

const D = "dias corridos";

export const CATALOGO: readonly DefinicaoParametro[] = [
  // ── ICANN (genéricos) ─────────────────────────────────────────────────
  {
    chave: "icann.errp.aviso1JanelaDias",
    camada: "REGRA_EXTERNA",
    tipo: "intervalo",
    unidade: "dias antes do vencimento",
    descricao: "Janela do primeiro aviso de vencimento obrigatório (ERRP).",
    usadoEm: ["produto.avisos.diasAntes (restrição)", "externo 02 §5.2"],
  },
  {
    chave: "icann.errp.aviso2JanelaDias",
    camada: "REGRA_EXTERNA",
    tipo: "intervalo",
    unidade: "dias antes do vencimento",
    descricao: "Janela do segundo aviso de vencimento obrigatório (ERRP).",
    usadoEm: ["produto.avisos.diasAntes (restrição)", "externo 02 §5.2"],
  },
  {
    chave: "icann.errp.avisoPosVencimentoMaxDias",
    camada: "REGRA_EXTERNA",
    tipo: "inteiro",
    unidade: "dias depois do vencimento",
    descricao: "Prazo máximo para o aviso depois do vencimento (ERRP).",
    usadoEm: ["produto.avisos.diasDepois (restrição)", "externo 02 §5.2"],
  },
  {
    chave: "icann.errp.interrupcaoDnsMinDias",
    camada: "REGRA_EXTERNA",
    tipo: "inteiro",
    unidade: D,
    descricao: "Dias mínimos, depois do vencimento, em que o domínio vencido deixa de resolver antes de ser liberado (ERRP).",
    usadoEm: ["externo 02 §5"],
  },
  {
    chave: "icann.errp.resgateDias",
    camada: "REGRA_EXTERNA",
    tipo: "inteiro",
    unidade: D,
    descricao: "Período de resgate de domínio genérico apagado (ERRP).",
    usadoEm: ["externo 02 §5"],
  },
  {
    chave: "icann.transfer.travaAposCriacaoDias",
    camada: "REGRA_EXTERNA",
    tipo: "inteiro",
    unidade: D,
    descricao: "Trava de transferência depois do registro do domínio.",
    usadoEm: ["contrato 02 §6", "ajuda trava-de-transferencia"],
  },
  {
    chave: "icann.transfer.travaAposTransferenciaDias",
    camada: "REGRA_EXTERNA",
    tipo: "inteiro",
    unidade: D,
    descricao: "Trava de transferência depois de uma transferência entre registradores.",
    usadoEm: ["contrato 02 §6", "ajuda trava-de-transferencia"],
  },
  {
    chave: "icann.transfer.travaAposTrocaTitularDias",
    camada: "REGRA_EXTERNA",
    tipo: "inteiro",
    unidade: D,
    descricao: "Trava de transferência depois da troca de titular.",
    usadoEm: ["contrato 02 §4 e §6", "ajuda trava-de-transferencia"],
  },
  {
    chave: "icann.transfer.codigoAutorizacaoMaxDias",
    camada: "REGRA_EXTERNA",
    tipo: "inteiro",
    unidade: D,
    descricao: "Prazo máximo para entregar o código de autorização de transferência.",
    usadoEm: ["contrato 02 §6.2"],
  },
  {
    chave: "icann.verificacaoContato.prazoDias",
    camada: "REGRA_EXTERNA",
    tipo: "inteiro",
    unidade: D,
    descricao: "Prazo para o titular confirmar o contato antes da suspensão.",
    usadoEm: ["interno 04"],
  },
  // ── NIC.br ───────────────────────────────────────────────────────────
  {
    chave: "nicbr.expiracao.reservaTitularDias",
    camada: "REGRA_EXTERNA",
    tipo: "inteiro",
    unidade: D,
    descricao: "Até quantos dias o .br vencido fica reservado ao titular.",
    usadoEm: ["externo 02 §5"],
  },
  // ── Política do produto ─────────────────────────────────────────────
  {
    chave: "produto.renovacao.automaticaPadrao",
    camada: "POLITICA_PRODUTO",
    tipo: "booleano",
    unidade: "sim ou não",
    descricao: "Domínio novo nasce com renovação automática ligada.",
    usadoEm: ["externo 02 §5.1"],
  },
  {
    chave: "produto.renovacao.tentativasDiasAntes",
    camada: "POLITICA_PRODUTO",
    tipo: "listaDeInteiros",
    unidade: "dias antes do vencimento",
    descricao: "Quando a renovação automática tenta cobrar.",
    usadoEm: ["externo 06 §2"],
  },
  {
    chave: "produto.renovacao.janelaMonitoramentoDias",
    camada: "POLITICA_PRODUTO",
    tipo: "inteiro",
    unidade: "dias antes do vencimento",
    descricao: "A partir de quantos dias para vencer o domínio aparece como vencendo.",
    usadoEm: ["interno 02"],
  },
  {
    chave: "produto.avisos.diasAntes",
    camada: "POLITICA_PRODUTO",
    tipo: "listaDeInteiros",
    unidade: "dias antes do vencimento",
    descricao: "Quando o titular recebe aviso de vencimento.",
    usadoEm: ["externo 02 §5.2"],
    naoPodeContrariar: {
      chaves: ["icann.errp.aviso1JanelaDias", "icann.errp.aviso2JanelaDias"],
      conferir(valor, ler) {
        const dias = valor as number[];
        for (const chave of ["icann.errp.aviso1JanelaDias", "icann.errp.aviso2JanelaDias"]) {
          const janela = ler(chave);
          if (!ehIntervalo(janela)) continue;
          if (!dias.some((d) => dentro(d, janela))) {
            return `Precisa de um aviso entre ${janela.min} e ${janela.max} dias antes do vencimento (${chave}).`;
          }
        }
        return null;
      },
    },
  },
  {
    chave: "produto.avisos.diasDepois",
    camada: "POLITICA_PRODUTO",
    tipo: "listaDeInteiros",
    unidade: "dias depois do vencimento",
    descricao: "Quando o titular recebe aviso depois do vencimento.",
    usadoEm: ["externo 02 §5.2"],
    naoPodeContrariar: {
      chaves: ["icann.errp.avisoPosVencimentoMaxDias"],
      conferir(valor, ler) {
        const maximo = ler("icann.errp.avisoPosVencimentoMaxDias");
        if (!ehInteiro(maximo)) return null;
        const dias = valor as number[];
        if (!dias.some((d) => d <= maximo)) {
          return `Precisa de um aviso até ${maximo} dias depois do vencimento (icann.errp.avisoPosVencimentoMaxDias).`;
        }
        return null;
      },
    },
  },
  {
    chave: "produto.transferencia.travaPadraoLigada",
    camada: "POLITICA_PRODUTO",
    tipo: "booleano",
    unidade: "sim ou não",
    descricao: "Domínio nasce com a trava de transferência ligada.",
    usadoEm: ["ajuda trava-de-transferencia"],
  },
  {
    chave: "produto.transferencia.reterPorDebito",
    camada: "POLITICA_PRODUTO",
    tipo: "booleano",
    unidade: "sim ou não",
    descricao: "Se a Ávila segura a transferência de saída por débito em aberto.",
    usadoEm: ["externo 02 §6.2"],
  },
  {
    chave: "produto.transferencia.zonaAposSaidaDias",
    camada: "POLITICA_PRODUTO",
    tipo: "inteiro",
    unidade: D,
    descricao: "Quanto tempo a zona de DNS continua servida depois que o domínio sai.",
    usadoEm: ["externo 02 §6.2", "externo 04 §4"],
  },
  {
    chave: "produto.recuperacaoConta.esperaHoras",
    camada: "POLITICA_PRODUTO",
    tipo: "inteiro",
    unidade: "horas",
    descricao: "Espera antes de concluir a recuperação de conta.",
    usadoEm: ["interno 11"],
  },
  {
    chave: "produto.recuperacaoConta.travaTransferenciaDias",
    camada: "POLITICA_PRODUTO",
    tipo: "inteiro",
    unidade: D,
    descricao: "Trava de transferência depois de uma recuperação de conta.",
    usadoEm: ["interno 11", "ajuda perdi-acesso"],
  },
  {
    chave: "produto.inadimplencia.bloqueioNovasComprasDias",
    camada: "POLITICA_PRODUTO",
    tipo: "inteiro",
    unidade: "dias de atraso",
    descricao: "Atraso a partir do qual novas compras ficam bloqueadas. Nunca bloqueia renovação paga, DNS ou saída.",
    usadoEm: ["externo 06 §7"],
  },
  {
    chave: "produto.precos.avisoReajusteDias",
    camada: "POLITICA_PRODUTO",
    tipo: "inteiro",
    unidade: "dias de antecedência",
    descricao: "Antecedência do aviso de reajuste de preço.",
    usadoEm: ["externo 02 §9", "externo 06 §3"],
  },
  {
    chave: "produto.saldoRegistrador.alertaDias",
    camada: "POLITICA_PRODUTO",
    tipo: "inteiro",
    unidade: "dias de cobertura",
    descricao: "Cobertura de saldo no registrador abaixo da qual a operação é alertada.",
    usadoEm: ["interno 07"],
  },
  {
    chave: "produto.dns.versoesRetencaoDias",
    camada: "POLITICA_PRODUTO",
    tipo: "inteiro",
    unidade: D,
    descricao: "Por quanto tempo uma versão de zona de DNS fica guardada para restaurar. A mais recente nunca é descartada.",
    usadoEm: ["src/lib/dominios/dns/escrita.ts (descarte ao gravar versão)", "portal: Versões da zona", "interno 13"],
  },
];

const PORCHAVE = new Map(CATALOGO.map((d) => [d.chave, d]));

export function definicaoDe(chave: string): DefinicaoParametro | undefined {
  return PORCHAVE.get(chave);
}

/** Valor em palavras, para tela e texto público. */
export function valorEmTexto(tipo: TipoDeValor, valor: unknown): string {
  if (tipo === "booleano") return valor === true ? "sim" : valor === false ? "não" : "—";
  if (tipo === "intervalo" && ehIntervalo(valor)) return `de ${valor.min} a ${valor.max}`;
  if (tipo === "listaDeInteiros" && Array.isArray(valor)) return valor.join(", ");
  return typeof valor === "number" ? String(valor) : JSON.stringify(valor);
}

/** O que a pessoa digitou no formulário → valor da chave. Devolve o problema se não der. */
export function lerValorDigitado(tipo: TipoDeValor, texto: string): { valor: unknown } | { problema: string } {
  const t = texto.trim();
  let valor: unknown;
  if (tipo === "inteiro") valor = /^\d+$/.test(t) ? Number(t) : NaN;
  else if (tipo === "listaDeInteiros") valor = t.split(/[,;\s]+/).filter(Boolean).map((p) => (/^\d+$/.test(p) ? Number(p) : NaN));
  else if (tipo === "booleano") valor = /^(sim|s|true)$/i.test(t) ? true : /^(não|nao|n|false)$/i.test(t) ? false : null;
  else {
    const m = /^(\d+)\s*(?:a|-|–|até)\s*(\d+)$/i.exec(t);
    valor = m ? { min: Number(m[1]), max: Number(m[2]) } : null;
  }
  const problema = conferirForma(tipo, valor);
  return problema ? { problema } : { valor };
}

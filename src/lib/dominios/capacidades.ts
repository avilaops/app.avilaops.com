import {
  NOME_CAPACIDADE,
  type Capacidade,
  type CapacidadesDeEscrita,
  type EstadoCapacidade,
  type ItemDiagnostico,
} from "@/lib/dominios/tipos";

/**
 * A luz de cada função da central, derivada por função pura.
 *
 * Nada aqui lê banco, ambiente ou rede: entra o que já foi coletado, sai o
 * estado e o diagnóstico. É o que permite testar as quatro luzes sem subir
 * nada, do mesmo jeito que `lib/icones/padrao.ts` faz com o padrão de ícones.
 *
 * As luzes falam da FUNÇÃO. "Registro de domínios" pode estar vermelho porque
 * o fornecedor caiu ou porque o certificado venceu; quem precisa saber qual
 * dos dois abre o detalhe.
 */

/** Um provedor já consultado, reduzido ao que a luz precisa saber. */
export type EntradaProvedor = {
  /** Nome interno do adaptador. Só aparece na área avançada. */
  adaptador: string | null;
  configurado: boolean;
  /** Falso quando está configurado mas a última verificação falhou. */
  operacional: boolean;
  ambiente: "producao" | "homologacao" | null;
  verificadoEm: string | null;
  erro: string | null;
};

const SEM_PROVEDOR: EntradaProvedor = {
  adaptador: null,
  configurado: false,
  operacional: false,
  ambiente: null,
  verificadoEm: null,
  erro: null,
};

function avancadoDoProvedor(provedor: EntradaProvedor): ItemDiagnostico[] {
  const itens: ItemDiagnostico[] = [];
  if (provedor.adaptador) itens.push({ rotulo: "Conector", valor: provedor.adaptador, tecnico: true });
  if (provedor.ambiente) {
    itens.push({ rotulo: "Ambiente", valor: provedor.ambiente === "producao" ? "Produção" : "Homologação" });
  }
  return itens;
}

/**
 * Registro: criar, renovar e transferir. É a função que depende de a casa
 * estar habilitada junto ao registro, então o estado padrão é "não
 * configurada", nunca "operacional por omissão".
 */
export function avaliarRegistro(
  provedor: EntradaProvedor = SEM_PROVEDOR,
  escrita?: Partial<CapacidadesDeEscrita>,
): Capacidade {
  const podeRegistrar = Boolean(escrita?.registrar);
  const podeRenovar = Boolean(escrita?.renovar);
  const podeTransferir = Boolean(escrita?.transferir);

  let estado: EstadoCapacidade = "NAO_CONFIGURADA";
  let resumo = "Ainda não habilitado nesta conta";

  if (provedor.configurado && provedor.operacional) {
    estado = podeRegistrar ? "OPERACIONAL" : "ATENCAO";
    resumo = podeRegistrar ? "Registro, renovação e transferência" : "Conectado, sem permissão de registro";
  } else if (provedor.configurado) {
    estado = "INDISPONIVEL";
    resumo = "Configurado, mas sem resposta";
  }

  const operacoes = [
    podeRegistrar ? "registrar" : null,
    podeRenovar ? "renovar" : null,
    podeTransferir ? "transferir" : null,
  ].filter(Boolean);

  return {
    chave: "registro",
    nome: NOME_CAPACIDADE.registro,
    resumo,
    estado,
    verificadoEm: provedor.verificadoEm,
    erro: provedor.erro,
    detalhes: [
      { rotulo: "Situação", valor: rotuloEstado(estado) },
      {
        rotulo: "Operações liberadas",
        valor: operacoes.length > 0 ? operacoes.join(", ") : "nenhuma",
      },
      {
        rotulo: "Consulta de dados públicos",
        valor: "disponível, pela função de consulta",
      },
    ],
    avancado: avancadoDoProvedor(provedor),
  };
}

export type EntradaDns = {
  provedor?: EntradaProvedor;
  /** Domínios que têm DNS espelhado aqui. */
  dominiosComDns: number;
  totalRegistros: number;
  /** ISO 8601 da sincronização mais recente entre todos os domínios. */
  sincronizadoEm: string | null;
  podeEditar: boolean;
};

export function avaliarDns(entrada: EntradaDns): Capacidade {
  const provedor = entrada.provedor ?? SEM_PROVEDOR;

  let estado: EstadoCapacidade = "NAO_CONFIGURADA";
  let resumo = "Nenhum serviço de DNS conectado";

  if (provedor.configurado && provedor.operacional) {
    if (entrada.dominiosComDns === 0) {
      estado = "ATENCAO";
      resumo = "Conectado, sem domínio sincronizado";
    } else {
      estado = "OPERACIONAL";
      resumo = `${entrada.totalRegistros} registros em ${entrada.dominiosComDns} domínios`;
    }
  } else if (provedor.configurado) {
    estado = "INDISPONIVEL";
    resumo = "Última sincronização falhou";
  }

  return {
    chave: "dns",
    nome: NOME_CAPACIDADE.dns,
    resumo,
    estado,
    verificadoEm: entrada.sincronizadoEm ?? provedor.verificadoEm,
    erro: provedor.erro,
    detalhes: [
      { rotulo: "Situação", valor: rotuloEstado(estado) },
      { rotulo: "Domínios com DNS aqui", valor: String(entrada.dominiosComDns) },
      { rotulo: "Registros espelhados", valor: String(entrada.totalRegistros) },
      { rotulo: "Edição de registros", valor: entrada.podeEditar ? "liberada" : "somente leitura" },
    ],
    avancado: avancadoDoProvedor(provedor),
  };
}

export type EntradaRenovacao = {
  /** Domínios com data de vencimento conhecida. */
  comData: number;
  total: number;
  vencendo: number;
  vencidos: number;
  /** ISO 8601 da última leitura de vencimentos. */
  verificadoEm: string | null;
  /** Falso enquanto a renovação não puder ser executada por aqui. */
  podeRenovar: boolean;
};

/**
 * Renovação: acompanhar prazo e, quando houver permissão, renovar. Ela fica
 * amarela quando há domínio no prazo de atenção, porque é justamente aí que a
 * função precisa de alguém.
 */
export function avaliarRenovacao(entrada: EntradaRenovacao): Capacidade {
  const semData = entrada.total - entrada.comData;

  let estado: EstadoCapacidade = "OPERACIONAL";
  let resumo = "Nenhum vencimento próximo";

  if (entrada.total === 0) {
    estado = "NAO_CONFIGURADA";
    resumo = "Nenhum domínio na carteira";
  } else if (entrada.comData === 0) {
    // Zero vencendo com zero datas conhecidas não é tranquilidade, é cegueira.
    estado = "NAO_CONFIGURADA";
    resumo = "Nenhum vencimento consultado ainda";
  } else if (entrada.vencidos > 0) {
    estado = "INDISPONIVEL";
    resumo = `${entrada.vencidos} já ${entrada.vencidos === 1 ? "vencido" : "vencidos"}`;
  } else if (entrada.vencendo > 0) {
    estado = "ATENCAO";
    resumo = `${entrada.vencendo} ${entrada.vencendo === 1 ? "vence" : "vencem"} em breve`;
  } else if (semData > 0) {
    estado = "ATENCAO";
    resumo = `${semData} sem data conhecida`;
  }

  return {
    chave: "renovacao",
    nome: NOME_CAPACIDADE.renovacao,
    resumo,
    estado,
    verificadoEm: entrada.verificadoEm,
    erro: null,
    detalhes: [
      { rotulo: "Situação", valor: rotuloEstado(estado) },
      { rotulo: "Com data conhecida", valor: `${entrada.comData} de ${entrada.total}` },
      { rotulo: "Vencendo", valor: String(entrada.vencendo) },
      { rotulo: "Vencidos", valor: String(entrada.vencidos) },
      { rotulo: "Renovar por aqui", valor: entrada.podeRenovar ? "liberado" : "ainda não habilitado" },
    ],
    avancado: [],
  };
}

export type EntradaConsulta = {
  /** Falso quando a última consulta não conseguiu falar com a fonte. */
  operacional: boolean;
  verificadoEm: string | null;
  erro: string | null;
  /** Nome interno da fonte, para a área avançada. */
  fonte: string | null;
};

/**
 * Consulta de disponibilidade. Não depende de habilitação nenhuma: é leitura
 * de dado público, então o padrão dela é operacional.
 */
export function avaliarConsulta(entrada: EntradaConsulta): Capacidade {
  const estado: EstadoCapacidade = entrada.operacional ? "OPERACIONAL" : "INDISPONIVEL";

  return {
    chave: "consulta",
    nome: NOME_CAPACIDADE.consulta,
    resumo: entrada.operacional ? "Verificar se um domínio está livre" : "Fonte de consulta sem resposta",
    estado,
    verificadoEm: entrada.verificadoEm,
    erro: entrada.erro,
    detalhes: [
      { rotulo: "Situação", valor: rotuloEstado(estado) },
      { rotulo: "Cobertura", valor: "domínios .br e demais extensões" },
      { rotulo: "Custo", valor: "sem custo por consulta" },
    ],
    avancado: entrada.fonte ? [{ rotulo: "Fonte", valor: entrada.fonte, tecnico: true }] : [],
  };
}

export function rotuloEstado(estado: EstadoCapacidade): string {
  if (estado === "OPERACIONAL") return "Operacional";
  if (estado === "ATENCAO") return "Requer atenção";
  if (estado === "INDISPONIVEL") return "Indisponível";
  return "Não configurada";
}

/** Tom da luz, no vocabulário de `status-rotulos`. */
export function tomEstado(estado: EstadoCapacidade): "bom" | "atencao" | "ruim" | "neutro" {
  if (estado === "OPERACIONAL") return "bom";
  if (estado === "ATENCAO") return "atencao";
  if (estado === "INDISPONIVEL") return "ruim";
  return "neutro";
}

/**
 * Pior estado entre várias funções, para o resumo do topo. A ordem é a da
 * urgência: vermelho vence amarelo, que vence cinza, que vence verde.
 */
export function piorEstado(capacidades: Capacidade[]): EstadoCapacidade {
  const ordem: EstadoCapacidade[] = ["INDISPONIVEL", "ATENCAO", "NAO_CONFIGURADA", "OPERACIONAL"];
  for (const estado of ordem) {
    if (capacidades.some((c) => c.estado === estado)) return estado;
  }
  return "OPERACIONAL";
}

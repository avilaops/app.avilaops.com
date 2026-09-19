/**
 * O vocabulário da central de domínios.
 *
 * A regra que organiza este módulo: **domínio é a entidade, registro e DNS são
 * capacidades dele**. Antes disso a tela tratava domínio como sinônimo de zona
 * de DNS, e um domínio que a casa administra sem hospedar o DNS no mesmo
 * fornecedor simplesmente não aparecia.
 *
 * Nada aqui nomeia fornecedor. Quem fala com fornecedor são os adaptadores em
 * `registry/` e `dns/`, e o nome deles só chega à tela na área de diagnóstico.
 */

/** As quatro funções que a central oferece. */
export type ChaveCapacidade = "registro" | "dns" | "renovacao" | "consulta";

/**
 * A luz de uma função. Representa a FUNÇÃO, nunca uma empresa.
 *
 * `NAO_CONFIGURADA` é diferente de `INDISPONIVEL` de propósito: a primeira diz
 * "ninguém ligou isto ainda", a segunda diz "estava ligado e quebrou". Tratar
 * as duas como a mesma coisa faz a equipe procurar defeito onde só falta
 * configuração.
 */
export type EstadoCapacidade = "OPERACIONAL" | "ATENCAO" | "INDISPONIVEL" | "NAO_CONFIGURADA";

/** Par rótulo/valor do detalhe de uma função. */
export type ItemDiagnostico = {
  rotulo: string;
  valor: string;
  /** Dado técnico (id, endpoint, host): vai em monoespaçada e só no detalhe. */
  tecnico?: boolean;
};

export type Capacidade = {
  chave: ChaveCapacidade;
  /** Nome da FUNÇÃO como o usuário lê. */
  nome: string;
  /** Uma linha, curta. A lista de Gestão mostra só isto. */
  resumo: string;
  estado: EstadoCapacidade;
  /** ISO 8601 da última verificação, quando houve alguma. */
  verificadoEm: string | null;
  /** O que aparece ao abrir a linha. */
  detalhes: ItemDiagnostico[];
  /** Erro que impede a operação, quando há. */
  erro: string | null;
  /**
   * Nomes de fornecedor, host, ambiente. Só isto pode citar terceiro, e só
   * dentro da área avançada do detalhe, porque é o que serve ao diagnóstico.
   */
  avancado: ItemDiagnostico[];
};

/** O que cada função permite fazer agora. A tela usa para não oferecer o que não dá. */
export type CapacidadesDeEscrita = {
  registrar: boolean;
  renovar: boolean;
  transferir: boolean;
  editarDns: boolean;
};

/** Situação de um domínio na carteira, já derivada para a tela. */
export type SituacaoDominio = "ATIVO" | "VENCENDO" | "ATENCAO" | "ARQUIVADO";

export const NOME_CAPACIDADE: Record<ChaveCapacidade, string> = {
  registro: "Registro de domínios",
  dns: "DNS",
  renovacao: "Renovação",
  consulta: "Consulta de disponibilidade",
};

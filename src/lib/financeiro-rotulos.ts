/**
 * Rótulos do módulo Financeiro. Um mapa só, para a tela nunca mostrar o que
 * o banco guarda cru.
 *
 * `transaction_type` continua como cada provedor manda (`PIX_SENT` do Éfi,
 * `CARD_PURCHASE` da Wise, `compra` dos cartões lançados à mão): é o que
 * permite reprocessar e auditar a importação. Só que `PIX_SENT` na tela lê
 * como log, não como extrato, e cada tela traduzia do seu jeito, ou não
 * traduzia. Tipo novo que chegar sem rótulo aparece como "Outra movimentação",
 * com o valor cru no `title` para quem precisar conferir.
 */

const TIPOS: Record<string, string> = {
  // Éfi
  PIX_RECEIVED: "Pix recebido",
  PIX_SENT: "Pix enviado",
  // Wise
  CARD_PURCHASE: "Compra no cartão",
  CARD_REFUND: "Estorno",
  CASHBACK: "Cashback",
  CONVERSION_IN: "Câmbio (entrada)",
  CONVERSION_OUT: "Câmbio (saída)",
  TRANSFER_RECEIVED: "Transferência recebida",
  TRANSFER_SENT: "Transferência enviada",
  // Mercado Pago
  bank_transfer: "Transferência bancária",
  account_money: "Saldo em conta",
  credit_card: "Cartão de crédito",
  debit_card: "Cartão de débito",
  ticket: "Boleto",
  pix: "Pix",
  // Cartões lançados à mão
  compra: "Compra no cartão",
  iof: "IOF",
  estorno: "Estorno",
  tarifa: "Tarifa",
  pagamento_fatura: "Pagamento de fatura",
};

export function rotuloTipoMovimentacao(tipo: string | null | undefined): string {
  if (!tipo) return "Outra movimentação";
  return TIPOS[tipo] ?? TIPOS[tipo.toUpperCase()] ?? "Outra movimentação";
}

export type EstadoConciliacao = "PENDING" | "REVIEW" | "MATCHED" | "IGNORED";

export const ROTULO_ESTADO: Record<EstadoConciliacao, string> = {
  PENDING: "Pendente",
  REVIEW: "Em revisão",
  MATCHED: "Conciliado",
  IGNORED: "Ignorado",
};

export function rotuloEstado(estado: string | null | undefined): string {
  return ROTULO_ESTADO[(estado ?? "PENDING") as EstadoConciliacao] ?? "Pendente";
}

const VINCULOS: Record<string, string> = {
  ORDER: "Pedido",
  INVOICE: "Fatura",
  EXPENSE: "Despesa",
  LEDGER: "Conta",
  COMPROVANTE: "Comprovante",
  MANUAL: "Manual",
};

/**
 * O vínculo cabe dentro do estado: "Conciliado · Conta #139". Antes era uma
 * coluna própria que repetia "Sem vínculo" em quase toda linha.
 */
export function rotuloVinculo(tipo: string | null | undefined, referencia: string | null | undefined): string | null {
  if (!referencia) return null;
  const nome = VINCULOS[tipo ?? ""] ?? "Referência";
  // Identificador de comprovante Pix tem 32 caracteres: não serve para ler,
  // só para conferir, e isso fica no title de quem mostra.
  if (tipo === "COMPROVANTE") return nome;
  return `${nome} #${referencia}`;
}

/** Instituição a partir do `provider` gravado em `bank_accounts`. */
const INSTITUICOES: Record<string, string> = {
  efi: "Efí",
  wise: "Wise",
  mercadopago: "Mercado Pago",
  paypal: "PayPal",
  nubank: "Nubank",
  cartao: "Cartões",
};

export function rotuloInstituicao(provider: string): string {
  return INSTITUICOES[provider] ?? provider;
}

/**
 * Nome da conta dentro da instituição. "Wise · EUR" vira "EUR" quando já está
 * agrupado sob "Wise"; conta sem separador fica como está.
 */
export function nomeCurtoDaConta(displayName: string, provider: string): string {
  const instituicao = rotuloInstituicao(provider);
  const semPrefixo = displayName.replace(new RegExp(`^${instituicao}\\s*·\\s*`, "i"), "");
  return semPrefixo || displayName;
}

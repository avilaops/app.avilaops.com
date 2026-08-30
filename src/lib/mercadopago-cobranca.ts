import { chamarMercadoPago } from "@/lib/mercadopago";

/**
 * Cobrança da mensalidade no Mercado Pago (decisão de 30/08/2026).
 *
 * Substitui `efi-cobranca.ts` como caminho padrão. A interface é
 * DELIBERADAMENTE a mesma — `createPixCharge`, `createBoletoCharge`,
 * `createCardCharge`, com os mesmos campos de entrada e de saída — para que a
 * troca em `assinaturas.ts` fosse a linha do import, e não uma reescrita da
 * regra de cobrança. Quem já sabia ler o fluxo do Efí lê este sem aprender
 * nada novo.
 *
 * O que a Efí continua fazendo: as cobranças que já estão abertas nela, e os
 * entregáveis (`DeliverableCharge`), que não foram migrados. O webhook do Efí
 * segue no ar por isso. Nenhuma cobrança NOVA de mensalidade nasce lá.
 *
 * Um detalhe do modelo que vale registrar: `SubscriptionCharge` não tem coluna
 * de gateway, e a baixa procura por `externalId`. Não há colisão possível
 * porque o id do Mercado Pago é numérico e o do Efí não — mas é isto, e não um
 * campo, que separa os dois mundos hoje.
 */

export type Pagador = {
  name: string;
  cpf: string;
  email: string;
  company?: { cnpj: string; corporateName: string };
  endereco?: {
    cep: string;
    rua: string;
    numero: string;
    bairro: string;
    cidade: string;
    uf: string;
  };
};

export type PixCharge = {
  externalId: string;
  status: string;
  copyPaste: string;
  qrCodeBase64: string;
  expiresAt: Date;
};

export type BoletoCharge = {
  externalId: string;
  status: string;
  boletoUrl: string;
  barcode: string;
  expiresAt: Date;
};

type PagamentoMP = {
  id?: number;
  status?: string;
  date_of_expiration?: string;
  point_of_interaction?: {
    transaction_data?: { qr_code?: string; qr_code_base64?: string; ticket_url?: string };
  };
  transaction_details?: { external_resource_url?: string };
  barcode?: { content?: string };
};

/**
 * O Mercado Pago exige nome e sobrenome separados, e recusa sobrenome vazio no
 * boleto. Nome de uma palavra só é comum no cadastro ("Elvair"), então o
 * sobrenome cai para um ponto em vez de derrubar a cobrança.
 */
function partirNome(nome: string): { first_name: string; last_name: string } {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return { first_name: "Cliente", last_name: "." };
  if (partes.length === 1) return { first_name: partes[0], last_name: "." };
  return { first_name: partes[0], last_name: partes.slice(1).join(" ") };
}

/**
 * Identificação do pagador.
 *
 * Ao contrário da Efí, aqui o CNPJ SUBSTITUI o CPF em vez de andar ao lado: o
 * campo é um par (tipo, número) e só cabe um documento. Quando a empresa tem
 * CNPJ ele é quem paga; o CPF do responsável fica para o caso de pessoa
 * física.
 */
function identificacao(pagador: Pagador): { type: string; number: string } | undefined {
  if (pagador.company?.cnpj) return { type: "CNPJ", number: pagador.company.cnpj };
  if (pagador.cpf) return { type: "CPF", number: pagador.cpf };
  return undefined;
}

function paraData(valor: string | undefined, padrao: Date): Date {
  if (!valor) return padrao;
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? padrao : data;
}

/**
 * PIX com QR e copia-e-cola, para a tela do produto desenhar sem sair do site.
 *
 * `idempotencia` amarra a chamada à fatura e ao minuto: um retry depois de
 * timeout de rede devolve a MESMA cobrança em vez de gerar um segundo QR para
 * a mesma mensalidade.
 */
export async function createPixCharge(input: {
  amount: number;
  description: string;
  expiresInSeconds?: number;
  payer: Pagador;
  idempotencyKey?: string;
}): Promise<PixCharge> {
  const expiraEm = new Date(Date.now() + (input.expiresInSeconds ?? 86_400) * 1000);
  const nome = partirNome(input.payer.name);

  const pagamento = await chamarMercadoPago<PagamentoMP>("/v1/payments", {
    method: "POST",
    idempotencia: input.idempotencyKey,
    body: {
      transaction_amount: Number(input.amount.toFixed(2)),
      description: input.description,
      payment_method_id: "pix",
      date_of_expiration: expiraEm.toISOString(),
      payer: {
        email: input.payer.email,
        ...nome,
        ...(identificacao(input.payer) ? { identification: identificacao(input.payer) } : {}),
      },
    },
  });

  const dados = pagamento.point_of_interaction?.transaction_data;
  if (!dados?.qr_code) {
    // Sem copia-e-cola a cobrança é inútil para quem vai pagar, e guardá-la
    // deixaria uma cobrança "pendente" que ninguém consegue quitar.
    throw new Error("O Mercado Pago não devolveu o copia-e-cola do PIX.");
  }

  return {
    externalId: String(pagamento.id ?? ""),
    status: pagamento.status ?? "pending",
    copyPaste: dados.qr_code,
    qrCodeBase64: dados.qr_code_base64 ?? "",
    expiresAt: paraData(pagamento.date_of_expiration, expiraEm),
  };
}

/**
 * Boleto (Bradesco).
 *
 * O endereço é obrigatório aqui e não era na Efí — por isso `faltaParaCobrar`
 * em `assinaturas.ts` passou a exigir CEP, rua, número, bairro, cidade e UF
 * antes de oferecer o boleto. Mandar sem endereço devolve 400 com uma
 * mensagem que não diz qual campo faltou.
 */
export async function createBoletoCharge(input: {
  amountCents: number;
  description: string;
  expireInDays?: number;
  payer: Pagador;
  idempotencyKey?: string;
}): Promise<BoletoCharge> {
  const vence = new Date(Date.now() + (input.expireInDays ?? 3) * 86_400_000);
  const nome = partirNome(input.payer.name);
  const endereco = input.payer.endereco;

  const pagamento = await chamarMercadoPago<PagamentoMP>("/v1/payments", {
    method: "POST",
    idempotencia: input.idempotencyKey,
    body: {
      transaction_amount: Number((input.amountCents / 100).toFixed(2)),
      description: input.description,
      payment_method_id: "bolbradesco",
      date_of_expiration: vence.toISOString(),
      payer: {
        email: input.payer.email,
        ...nome,
        ...(identificacao(input.payer) ? { identification: identificacao(input.payer) } : {}),
        ...(endereco
          ? {
              address: {
                zip_code: endereco.cep,
                street_name: endereco.rua,
                street_number: endereco.numero,
                neighborhood: endereco.bairro,
                city: endereco.cidade,
                federal_unit: endereco.uf,
              },
            }
          : {}),
      },
    },
  });

  const url =
    pagamento.transaction_details?.external_resource_url ??
    pagamento.point_of_interaction?.transaction_data?.ticket_url ??
    "";
  if (!url) throw new Error("O Mercado Pago não devolveu o link do boleto.");

  return {
    externalId: String(pagamento.id ?? ""),
    status: pagamento.status ?? "pending",
    boletoUrl: url,
    barcode: pagamento.barcode?.content ?? "",
    expiresAt: paraData(pagamento.date_of_expiration, vence),
  };
}

/**
 * Cartão, com o token que o navegador gerou.
 *
 * `installments` é o número de parcelas; o valor enviado já é o COM juros,
 * calculado em `lib/parcelamento` — a conta do parcelamento continua sendo
 * nossa, e não do gateway, para o cliente ver o mesmo número na simulação e na
 * fatura do cartão.
 */
export async function createCardCharge(input: {
  amountCents: number;
  description: string;
  installments: number;
  paymentToken: string;
  payer: Pagador;
  paymentMethodId?: string;
  issuerId?: string;
  idempotencyKey?: string;
}): Promise<{ externalId: string; status: string }> {
  const pagamento = await chamarMercadoPago<PagamentoMP>("/v1/payments", {
    method: "POST",
    idempotencia: input.idempotencyKey,
    body: {
      transaction_amount: Number((input.amountCents / 100).toFixed(2)),
      description: input.description,
      token: input.paymentToken,
      installments: input.installments,
      ...(input.paymentMethodId ? { payment_method_id: input.paymentMethodId } : {}),
      ...(input.issuerId ? { issuer_id: input.issuerId } : {}),
      payer: {
        email: input.payer.email,
        ...(identificacao(input.payer) ? { identification: identificacao(input.payer) } : {}),
      },
    },
  });

  return {
    externalId: String(pagamento.id ?? ""),
    status: pagamento.status ?? "pending",
  };
}

/**
 * Situação de um pagamento, direto na fonte.
 *
 * É o que o webhook usa: a notificação do Mercado Pago diz só o id, e quem
 * responde se entrou dinheiro é esta chamada. O corpo do POST é aviso, não
 * prova — a mesma regra que já valia para o Efí.
 */
export async function getPagamentoStatus(pagamentoId: string): Promise<string> {
  const pagamento = await chamarMercadoPago<PagamentoMP>(
    `/v1/payments/${encodeURIComponent(pagamentoId)}`,
  );
  return pagamento.status ?? "";
}

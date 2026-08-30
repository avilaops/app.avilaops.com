import { NextRequest, NextResponse } from "next/server";
import { baixarCobrancaPorIdExterno } from "@/lib/assinaturas";
import { getPagamentoStatus } from "@/lib/mercadopago-cobranca";
import { prisma } from "@/lib/prisma";

/**
 * Notificação do Mercado Pago sobre a mensalidade.
 *
 * Vale aqui a mesma regra do webhook do Efí, e pelo mesmo motivo: **o corpo do
 * POST é aviso, não prova**. Ele chega por HTTP, é reenviado pelo próprio
 * Mercado Pago, pode chegar fora de ordem e pode ser forjado por quem conheça
 * o formato. O id do pagamento é uma pista; quem diz se entrou dinheiro é a
 * API. Um POST forjado, no pior caso, faz uma consulta a mais.
 *
 * E **o endpoint é idempotente por natureza**: receber o mesmo evento dez
 * vezes tem que dar no mesmo. A baixa guarda o instante do pagamento e não
 * deixa cobrança paga voltar para pendente.
 *
 * O webhook do Efí continua no ar de propósito (`/api/webhooks/efi`): as
 * cobranças abertas nela ainda vão ser pagas. Este trata só as novas.
 */

/** Único estado do Mercado Pago que significa dinheiro liberado. */
const PAGO = "approved";

/**
 * Segredo na URL, igual ao do Efí.
 *
 * O Mercado Pago assina a notificação em `x-signature`, mas a assinatura
 * depende de um segredo por aplicação que ainda não está no servidor. Até lá,
 * o token na query tira o endpoint de "qualquer um chama" — e a confirmação
 * pela API continua sendo o que de fato protege o dinheiro.
 *
 * Sem `MP_WEBHOOK_TOKEN` configurado, segue aceitando.
 */
function autorizado(request: NextRequest): boolean {
  const esperado = process.env.MP_WEBHOOK_TOKEN?.trim();
  if (!esperado) return true;

  const recebido =
    request.nextUrl.searchParams.get("token") ??
    request.headers.get("x-webhook-token") ??
    "";

  return recebido === esperado;
}

/**
 * O id do pagamento, das três formas em que o Mercado Pago o manda.
 *
 * Webhooks novos usam `{ type: "payment", data: { id } }`; o IPN antigo manda
 * `?topic=payment&id=`; e algumas integrações mandam `{ resource }` com a URL
 * inteira. Aceitar as três é mais barato do que descobrir em produção qual
 * delas a conta está configurada para enviar.
 */
function idDoPagamento(
  request: NextRequest,
  body: Record<string, unknown> | null,
): string | null {
  const busca = request.nextUrl.searchParams;
  const tipo = String(body?.type ?? body?.topic ?? busca.get("topic") ?? busca.get("type") ?? "");

  if (tipo && !tipo.includes("payment")) return null;

  const dados = body?.data as { id?: unknown } | undefined;
  const bruto =
    (dados?.id !== undefined ? String(dados.id) : null) ??
    busca.get("id") ??
    (typeof body?.resource === "string" ? body.resource.split("/").pop() ?? null : null);

  if (!bruto) return null;

  // Só dígitos: o id do Mercado Pago é numérico, e qualquer outra coisa é
  // tentativa de fazer o endpoint consultar o que não é nosso.
  return /^\d+$/.test(bruto) ? bruto : null;
}

export async function POST(request: NextRequest) {
  if (!autorizado(request)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const pagamentoId = idDoPagamento(request, body);

  // Notificação de outro tópico (assinatura, estorno, contestação) não é erro:
  // devolver 4xx faria a fila do Mercado Pago repetir para sempre um evento
  // que nunca vai ser nosso.
  if (!pagamentoId) return NextResponse.json({ ok: true, ignorado: true });

  // Id que não bate com cobrança nossa não vira consulta à API — senão o
  // endpoint vira ferramenta de varredura de ids válidos.
  const cobranca = await prisma.subscriptionCharge.findFirst({
    where: { externalId: pagamentoId },
    select: { id: true, status: true },
  });

  if (!cobranca) return NextResponse.json({ ok: true, desconhecido: true });

  let situacao: string;
  try {
    situacao = await getPagamentoStatus(pagamentoId);
  } catch (erro) {
    console.error(`Falha ao confirmar o pagamento ${pagamentoId} no Mercado Pago`, erro);
    // 500 de propósito: aqui a dúvida é NOSSA (a API não respondeu), e o
    // reenvio do Mercado Pago é justamente o que vai resolver.
    return NextResponse.json({ error: "Falha ao confirmar o pagamento." }, { status: 500 });
  }

  // `rejected`, `cancelled` e `in_process` também são registrados: o cliente
  // precisa ver na tela que o cartão foi recusado, senão ele fica esperando um
  // "pendente" que nunca vai virar pago.
  await baixarCobrancaPorIdExterno(pagamentoId, situacao === PAGO ? "approved" : situacao);

  return NextResponse.json({ ok: true, status: situacao });
}

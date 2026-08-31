import { NextRequest, NextResponse } from "next/server";
import {
  createBoletoCharge,
  createPixCharge,
  type Pagador,
} from "@/lib/mercadopago-cobranca";
import { prisma } from "@/lib/prisma";

/**
 * Cobrança do entregável avulso, pelo link com token.
 *
 * Migrado da Efí para o Mercado Pago em 31/08/2026, fechando a decisão de
 * 30/08 ("só pelo Mercado Pago"). A mensalidade já tinha migrado; este era o
 * outro fluxo que continuava na Efí, e ele tem uma diferença que a mensalidade
 * não tem: **quem paga não é cliente cadastrado**. É alguém que recebeu um
 * link, e tudo o que se sabe dele é o que o entregável guardou (`recipient*`)
 * mais o que ele digitar agora.
 *
 * Por isso o pagador é montado em camadas, do mais específico para o mais
 * genérico: o que veio no formulário ganha do que está no entregável, que
 * ganha do cadastro da empresa. Sem isso o PIX pediria dados que a tela nunca
 * pede.
 */

type PayerBody = {
  name?: string;
  cpf?: string;
  email?: string;
};

type OrgDoEntregavel = {
  name: string;
  legalName: string | null;
  cpfCnpj: string | null;
  profile: {
    postalCode: string | null;
    street: string | null;
    number: string | null;
    district: string | null;
    city: string | null;
    state: string | null;
    email: string | null;
  } | null;
  contacts: { name: string; email: string | null }[];
};

/**
 * Endereço do boleto.
 *
 * Exigência do Mercado Pago que a Efí não tinha. Sai do cadastro da empresa
 * que emitiu o entregável, e não de quem paga: é a empresa que a gente conhece.
 */
function enderecoDaEmpresa(org: OrgDoEntregavel) {
  const p = org.profile;
  const cep = p?.postalCode?.replace(/\D/g, "") ?? "";

  if (!p || cep.length !== 8 || !p.street || !p.number || !p.district || !p.city || !p.state) {
    return undefined;
  }

  return {
    cep,
    rua: p.street,
    numero: p.number,
    bairro: p.district,
    cidade: p.city,
    uf: p.state.toUpperCase().slice(0, 2),
  };
}

function montarPagador(
  deliverable: { recipientName: string | null; recipientEmail: string | null },
  org: OrgDoEntregavel,
  informado: PayerBody | undefined,
): Pagador | null {
  const email =
    informado?.email?.trim() ||
    deliverable.recipientEmail ||
    org.profile?.email ||
    org.contacts[0]?.email ||
    "";

  // Sem e-mail o Mercado Pago recusa qualquer pagamento. É o único campo que
  // não tem de onde ser deduzido quando o entregável foi criado sem
  // destinatário.
  if (!email) return null;

  const nome =
    informado?.name?.trim() || deliverable.recipientName || org.contacts[0]?.name || org.name;

  const cpf = informado?.cpf?.replace(/\D/g, "") ?? "";
  const documento = org.cpfCnpj?.replace(/\D/g, "") ?? "";

  return {
    name: nome,
    cpf,
    email,
    company:
      documento.length === 14
        ? { cnpj: documento, corporateName: org.legalName ?? org.name }
        : undefined,
    endereco: enderecoDaEmpresa(org),
  };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const deliverable = await prisma.deliverable.findUnique({
    where: { accessToken: token },
    include: {
      organization: {
        select: {
          name: true,
          legalName: true,
          cpfCnpj: true,
          profile: {
            select: {
              postalCode: true,
              street: true,
              number: true,
              district: true,
              city: true,
              state: true,
              email: true,
            },
          },
          contacts: {
            orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
            take: 1,
            select: { name: true, email: true },
          },
        },
      },
    },
  });

  if (!deliverable) {
    return NextResponse.json({ error: "Entregável não encontrado." }, { status: 404 });
  }
  if (deliverable.status === "PAID") {
    return NextResponse.json({ error: "Este entregável já foi pago." }, { status: 409 });
  }
  if (deliverable.status !== "PUBLISHED") {
    return NextResponse.json({ error: "Entregável indisponível." }, { status: 409 });
  }

  const body = (await request.json().catch(() => null)) as {
    method?: "PIX" | "BOLETO";
    payer?: PayerBody;
  } | null;

  const amount = Number(deliverable.amount);
  const pagador = montarPagador(deliverable, deliverable.organization, body?.payer);

  if (!pagador) {
    return NextResponse.json(
      { error: "Informe o seu e-mail para gerar a cobrança." },
      { status: 400 },
    );
  }

  /*
    Chave de idempotência: entregável + método + minuto. Mesma regra da
    mensalidade — o minuto é a janela em que "de novo" é retry de rede, e não
    o cliente pedindo um código novo depois de o primeiro vencer.
  */
  const chaveIdempotencia = `entregavel:${deliverable.id}:${body?.method}:${Math.floor(
    Date.now() / 60_000,
  )}`;

  try {
    if (body?.method === "PIX") {
      const pix = await createPixCharge({
        amount,
        description: deliverable.title,
        payer: pagador,
        idempotencyKey: chaveIdempotencia,
      });

      await prisma.deliverableCharge.create({
        data: {
          deliverableId: deliverable.id,
          method: "PIX",
          externalId: pix.externalId,
          status: "PENDING",
          amount,
          pixCopyPaste: pix.copyPaste,
          pixQrBase64: pix.qrCodeBase64,
          expiresAt: pix.expiresAt,
        },
      });

      return NextResponse.json({
        method: "PIX",
        status: "PENDING",
        pixCopyPaste: pix.copyPaste,
        pixQrBase64: pix.qrCodeBase64,
      });
    }

    if (body?.method === "BOLETO") {
      const cpf = body.payer?.cpf?.replace(/\D/g, "") ?? "";
      const temDocumento = cpf.length === 11 || Boolean(pagador.company?.cnpj);

      if (!body.payer?.name?.trim() || !temDocumento) {
        return NextResponse.json(
          { error: "Informe nome e um CPF válido para gerar o boleto." },
          { status: 400 },
        );
      }

      // O endereço é exigência do Mercado Pago, e a mensagem precisa dizer de
      // QUEM é o endereço que falta: é o da empresa que emitiu, não o de quem
      // está pagando. Sem isto a API devolve 400 sem dizer qual campo faltou.
      if (!pagador.endereco) {
        return NextResponse.json(
          {
            error:
              "O boleto precisa do endereço completo da empresa emissora. Fale com a Avila Ops — o PIX funciona sem isso.",
          },
          { status: 400 },
        );
      }

      const boleto = await createBoletoCharge({
        amountCents: Math.round(amount * 100),
        description: deliverable.title,
        payer: pagador,
        idempotencyKey: chaveIdempotencia,
      });

      await prisma.deliverableCharge.create({
        data: {
          deliverableId: deliverable.id,
          method: "BOLETO",
          externalId: boleto.externalId,
          status: "PENDING",
          amount,
          boletoUrl: boleto.boletoUrl,
          boletoBarcode: boleto.barcode,
          expiresAt: boleto.expiresAt,
        },
      });

      return NextResponse.json({
        method: "BOLETO",
        status: "PENDING",
        boletoUrl: boleto.boletoUrl,
        boletoBarcode: boleto.barcode,
      });
    }

    return NextResponse.json({ error: "Método de pagamento inválido." }, { status: 400 });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Falha ao gerar a cobrança.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

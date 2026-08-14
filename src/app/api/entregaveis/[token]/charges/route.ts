import { NextRequest, NextResponse } from "next/server";
import { createBoletoCharge, createPixCharge } from "@/lib/efi-cobranca";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const deliverable = await prisma.deliverable.findUnique({
    where: { accessToken: token },
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
    payer?: { name?: string; cpf?: string; email?: string };
  } | null;

  const amount = Number(deliverable.amount);

  try {
    if (body?.method === "PIX") {
      const pix = await createPixCharge({
        amount,
        description: deliverable.title,
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
      const name = body.payer?.name?.trim();
      const cpf = body.payer?.cpf?.replace(/\D/g, "");
      const email = body.payer?.email?.trim();
      if (!name || !email || cpf?.length !== 11) {
        return NextResponse.json(
          { error: "Informe nome, e-mail e um CPF válido para gerar o boleto." },
          { status: 400 },
        );
      }

      const boleto = await createBoletoCharge({
        amountCents: Math.round(amount * 100),
        description: deliverable.title,
        payer: { name, cpf, email },
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

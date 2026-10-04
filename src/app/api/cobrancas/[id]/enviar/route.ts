import { NextRequest, NextResponse } from "next/server";
import { ehDono, getAdmin } from "@/lib/auth";
import { sameOrigin } from "@/lib/http";
import { CobrancaSemLink, enviarCobrancaPorEmail, enviarCobrancaPorWhatsapp } from "@/lib/entrega-cobranca";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * O operador envia uma cobrança já emitida ao cliente, por e-mail ou WhatsApp.
 *
 * Trava de segurança: o envio é em MODO DE TESTE por padrão. Para mandar ao
 * cliente de verdade, o corpo precisa dizer `teste: false` de propósito — não
 * dá para disparar a um cliente real sem essa escolha explícita. No teste, o
 * operador informa `destinoTeste` (o próprio e-mail/número).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdmin();
  if (!admin) {
    return NextResponse.json({ erro: "Faça login para continuar." }, { status: 401 });
  }
  // Dinheiro e contato com cliente são do dono.
  if (!ehDono(admin.role)) {
    return NextResponse.json({ erro: "Só o dono pode enviar cobrança." }, { status: 403 });
  }
  if (!sameOrigin(request)) {
    return NextResponse.json({ erro: "Origem não autorizada." }, { status: 403 });
  }

  const { id } = await params;
  const corpo = (await request.json().catch(() => null)) as
    | { canal?: unknown; teste?: unknown; destinoTeste?: unknown }
    | null;

  const canal = corpo?.canal === "whatsapp" ? "whatsapp" : corpo?.canal === "email" ? "email" : null;
  if (!canal) {
    return NextResponse.json({ erro: "Informe o canal: email ou whatsapp." }, { status: 400 });
  }

  // Só manda ao cliente real quando teste é EXPLICITAMENTE false.
  const teste = corpo?.teste !== false;
  const destinoTeste = typeof corpo?.destinoTeste === "string" ? corpo.destinoTeste.trim() : "";
  if (teste && !destinoTeste) {
    return NextResponse.json(
      { erro: "Em modo de teste, informe destinoTeste (seu e-mail ou número)." },
      { status: 400 },
    );
  }

  try {
    const opcoes = teste ? { destinoTeste } : undefined;
    const resultado =
      canal === "email"
        ? await enviarCobrancaPorEmail(id, opcoes)
        : await enviarCobrancaPorWhatsapp(id, opcoes);

    // Envio a cliente é ação externa: deixa rastro. Auditoria é para nós, não
    // pode derrubar o envio que acabou de dar certo.
    await prisma.operationsAuditEvent
      .create({
        data: {
          actorId: admin.id,
          action: "COBRANCA_ENVIADA",
          entityType: "SubscriptionCharge",
          entityId: id,
          metadata: { canal, teste, destino: resultado.destino, enviado: resultado.enviado },
        },
      })
      .catch((e) => console.error("[cobranca] não auditei o envio", e));

    if (!resultado.enviado) {
      return NextResponse.json(
        { erro: "O envio falhou no provedor. Veja o log do servidor.", destino: resultado.destino },
        { status: 502 },
      );
    }
    return NextResponse.json({ ok: true, canal, teste, destino: resultado.destino });
  } catch (erro) {
    if (erro instanceof CobrancaSemLink) {
      return NextResponse.json({ erro: erro.message }, { status: 409 });
    }
    console.error(`[cobranca] falha ao enviar ${id} por ${canal}`, erro);
    return NextResponse.json({ erro: "Não consegui enviar a cobrança." }, { status: 500 });
  }
}

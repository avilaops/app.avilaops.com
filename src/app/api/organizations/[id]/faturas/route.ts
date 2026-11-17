import { NextRequest, NextResponse } from "next/server"

import { criarCobrancaDaFatura, CobrancaIndisponivelError } from "@/lib/assinaturas"
import { ehDono, getAdmin } from "@/lib/auth"
import { criarFaturaPersonalizada, FaturaPersonalizadaErro } from "@/lib/fatura-personalizada"
import { cleanText, sameOrigin } from "@/lib/http"

function cents(value: unknown) {
  const normalized = cleanText(value, 30).replace(/\./g, "").replace(",", ".")
  const amount = Number(normalized)
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) : null
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdmin()
  if (!admin) return NextResponse.json({ error: "Não autorizado." }, { status: 401 })
  if (!ehDono(admin.role)) return NextResponse.json({ error: "Só o dono pode criar cobrança personalizada." }, { status: 403 })
  if (!sameOrigin(request)) return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 })
  const { id } = await params
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  const amountCents = cents(body?.valor)
  const description = cleanText(body?.descricao, 200)
  const competence = cleanText(body?.competencia, 7)
  const due = cleanText(body?.vencimento, 10)
  const method = cleanText(body?.metodo, 10).toUpperCase()
  const automaticNfse = body?.nfseAutomatica === true
  const fiscalServiceCode = cleanText(body?.codigoServico, 6) || null
  const fiscalDescription = cleanText(body?.descricaoFiscal, 2_000) || null
  if (!amountCents || !description || !/^20\d{2}-(?:0[1-9]|1[0-2])$/.test(competence) || !/^20\d{2}-\d{2}-\d{2}$/.test(due)) return NextResponse.json({ error: "Informe descrição, valor, competência e vencimento válidos." }, { status: 400 })
  if (method !== "PIX" && method !== "BOLETO") return NextResponse.json({ error: "Escolha PIX ou boleto." }, { status: 400 })
  try {
    const invoice = await criarFaturaPersonalizada({ organizationId: id, description, amountCents, competence, dueDate: new Date(`${due}T00:00:00Z`), currency: "BRL", automaticNfse, fiscalServiceCode, fiscalDescription }, admin.id)
    const charge = await criarCobrancaDaFatura({ invoiceId: invoice.id, metodo: method })
    return NextResponse.json({ ok: true, invoiceId: invoice.id, charge: { id: charge.id, method: charge.method, status: charge.status, pixCopyPaste: charge.pixCopyPaste, boletoUrl: charge.boletoUrl, boletoBarcode: charge.boletoBarcode, expiresAt: charge.expiresAt?.toISOString() ?? null } }, { status: 201 })
  } catch (error) {
    if (error instanceof FaturaPersonalizadaErro || error instanceof CobrancaIndisponivelError) return NextResponse.json({ error: error.message }, { status: 422 })
    throw error
  }
}

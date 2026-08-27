import { getAdmin } from "@/lib/auth";
import { criarLinkPagamento } from "@/lib/mercadopago";

/** Cria um link de cobrança avulsa na conta da Avila Ops. */
export async function POST(request: Request) {
  const admin = await getAdmin();
  if (!admin) return Response.json({ erro: "não autorizado" }, { status: 401 });

  const corpo = (await request.json().catch(() => null)) as
    | { titulo?: string; centavos?: number; referencia?: string; email?: string }
    | null;

  const titulo = corpo?.titulo?.trim();
  const centavos = Number(corpo?.centavos ?? 0);
  if (!titulo) return Response.json({ erro: "descreva o que está sendo cobrado" }, { status: 422 });
  if (!Number.isInteger(centavos) || centavos < 100) {
    return Response.json({ erro: "valor mínimo de R$ 1,00" }, { status: 422 });
  }

  try {
    const link = await criarLinkPagamento({
      titulo,
      valorCentavos: centavos,
      referencia: corpo?.referencia,
      emailPagador: corpo?.email,
    });
    return Response.json(link, { status: 201 });
  } catch (erro) {
    return Response.json({ erro: erro instanceof Error ? erro.message : "falhou" }, { status: 502 });
  }
}

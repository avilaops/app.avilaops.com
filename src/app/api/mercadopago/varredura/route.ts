import { getAdmin } from "@/lib/auth";
import { rodarVarreduraDeCobranca } from "@/lib/lojas-plataforma";

/** Roda agora a varredura que normalmente só acontece às 6h. */
export async function POST() {
  const admin = await getAdmin();
  if (!admin) return Response.json({ erro: "não autorizado" }, { status: 401 });
  try {
    return Response.json(await rodarVarreduraDeCobranca());
  } catch (erro) {
    return Response.json({ erro: erro instanceof Error ? erro.message : "falhou" }, { status: 502 });
  }
}

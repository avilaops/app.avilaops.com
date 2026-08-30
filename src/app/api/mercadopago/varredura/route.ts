import { ehDono, getAdmin } from "@/lib/auth";
import { rodarVarreduraDeCobranca } from "@/lib/lojas-plataforma";

/** Roda agora a varredura que normalmente só acontece às 6h. */
export async function POST() {
  const admin = await getAdmin();
  if (!admin) return Response.json({ erro: "não autorizado" }, { status: 401 });
  // Dinheiro, segredo e acesso são do dono; a equipe para aqui.
  if (!ehDono(admin.role)) return Response.json({ erro: "Só o dono da conta pode isto." }, { status: 403 });
  try {
    return Response.json(await rodarVarreduraDeCobranca());
  } catch (erro) {
    return Response.json({ erro: erro instanceof Error ? erro.message : "falhou" }, { status: 502 });
  }
}

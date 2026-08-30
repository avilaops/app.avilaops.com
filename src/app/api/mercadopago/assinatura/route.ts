import { ehDono, getAdmin } from "@/lib/auth";
import { agirNaAssinatura, type AcaoAssinatura } from "@/lib/lojas-plataforma";

/**
 * Repassa a ação para o lojas.avilaops.com. Não fala com o Mercado Pago.
 *
 * A validação de forma é lá — aqui só garantimos que quem pediu é admin e que
 * a ação é uma das quatro. Duplicar regra de negócio nas duas pontas seria
 * criar a segunda verdade que este desenho existe para evitar.
 */
export async function POST(request: Request) {
  const admin = await getAdmin();
  if (!admin) return Response.json({ erro: "não autorizado" }, { status: 401 });
  // Dinheiro, segredo e acesso são do dono; a equipe para aqui.
  if (!ehDono(admin.role)) return Response.json({ erro: "Só o dono da conta pode isto." }, { status: 403 });

  const corpo = (await request.json().catch(() => null)) as
    | { slug?: string; acao?: string; centavos?: number }
    | null;
  const slug = corpo?.slug;
  const acao = corpo?.acao;
  if (!slug || !acao) return Response.json({ erro: "slug e ação são obrigatórios" }, { status: 422 });

  const permitidas = ["cancelar", "pausar", "retomar", "valor"];
  if (!permitidas.includes(acao)) return Response.json({ erro: "ação desconhecida" }, { status: 422 });

  try {
    const payload = (acao === "valor"
      ? { acao: "valor", centavos: Number(corpo?.centavos ?? 0) }
      : { acao }) as AcaoAssinatura;
    return Response.json(await agirNaAssinatura(slug, payload));
  } catch (erro) {
    return Response.json({ erro: erro instanceof Error ? erro.message : "falhou" }, { status: 502 });
  }
}

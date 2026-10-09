import { ehDono, getAdmin } from "@/lib/auth";
import { agirNaAssinatura, type AcaoAssinatura } from "@/lib/lojas-plataforma";
import { prisma } from "@/lib/prisma";

/**
 * Repassa a ação para o lojas.avilaops.com. Não fala com o Mercado Pago.
 *
 * A validação de forma é lá — aqui só garantimos que quem pediu é admin e que
 * a ação é uma das cinco. Duplicar regra de negócio nas duas pontas seria
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

  const permitidas = ["iniciar", "cancelar", "pausar", "retomar", "valor"];
  if (!permitidas.includes(acao)) return Response.json({ erro: "ação desconhecida" }, { status: 422 });

  try {
    const payload = (acao === "valor"
      ? { acao: "valor", centavos: Number(corpo?.centavos ?? 0) }
      : { acao }) as AcaoAssinatura;
    const resultado = await agirNaAssinatura(slug, payload);
    // Só depois de a plataforma confirmar: o rastro é do que aconteceu, não do
    // que foi tentado. Quem, qual loja, qual ação e o estado que ficou — o
    // link de cartão não entra (é do lojista, e vale como acesso ao cadastro).
    await auditar(admin.id, slug, "LOJA_MENSALIDADE_ALTERADA", {
      acao,
      ...(acao === "valor" ? { centavos: Number(corpo?.centavos ?? 0) } : {}),
      assinaturaStatus: resultado.assinaturaStatus,
      statusDaLoja: resultado.status,
    });
    return Response.json(resultado);
  } catch (erro) {
    const motivo = erro instanceof Error ? erro.message : "falhou";
    // Tentativa recusada também fica: mexer em cobrança e não conseguir é fato.
    await auditar(admin.id, slug, "LOJA_MENSALIDADE_RECUSADA", { acao, motivo: motivo.slice(0, 200) });
    return Response.json({ erro: motivo }, { status: 502 });
  }
}

/** Falha ao gravar o rastro não desfaz a ação, que já aconteceu na plataforma — mas grita no log. */
async function auditar(atorId: string, slug: string, action: string, metadata: Record<string, string | number>) {
  try {
    await prisma.operationsAuditEvent.create({
      data: { actorId: atorId, action, entityType: "LojaDaPlataforma", entityId: slug, metadata },
    });
  } catch (erro) {
    console.error(`[lojas] SEM RASTRO: ${action} de ${slug} não foi gravada na auditoria`, metadata, erro);
  }
}

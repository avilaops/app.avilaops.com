import { prisma } from "@/lib/prisma";

/**
 * Dados que o cliente vê da própria empresa.
 *
 * Uma consulta só, sempre filtrada por `organizationId` — o id vem da conta
 * autenticada (`portal_clients.organization_id`), nunca da URL. É essa regra
 * que separa "área do cliente" de "painel da equipe com menos botões": aqui não
 * existe caminho para pedir a empresa de outro.
 *
 * Só entra o que é do cliente por direito: a empresa dele, os domínios dele, o
 * que ele assina, o que já foi entregue e em que pé está a implantação. Nada de
 * margem, custo, tarefa interna ou anotação da equipe.
 */
export type PainelDoCliente = {
  empresa: {
    id: string;
    nome: string;
    razaoSocial: string | null;
    documento: string | null;
    status: string;
    site: string | null;
    desde: Date;
  };
  contatos: Array<{ nome: string; email: string | null; telefone: string | null; principal: boolean }>;
  dominios: Array<{ fqdn: string; status: string; expiraEm: Date | null; renovacaoAutomatica: boolean }>;
  assinaturas: Array<{ id: string; descricao: string; valor: number; moeda: string; diaDaCobranca: number; status: string; desde: Date }>;
  entregas: Array<{ id: string; titulo: string; status: string; valor: number; criadoEm: Date; token: string }>;
  etapas: Array<{ rotulo: string; status: string; concluidaEm: Date | null; prazo: Date | null }>;
};

export async function carregarPainelDoCliente(organizationId: string): Promise<PainelDoCliente | null> {
  const empresa = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      id: true,
      name: true,
      legalName: true,
      cpfCnpj: true,
      status: true,
      siteUrl: true,
      createdAt: true,
      contacts: {
        orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
        take: 5,
        select: { name: true, email: true, phone: true, whatsapp: true, isPrimary: true },
      },
      domains: {
        orderBy: { fqdn: "asc" },
        select: { fqdn: true, status: true, expiresAt: true, autoRenew: true },
      },
      subscriptions: {
        orderBy: [{ status: "asc" }, { startedAt: "desc" }],
        select: { id: true, description: true, amount: true, currency: true, billingDay: true, status: true, startedAt: true },
      },
      deliverables: {
        orderBy: { createdAt: "desc" },
        take: 10,
        select: { id: true, title: true, status: true, amount: true, createdAt: true, accessToken: true },
      },
      onboardingSteps: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: { label: true, status: true, completedAt: true, dueDate: true },
      },
    },
  });

  if (!empresa) return null;

  return {
    empresa: {
      id: empresa.id,
      nome: empresa.name,
      razaoSocial: empresa.legalName,
      documento: empresa.cpfCnpj,
      status: empresa.status,
      site: empresa.siteUrl,
      desde: empresa.createdAt,
    },
    contatos: empresa.contacts.map((c) => ({
      nome: c.name,
      email: c.email,
      telefone: c.whatsapp ?? c.phone,
      principal: c.isPrimary,
    })),
    dominios: empresa.domains.map((d) => ({
      fqdn: d.fqdn,
      status: d.status,
      expiraEm: d.expiresAt,
      renovacaoAutomatica: d.autoRenew,
    })),
    assinaturas: empresa.subscriptions.map((s) => ({
      id: s.id,
      descricao: s.description,
      valor: Number(s.amount),
      moeda: s.currency,
      diaDaCobranca: s.billingDay,
      status: s.status,
      desde: s.startedAt,
    })),
    entregas: empresa.deliverables.map((d) => ({
      id: d.id,
      titulo: d.title,
      status: d.status,
      valor: Number(d.amount),
      criadoEm: d.createdAt,
      token: d.accessToken,
    })),
    etapas: empresa.onboardingSteps.map((e) => ({
      rotulo: e.label,
      status: e.status,
      concluidaEm: e.completedAt,
      prazo: e.dueDate,
    })),
  };
}

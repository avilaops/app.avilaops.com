import { prisma } from "@/lib/prisma";
import { participaDaEmpresa } from "@/lib/nucleo/acesso";

/**
 * Dados que o cliente vê da própria empresa.
 *
 * Consultas filtradas por `organizationId`, após validar participação vigente
 * no núcleo. Identidade e empresa vêm da sessão, nunca do corpo da requisição. É essa regra
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
    pais: string;
    desde: Date;
  };
  contatos: Array<{ nome: string; email: string | null; telefone: string | null; principal: boolean }>;
  dominios: Array<{ fqdn: string; status: string; expiraEm: Date | null; renovacaoAutomatica: boolean }>;
  assinaturas: Array<{ id: string; descricao: string; valor: number; moeda: string; ciclo: string; diaDaCobranca: number; status: string; desde: Date }>;
  /**
   * Faturas do cliente, abertas primeiro.
   *
   * Até 31/08/2026 o portal mostrava o plano e escondia a conta: quem quisesse
   * pagar tinha que pedir o Pix por WhatsApp. Aqui vem a fatura com a cobrança
   * que já existe, quando existe, para não gerar um Pix novo a cada visita.
   */
  totais: Array<{ moeda: string; emAberto: number; vencido: number }>;
  recorrencia: Array<{ moeda: string; ciclo: string; valor: number }>;
  faturas: Array<{
    id: string;
    descricao: string;
    competencia: string;
    tipo: string;
    valor: number;
    saldo: number;
    moeda: string;
    vencimento: Date;
    status: string;
    pagaEm: Date | null;
    cobranca: { metodo: string; pixCopiaECola: string | null; boletoUrl: string | null; checkoutUrl: string | null; expiraEm: Date | null } | null;
  }>;
  entregas: Array<{ id: string; titulo: string; status: string; valor: number; criadoEm: Date; token: string }>;
  etapas: Array<{ rotulo: string; status: string; concluidaEm: Date | null; prazo: Date | null }>;
};

export async function carregarPainelDoCliente(identityId: string, organizationId: string): Promise<PainelDoCliente | null> {
  if (!(await participaDaEmpresa(identityId, organizationId))) return null;
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
      profile: { select: { country: true } },
      addresses: {
        orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
        take: 1,
        select: { country: true },
      },
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
        select: {
          id: true,
          description: true,
          amount: true,
          currency: true,
          billingDay: true,
          billingCycle: true,
          status: true,
          startedAt: true,

        },
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

  const [totais, recorrencia, recebiveis] = await Promise.all([
    prisma.$queryRaw<{ currency: string; outstanding: unknown; overdue: unknown }[]>`
      SELECT currency,outstanding,overdue FROM core.receivable_totals
      WHERE organization_id=${organizationId} ORDER BY currency`,
    prisma.$queryRaw<{ currency: string; billing_cycle: string; contracted_amount: unknown }[]>`
      SELECT currency,billing_cycle,contracted_amount FROM core.subscription_totals
      WHERE organization_id=${organizationId} ORDER BY currency,billing_cycle`,
    prisma.$queryRaw<{ source_id: string; currency: string; outstanding: unknown; effective_status: string }[]>`
      SELECT source_id,currency,outstanding,effective_status FROM core.receivables
      WHERE organization_id=${organizationId} AND source='INVOICE'
      ORDER BY (outstanding>0) DESC,CASE WHEN outstanding>0 THEN due_date END ASC,due_date DESC,source_id LIMIT 12`,
  ]);
  const invoices = await prisma.subscriptionInvoice.findMany({
    where: { id: { in: recebiveis.map(r => r.source_id) }, subscription: { organizationId } },
    select: {
      id: true, competence: true, kind: true, amount: true, dueDate: true, paidAt: true,
      subscription: { select: { description: true } },
      charges: {
        where: { status: { in: ["CREATED", "PENDING", "WAITING"] }, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
        orderBy: { createdAt: "desc" }, take: 1,
        select: { method: true, pixCopyPaste: true, boletoUrl: true, checkoutUrl: true, expiresAt: true },
      },
    },
  });
  const byId = new Map(invoices.map(f => [f.id, f]));
  return {
    totais: totais.map(t => ({ moeda: t.currency, emAberto: Number(t.outstanding), vencido: Number(t.overdue) })),
    recorrencia: recorrencia.map(t => ({ moeda: t.currency, ciclo: t.billing_cycle, valor: Number(t.contracted_amount) })),
    empresa: {
      id: empresa.id,
      nome: empresa.name,
      razaoSocial: empresa.legalName,
      documento: empresa.cpfCnpj,
      status: empresa.status,
      site: empresa.siteUrl,
      desde: empresa.createdAt,
      pais: empresa.addresses[0]?.country ?? empresa.profile?.country ?? "Brasil",
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
      ciclo: s.billingCycle,
      diaDaCobranca: s.billingDay,
      status: s.status,
      desde: s.startedAt,
    })),
    faturas: recebiveis.flatMap(r => {
      const f = byId.get(r.source_id);
      if (!f) return [];
      const c = f.charges[0];
      return [{
        id: f.id, descricao: f.subscription.description, competencia: f.competence,
        tipo: f.kind, valor: Number(f.amount), saldo: Number(r.outstanding), moeda: r.currency,
        vencimento: f.dueDate, status: r.effective_status, pagaEm: f.paidAt,
        // A cobrança legada é pelo valor integral. Não oferecê-la após alocação parcial.
        cobranca: c && Number(r.outstanding) === Number(f.amount) ? {
          metodo: c.method, pixCopiaECola: c.pixCopyPaste, boletoUrl: c.boletoUrl,
          checkoutUrl: c.checkoutUrl, expiraEm: c.expiresAt,
        } : null,
      }];
    }),
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

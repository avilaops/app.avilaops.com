import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import LeadsPanel from "@/components/LeadsPanel";
import { getAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Leads: da entrada à proposta.
 *
 * **Por que a tela nasceu em 10/09/2026.** O formulário do avilaops.com grava
 * em `operations.leads` desde sempre, a Visão central contava "Leads abertos",
 * e não existia uma única tela mostrando quem eram. O lead entrava, virava
 * número no painel e sumia: quem preenchesse o formulário dependia do e-mail de
 * aviso chegar e alguém lembrar. Contar sem mostrar é a pior combinação, porque
 * parece que a casa está olhando.
 */
export default async function LeadsPage() {
  const admin = await getAdmin();
  if (!admin) redirect("/login");

  const leads = await prisma.lead.findMany({
    include: { organization: { select: { id: true, name: true } } },
    // Quem tem próxima ação marcada vem primeiro, e depois o mais recente: a
    // ordem responde "com quem eu falo agora", não "o que entrou por último".
    orderBy: [{ nextActionAt: "asc" }, { createdAt: "desc" }],
    take: 200,
  });

  return (
    <AppShell adminName={admin.nome} papel={admin.role} section="leads">
      <header className="page-header operations-header">
        <div>
          <h1>Leads</h1>
          <p>Quem pediu contato e ainda não virou cliente.</p>
        </div>
      </header>

      <LeadsPanel
        leads={leads.map((lead) => ({
          id: lead.id,
          empresa: lead.companyName,
          contato: lead.contactName,
          telefone: lead.contactPhone,
          canal: lead.channel,
          estagio: lead.stage,
          valorEstimado: lead.estimatedValue ? Number(lead.estimatedValue.toString()) : null,
          notas: lead.notes,
          proximaAcaoEm: lead.nextActionAt?.toISOString() ?? null,
          criadoEm: lead.createdAt.toISOString(),
          cliente: lead.organization,
        }))}
      />
    </AppShell>
  );
}

import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import MetaBusinessPanel from "@/components/MetaBusinessPanel";
import MetaOperationsNav from "@/components/MetaOperationsNav";
import { getAdmin } from "@/lib/auth";
import { getMetaConnectionStatus, metaRedirectUri } from "@/lib/meta";
import { prisma } from "@/lib/prisma";

export default async function MetaOperationsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; connected?: string; organizationId?: string }>;
}) {
  const admin = await getAdmin();
  if (!admin) redirect("/login");

  const params = await searchParams;
  const organizations = await prisma.organization.findMany({
    where: { status: { not: "ARCHIVED" } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, status: true },
  });
  const selectedOrganizationId = params.organizationId || organizations[0]?.id || "";
  const status = await getMetaConnectionStatus(selectedOrganizationId || null);
  const appUrl = process.env.APP_URL || "https://app.avilaops.com";
  const callbackUrl = metaRedirectUri(appUrl);
  const webhookUrl = `${appUrl.replace(/\/$/, "")}/api/webhooks/meta`;

  return (
    <AppShell adminName={admin.nome} section="meta">
      <header className="page-header operations-header">
        <div>
          <h1>Meta Business</h1>
          <p>Contas, formulários e webhooks ligados à operação.</p>
        </div>
      </header>

      <MetaOperationsNav active="connection" organizationId={selectedOrganizationId} />

      <section className="operations-grid">
        <MetaBusinessPanel
          initialStatus={status}
          organizations={organizations}
          selectedOrganizationId={selectedOrganizationId}
          callbackUrl={callbackUrl}
          webhookUrl={webhookUrl}
          error={params.error}
          connected={params.connected === "1"}
        />
      </section>
    </AppShell>
  );
}

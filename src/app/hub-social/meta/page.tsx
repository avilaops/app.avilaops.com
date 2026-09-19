import { redirect } from "next/navigation";
import BadgeStatus from "@/components/sistema/Status";
import CabecalhoPagina from "@/components/hub-social/CabecalhoPagina";
import MetaBusinessPanel from "@/components/MetaBusinessPanel";
import MetaClientSelect from "@/components/MetaClientSelect";
import MetaOperationsNav from "@/components/MetaOperationsNav";
import { getAdmin } from "@/lib/auth";
import { estadoDoInstagram } from "@/lib/instagram";
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
  const lidoEm = new Date().toISOString();
  const organizations = await prisma.organization.findMany({
    where: { status: { not: "ARCHIVED" } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, status: true },
  });
  const selectedOrganizationId = params.organizationId || organizations[0]?.id || "";
  const status = await getMetaConnectionStatus(selectedOrganizationId || null);
  const instagram = await estadoDoInstagram(selectedOrganizationId);
  const appUrl = process.env.APP_URL || "https://app.avilaops.com";
  const callbackUrl = await metaRedirectUri(appUrl);
  const webhookUrl = `${appUrl.replace(/\/$/, "")}/api/webhooks/meta`;

  return (
    <div className="space-y-6">
      <CabecalhoPagina
        titulo="Meta Business"
        subtitulo="Contas, formulários e webhooks ligados à operação."
        meta={<BadgeStatus status={status.connected ? "connected" : "pending"} />}
      />

      <MetaOperationsNav active="connection" organizationId={selectedOrganizationId} />

      <MetaClientSelect
        organizations={organizations}
        selectedOrganizationId={selectedOrganizationId}
        action="/hub-social/meta"
      />

      <MetaBusinessPanel
        initialStatus={status}
        selectedOrganizationId={selectedOrganizationId}
        callbackUrl={callbackUrl}
        webhookUrl={webhookUrl}
        error={params.error}
        connected={params.connected === "1"}
        lidoEm={lidoEm}
        instagram={instagram}
      />
    </div>
  );
}

import { redirect } from "next/navigation";
import BadgeStatus from "@/components/sistema/Status";
import CabecalhoPagina from "@/components/hub-social/CabecalhoPagina";
import MetaBusinessPanel from "@/components/MetaBusinessPanel";
import MetaClientSelect from "@/components/MetaClientSelect";
import MetaOperationsNav from "@/components/MetaOperationsNav";
import { getAdmin } from "@/lib/auth";
import { estadoDoInstagram, instagramConfigurado } from "@/lib/instagram";
import { getMetaConnectionStatus, metaRedirectUri } from "@/lib/meta";
import { prisma } from "@/lib/prisma";
import { obterCredencial } from "@/lib/credenciais";
import { threadsCallback } from "@/lib/threads";

export default async function MetaOperationsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; connected?: string; threads?: string; organizationId?: string }>;
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
  const [instagram, instagramPronto] = await Promise.all([
    estadoDoInstagram(selectedOrganizationId),
    instagramConfigurado(),
  ]);
  const instagramAtivo =
    instagram?.conexao.status === "ACTIVE" &&
    (!instagram.conexao.tokenExpiresAt || new Date(instagram.conexao.tokenExpiresAt) > new Date());
  const appUrl = process.env.APP_URL || "https://app.avilaops.com";
  const [threadsApp, threadsSecret, threadsConnection] = await Promise.all([
    obterCredencial("THREADS_APP_ID"), obterCredencial("THREADS_APP_SECRET"),
    prisma.organizationIntegrationConnection.findUnique({
      where: { organizationId_provider: { organizationId: selectedOrganizationId, provider: "threads_login" } },
      select: { accountName: true, status: true, tokenExpiresAt: true },
    }),
  ]);
  const threadsAccount = threadsConnection?.status === "ACTIVE" && threadsConnection.tokenExpiresAt && threadsConnection.tokenExpiresAt > new Date() ? threadsConnection.accountName : null;
  const callbackUrl = await metaRedirectUri(appUrl);
  const webhookUrl = `${appUrl.replace(/\/$/, "")}/api/webhooks/meta`;

  return (
    <div className="space-y-6">
      <CabecalhoPagina
        titulo="Meta Business"
        subtitulo="Contas, formulários e webhooks ligados à operação."
        meta={<BadgeStatus status={status.connected || threadsAccount || instagramAtivo ? "connected" : "pending"} />}
      />

      <MetaOperationsNav active="connection" organizationId={selectedOrganizationId} />

      <MetaClientSelect
        organizations={organizations}
        selectedOrganizationId={selectedOrganizationId}
        action="/hub-social/meta"
      />

      <MetaBusinessPanel
        key={selectedOrganizationId}
        initialStatus={status}
        threadsConfigured={Boolean(threadsApp && threadsSecret && process.env.META_TOKEN_ENCRYPTION_KEY)}
        threadsAccount={threadsAccount}
        threadsConnected={params.threads === "1" && Boolean(threadsAccount)}
        selectedOrganizationId={selectedOrganizationId}
        callbackUrl={callbackUrl}
        threadsCallbackUrl={threadsCallback(appUrl)}
        webhookUrl={webhookUrl}
        error={params.error}
        connected={params.connected === "1"}
        lidoEm={lidoEm}
        instagram={instagram}
        instagramPronto={instagramPronto}
      />
    </div>
  );
}

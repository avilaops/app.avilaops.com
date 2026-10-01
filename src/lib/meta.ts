import crypto from "crypto";
import type { Prisma } from "@prisma/client";
import { exigirCredencial, obterCredencial } from "@/lib/credenciais";
import { prisma } from "@/lib/prisma";

export const META_PROVIDER = "meta_business";
const STATE_COOKIE = "avila_meta_oauth_state";

type MetaTokenResponse = {
  access_token: string;
  token_type?: string;
  expires_in?: number;
};

type MetaUser = {
  id: string;
  name?: string;
};

type MetaBusiness = {
  id: string;
  name?: string;
  verification_status?: string;
  timezone_id?: string | number;
};

type MetaPage = {
  id: string;
  name?: string;
  username?: string;
  category?: string;
  link?: string;
  tasks?: string[];
  instagram_business_account?: {
    id: string;
    username?: string;
    name?: string;
    profile_picture_url?: string;
    followers_count?: number;
    media_count?: number;
  };
};

type MetaLeadForm = {
  id: string;
  name?: string;
  status?: string;
  questions?: unknown[];
};

type MetaLeadDetails = {
  id: string;
  created_time?: string;
  field_data?: unknown[];
  form_id?: string;
  ad_id?: string;
  campaign_id?: string;
  raw?: unknown;
};

type MetaAdAccount = {
  id: string;
  name?: string;
  currency?: string;
  timezone_name?: string;
  account_status?: number | string;
  business?: {
    id: string;
    name?: string;
  };
};

type MetaCampaign = {
  id: string;
  name?: string;
  status?: string;
  objective?: string;
};

type MetaCampaignInsight = {
  spend?: string;
  impressions?: string;
  clicks?: string;
  actions?: Array<{
    action_type?: string;
    value?: string;
  }>;
  date_start?: string;
  date_stop?: string;
};

type GraphList<T> = {
  data?: T[];
};

type MetaWebhookPayload = {
  object?: string;
  entry?: Array<{
    id?: string;
    time?: number;
    changes?: Array<{
      field?: string;
      value?: {
        leadgen_id?: string;
        form_id?: string;
        page_id?: string;
        ad_id?: string;
        created_time?: number;
      };
    }>;
  }>;
};

export type MetaConnectionStatus = {
  organizationId: string | null;
  connected: boolean;
  configured: boolean;
  connection: {
    id: string;
    status: string;
    lastSyncedAt: string | null;
    lastSyncStatus: string | null;
    lastSyncError: string | null;
    userName?: string;
    userId?: string;
    tokenExpiresAt?: string;
  } | null;
  counts: {
    businesses: number;
    pages: number;
    instagramAccounts: number;
    adAccounts: number;
    leadForms: number;
    leads: number;
    campaignSnapshots: number;
    webhookEvents: number;
  };
};

export async function metaGraphVersion() {
  return (await obterCredencial("META_GRAPH_VERSION")) || "v25.0";
}

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} não configurado`);
  return value;
}

function jsonValue(value: unknown): Prisma.InputJsonValue | undefined {
  return value === undefined ? undefined : (value as Prisma.InputJsonValue);
}

export async function metaRedirectUri(origin: string) {
  return (
    (await obterCredencial("META_REDIRECT_URI")) ||
    `${origin.replace(/\/$/, "")}/api/integrations/meta/oauth/callback`
  );
}

export async function metaOAuthScopes() {
  return (
    (await obterCredencial("META_OAUTH_SCOPES")) ||
    [
      "business_management",
      "pages_show_list",
      "pages_read_engagement",
      "instagram_basic",
      "ads_read",
      "leads_retrieval",
    ].join(",")
  );
}

export function createMetaOAuthState() {
  return crypto.randomBytes(24).toString("hex");
}

export function encodeMetaOAuthState(organizationId: string) {
  return `${organizationId}.${createMetaOAuthState()}`;
}

export function decodeMetaOAuthState(value: string | null) {
  if (!value) return null;
  const [organizationId, nonce] = value.split(".");
  if (!organizationId || !nonce) return null;
  return { organizationId, nonce };
}

export { STATE_COOKIE as META_STATE_COOKIE };

function tokenKey() {
  return crypto
    .createHash("sha256")
    .update(requiredEnv("META_TOKEN_ENCRYPTION_KEY"))
    .digest();
}

function encryptToken(token: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", tokenKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

function decryptToken(value: string) {
  const [ivRaw, tagRaw, encryptedRaw] = value.split(".");
  if (!ivRaw || !tagRaw || !encryptedRaw) {
    throw new Error("Token Meta armazenado em formato inválido");
  }

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    tokenKey(),
    Buffer.from(ivRaw, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

/**
 * Assinatura exigida pela Meta quando o app tem "a chave secreta está
 * incorporada no cliente" ligado. Sem ela toda chamada de servidor volta
 * `API calls from the server require an appsecret_proof argument` — foi o que
 * derrubou o Hub Social no app recriado em 17/09/2026.
 *
 * Mandar sempre é mais seguro e não atrapalha quando a exigência está
 * desligada: a Meta simplesmente confere e segue.
 */
async function appsecretProof(accessToken: string) {
  const appSecret = await obterCredencial("META_APP_SECRET");
  if (!appSecret) return null;
  return crypto.createHmac("sha256", appSecret).update(accessToken).digest("hex");
}

async function graphGet<T>(path: string, accessToken: string, params?: Record<string, string>) {
  const url = new URL(`https://graph.facebook.com/${await metaGraphVersion()}${path}`);
  url.searchParams.set("access_token", accessToken);

  const proof = await appsecretProof(accessToken);
  if (proof) url.searchParams.set("appsecret_proof", proof);

  for (const [key, value] of Object.entries(params ?? {})) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url, { cache: "no-store" });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      typeof data?.error?.message === "string"
        ? data.error.message
        : "Falha ao consultar a Meta Graph API.";
    throw new Error(message);
  }

  return data as T;
}

export async function buildMetaLoginUrl(origin: string, state: string) {
  const appId = await exigirCredencial("META_APP_ID");
  const url = new URL(`https://www.facebook.com/${await metaGraphVersion()}/dialog/oauth`);
  url.searchParams.set("client_id", appId);
  url.searchParams.set("redirect_uri", await metaRedirectUri(origin));
  url.searchParams.set("state", state);
  url.searchParams.set("scope", await metaOAuthScopes());
  url.searchParams.set("response_type", "code");
  return url;
}

export async function exchangeMetaCode(origin: string, code: string) {
  const tokenUrl = new URL(`https://graph.facebook.com/${await metaGraphVersion()}/oauth/access_token`);
  tokenUrl.searchParams.set("client_id", await exigirCredencial("META_APP_ID"));
  tokenUrl.searchParams.set("client_secret", await exigirCredencial("META_APP_SECRET"));
  tokenUrl.searchParams.set("redirect_uri", await metaRedirectUri(origin));
  tokenUrl.searchParams.set("code", code);

  const shortResponse = await fetch(tokenUrl, { cache: "no-store" });
  const shortToken = (await shortResponse.json().catch(() => null)) as MetaTokenResponse | null;
  if (!shortResponse.ok || !shortToken?.access_token) {
    throw new Error("Não foi possível trocar o código OAuth da Meta.");
  }

  const longUrl = new URL(`https://graph.facebook.com/${await metaGraphVersion()}/oauth/access_token`);
  longUrl.searchParams.set("grant_type", "fb_exchange_token");
  longUrl.searchParams.set("client_id", await exigirCredencial("META_APP_ID"));
  longUrl.searchParams.set("client_secret", await exigirCredencial("META_APP_SECRET"));
  longUrl.searchParams.set("fb_exchange_token", shortToken.access_token);

  const longResponse = await fetch(longUrl, { cache: "no-store" });
  const longToken = (await longResponse.json().catch(() => null)) as MetaTokenResponse | null;
  if (!longResponse.ok || !longToken?.access_token) {
    throw new Error("Não foi possível gerar token longo da Meta.");
  }

  const user = await graphGet<MetaUser>("/me", longToken.access_token, {
    fields: "id,name",
  });

  const tokenExpiresAt = longToken.expires_in
    ? new Date(Date.now() + longToken.expires_in * 1000)
    : null;

  return {
    accessToken: longToken.access_token,
    tokenType: longToken.token_type ?? shortToken.token_type ?? "bearer",
    tokenExpiresAt,
    user,
  };
}

export async function saveMetaConnection(input: {
  actorId: string;
  organizationId: string;
  accessToken: string;
  tokenType: string;
  tokenExpiresAt: Date | null;
  user: MetaUser;
}) {
  const encryptedAccessToken = encryptToken(input.accessToken);
  const escopos = await metaOAuthScopes();

  return prisma.$transaction(async (transaction) => {
    const connection = await transaction.organizationIntegrationConnection.upsert({
      where: {
        organizationId_provider: {
          organizationId: input.organizationId,
          provider: META_PROVIDER,
        },
      },
      create: {
        organizationId: input.organizationId,
        provider: META_PROVIDER,
        externalId: input.user.id,
        accountName: input.user.name ?? null,
        status: "ACTIVE",
        tokenCiphertext: encryptedAccessToken,
        tokenType: input.tokenType,
        tokenExpiresAt: input.tokenExpiresAt,
        scopes: escopos.split(","),
        lastSyncedAt: new Date(),
        lastSyncStatus: "CONNECTED",
        metadata: {
          userId: input.user.id,
          userName: input.user.name ?? null,
          graphVersion: await metaGraphVersion(),
        },
      },
      update: {
        externalId: input.user.id,
        accountName: input.user.name ?? null,
        status: "ACTIVE",
        tokenCiphertext: encryptedAccessToken,
        tokenType: input.tokenType,
        tokenExpiresAt: input.tokenExpiresAt,
        scopes: escopos.split(","),
        lastSyncedAt: new Date(),
        lastSyncStatus: "CONNECTED",
        lastSyncError: null,
        metadata: {
          userId: input.user.id,
          userName: input.user.name ?? null,
          graphVersion: await metaGraphVersion(),
        },
      },
    });

    await transaction.operationsAuditEvent.create({
      data: {
        actorId: input.actorId,
        action: "META_BUSINESS_CONNECTED",
        entityType: "OrganizationIntegrationConnection",
        entityId: connection.id,
        organizationId: input.organizationId,
        metadata: {
          provider: META_PROVIDER,
          userId: input.user.id,
          userName: input.user.name ?? null,
        },
      },
    });

    return connection;
  });
}

async function getStoredMetaToken(organizationId: string) {
  const connection = await prisma.organizationIntegrationConnection.findUnique({
    where: {
      organizationId_provider: {
        organizationId,
        provider: META_PROVIDER,
      },
    },
  });
  const encryptedAccessToken = connection?.tokenCiphertext ?? "";
  if (!connection || !encryptedAccessToken) {
    throw new Error("Meta Business ainda não está conectado.");
  }

  return { connection, accessToken: decryptToken(encryptedAccessToken) };
}

/** Token de página restrito à conexão da empresa e ao destino escolhido. Nunca retorna ao navegador. */
export async function tokenParaPublicacaoMeta(organizationId: string, canal: "instagram" | "facebook", destino: string) {
  const {connection,accessToken}=await getStoredMetaToken(organizationId);
  if(connection.status!=="ACTIVE" || (connection.tokenExpiresAt && connection.tokenExpiresAt.getTime()<=Date.now())) throw new Error("CONEXAO_META_INATIVA");
  let cursor="";
  for(let pagina=0;pagina<5;pagina++) {
    const url=new URL(`https://graph.facebook.com/${await metaGraphVersion()}/me/accounts`);
    url.searchParams.set("fields","id,access_token,instagram_business_account{id}");
    url.searchParams.set("limit","100");
    const proof=await appsecretProof(accessToken);
    if(proof)url.searchParams.set("appsecret_proof",proof);
    if(cursor)url.searchParams.set("after",cursor);
    const response=await fetch(url,{headers:{Authorization:`Bearer ${accessToken}`},signal:AbortSignal.timeout(10000),redirect:"error",cache:"no-store"});
    if(!response.ok)throw new Error("CONEXAO_META_SEM_ACESSO");
    const dados=await response.json() as {data?:{id:string;access_token?:string;instagram_business_account?:{id:string}}[];paging?:{next?:string;cursors?:{after?:string}}};
    const conta=dados.data?.find(p=>canal==="facebook"?p.id===destino:p.instagram_business_account?.id===destino);
    if(conta?.access_token)return conta.access_token;
    if(!dados.paging?.next || !dados.paging.cursors?.after)break;
    cursor=dados.paging.cursors.after;
  }
  throw new Error("DESTINO_META_FORA_DA_CONEXAO");
}

export async function syncMetaBusiness(actorId: string, organizationId: string) {
  const { connection, accessToken } = await getStoredMetaToken(organizationId);

  try {
    const [businesses, pages, adAccounts] = await Promise.all([
      graphGet<GraphList<MetaBusiness>>("/me/businesses", accessToken, {
        fields: "id,name,verification_status,timezone_id",
        limit: "100",
      }),
      graphGet<GraphList<MetaPage>>("/me/accounts", accessToken, {
        fields:
          "id,name,username,category,link,tasks,instagram_business_account{id,username,name,profile_picture_url,followers_count,media_count}",
        limit: "100",
      }),
      graphGet<GraphList<MetaAdAccount>>("/me/adaccounts", accessToken, {
        fields: "id,name,currency,timezone_name,account_status,business{id,name}",
        limit: "100",
      }),
    ]);

    const businessByExternalId = new Map<string, string>();

    for (const business of businesses.data ?? []) {
      const saved = await prisma.metaBusinessAccount.upsert({
        where: { businessId: business.id },
        create: {
          businessId: business.id,
          name: business.name ?? business.id,
          organizationId,
          verificationStatus: business.verification_status ?? null,
          timezone: business.timezone_id === undefined ? null : String(business.timezone_id),
          rawMetadata: business,
          lastSyncedAt: new Date(),
        },
        update: {
          name: business.name ?? business.id,
          verificationStatus: business.verification_status ?? null,
          timezone: business.timezone_id === undefined ? null : String(business.timezone_id),
          rawMetadata: business,
          lastSyncedAt: new Date(),
        },
      });
      businessByExternalId.set(business.id, saved.id);
    }

    for (const page of pages.data ?? []) {
      const savedPage = await prisma.metaPage.upsert({
        where: { pageId: page.id },
        create: {
          pageId: page.id,
          name: page.name ?? page.id,
          organizationId,
          username: page.username ?? null,
          category: page.category ?? null,
          link: page.link ?? null,
          tasks: page.tasks ?? undefined,
          rawMetadata: page,
          lastSyncedAt: new Date(),
        },
        update: {
          name: page.name ?? page.id,
          username: page.username ?? null,
          category: page.category ?? null,
          link: page.link ?? null,
          tasks: page.tasks ?? undefined,
          rawMetadata: page,
          lastSyncedAt: new Date(),
        },
      });

      const instagram = page.instagram_business_account;
      if (instagram?.id && instagram.username) {
        await prisma.instagramAccount.upsert({
          where: { instagramAccountId: instagram.id },
          create: {
            instagramAccountId: instagram.id,
            username: instagram.username,
            organizationId,
            name: instagram.name ?? null,
            profilePictureUrl: instagram.profile_picture_url ?? null,
            followersCount: instagram.followers_count ?? null,
            mediaCount: instagram.media_count ?? null,
            pageRefId: savedPage.id,
            rawMetadata: instagram,
            lastSyncedAt: new Date(),
          },
          update: {
            username: instagram.username,
            name: instagram.name ?? null,
            profilePictureUrl: instagram.profile_picture_url ?? null,
            followersCount: instagram.followers_count ?? null,
            mediaCount: instagram.media_count ?? null,
            pageRefId: savedPage.id,
            rawMetadata: instagram,
            lastSyncedAt: new Date(),
          },
        });
      }

      const forms = await graphGet<GraphList<MetaLeadForm>>(
        `/${page.id}/leadgen_forms`,
        accessToken,
        {
          fields: "id,name,status,questions",
          limit: "100",
        },
      ).catch(() => ({ data: [] }));

      for (const form of forms.data ?? []) {
        await prisma.metaLeadForm.upsert({
          where: { formId: form.id },
          create: {
            formId: form.id,
            name: form.name ?? form.id,
            status: form.status ?? "ACTIVE",
            organizationId,
            pageRefId: savedPage.id,
            questions: jsonValue(form.questions),
            rawMetadata: jsonValue(form),
            lastSyncedAt: new Date(),
          },
          update: {
            name: form.name ?? form.id,
            status: form.status ?? "ACTIVE",
            organizationId,
            pageRefId: savedPage.id,
            questions: jsonValue(form.questions),
            rawMetadata: jsonValue(form),
            lastSyncedAt: new Date(),
          },
        });
      }
    }

    for (const account of adAccounts.data ?? []) {
      const businessAccountRefId = account.business?.id
        ? businessByExternalId.get(account.business.id) ?? null
        : null;

      await prisma.metaAdAccount.upsert({
        where: { adAccountId: account.id },
        create: {
          adAccountId: account.id,
          name: account.name ?? account.id,
          organizationId,
          currency: account.currency ?? null,
          timezoneName: account.timezone_name ?? null,
          accountStatus:
            account.account_status === undefined ? null : String(account.account_status),
          businessAccountRefId,
          rawMetadata: account,
          lastSyncedAt: new Date(),
        },
        update: {
          name: account.name ?? account.id,
          currency: account.currency ?? null,
          timezoneName: account.timezone_name ?? null,
          accountStatus:
            account.account_status === undefined ? null : String(account.account_status),
          businessAccountRefId,
          rawMetadata: account,
          lastSyncedAt: new Date(),
        },
      });
    }

    const updatedConnection = await prisma.organizationIntegrationConnection.update({
      where: { id: connection.id },
      data: {
        status: "ACTIVE",
        lastSyncedAt: new Date(),
        lastSyncStatus: "SUCCESS",
        lastSyncError: null,
      },
    });

    const leadFormsCount = await prisma.metaLeadForm.count({ where: { organizationId } });

    await prisma.operationsAuditEvent.create({
      data: {
        actorId,
        action: "META_BUSINESS_SYNCED",
        entityType: "OrganizationIntegrationConnection",
        entityId: updatedConnection.id,
        organizationId,
        metadata: {
          businesses: businesses.data?.length ?? 0,
          pages: pages.data?.length ?? 0,
          adAccounts: adAccounts.data?.length ?? 0,
          leadForms: leadFormsCount,
        },
      },
    });

    return {
      connection: updatedConnection,
      imported: {
        businesses: businesses.data?.length ?? 0,
        pages: pages.data?.length ?? 0,
        adAccounts: adAccounts.data?.length ?? 0,
        leadForms: leadFormsCount,
      },
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Não foi possível sincronizar a Meta.";
    await prisma.organizationIntegrationConnection.update({
      where: { id: connection.id },
      data: {
        status: "ERROR",
        lastSyncedAt: new Date(),
        lastSyncStatus: "ERROR",
        lastSyncError: message,
      },
    });
    throw error;
  }
}

function countLeadActions(actions: MetaCampaignInsight["actions"]) {
  return (actions ?? []).reduce((total, action) => {
    const actionType = action.action_type ?? "";
    if (!["lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead"].includes(actionType)) {
      return total;
    }
    return total + Number(action.value ?? 0);
  }, 0);
}

export async function syncMetaCampaignInsights(actorId: string, organizationId: string) {
  const { accessToken } = await getStoredMetaToken(organizationId);
  const adAccounts = await prisma.metaAdAccount.findMany({
    where: { organizationId, status: "ACTIVE" },
  });

  let campaignsFound = 0;
  let snapshotsCreated = 0;

  for (const adAccount of adAccounts) {
    const campaigns = await graphGet<GraphList<MetaCampaign>>(
      `/${adAccount.adAccountId}/campaigns`,
      accessToken,
      {
        fields: "id,name,status,objective",
        limit: "100",
      },
    );

    for (const campaign of campaigns.data ?? []) {
      campaignsFound += 1;
      const insights = await graphGet<GraphList<MetaCampaignInsight>>(
        `/${campaign.id}/insights`,
        accessToken,
        {
          fields: "spend,impressions,clicks,actions,date_start,date_stop",
          date_preset: "last_30d",
          level: "campaign",
          limit: "1",
        },
      ).catch(() => ({ data: [] }));
      const insight = insights.data?.[0];
      if (!insight) continue;

      await prisma.metaCampaignSnapshot.create({
        data: {
          organizationId,
          adAccountRefId: adAccount.id,
          campaignId: campaign.id,
          campaignName: campaign.name ?? campaign.id,
          status: campaign.status ?? null,
          objective: campaign.objective ?? null,
          dateStart: insight.date_start ? new Date(`${insight.date_start}T00:00:00.000Z`) : null,
          dateStop: insight.date_stop ? new Date(`${insight.date_stop}T00:00:00.000Z`) : null,
          spend: insight.spend ?? null,
          impressions: insight.impressions ? Number(insight.impressions) : null,
          clicks: insight.clicks ? Number(insight.clicks) : null,
          leads: countLeadActions(insight.actions),
          rawMetrics: jsonValue(insight),
        },
      });
      snapshotsCreated += 1;
    }
  }

  await prisma.organizationIntegrationConnection.update({
    where: { organizationId_provider: { organizationId, provider: META_PROVIDER } },
    data: {
      lastSyncedAt: new Date(),
      lastSyncStatus: "CAMPAIGNS_SYNCED",
      lastSyncError: null,
    },
  });

  await prisma.operationsAuditEvent.create({
    data: {
      actorId,
      organizationId,
      action: "META_CAMPAIGNS_SYNCED",
      entityType: "OrganizationIntegrationConnection",
      metadata: {
        adAccounts: adAccounts.length,
        campaigns: campaignsFound,
        snapshots: snapshotsCreated,
      },
    },
  });

  return {
    adAccounts: adAccounts.length,
    campaigns: campaignsFound,
    snapshots: snapshotsCreated,
  };
}

function metaDateFromSeconds(value: number | undefined) {
  return value ? new Date(value * 1000) : null;
}

function normalizeMetaFieldName(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function readMetaFieldData(fieldData: unknown) {
  const result: Record<string, string> = {};
  if (!Array.isArray(fieldData)) return result;

  for (const item of fieldData) {
    if (!item || typeof item !== "object") continue;
    const name = "name" in item && item.name ? normalizeMetaFieldName(String(item.name)) : "";
    const values = "values" in item && Array.isArray(item.values) ? item.values : [];
    const value = values.map(String).find(Boolean);
    if (name && value) result[name] = value;
  }

  return result;
}

export async function convertMetaLeadToCrmLead(input: {
  actorId: string;
  metaLeadId: string;
}) {
  const metaLead = await prisma.metaLead.findUnique({
    where: { id: input.metaLeadId },
    include: { form: true, page: true, adAccount: true, lead: true },
  });

  if (!metaLead) throw new Error("Lead da Meta não encontrado.");
  if (metaLead.leadId && metaLead.lead) return metaLead.lead;

  const fields = readMetaFieldData(metaLead.fieldData);
  const contactName =
    fields.full_name ||
    fields.nome_completo ||
    fields.name ||
    fields.nome ||
    fields.first_name ||
    null;
  const contactPhone =
    fields.phone_number ||
    fields.telefone ||
    fields.whatsapp ||
    fields.phone ||
    fields.celular ||
    null;
  const email = fields.email || fields.e_mail || null;
  const companyName =
    fields.company_name ||
    fields.nome_da_empresa ||
    fields.empresa ||
    fields.company ||
    contactName ||
    metaLead.page?.name ||
    "Lead Meta sem nome";

  const notes = [
    `Origem: Meta Lead Ads`,
    metaLead.page ? `Página: ${metaLead.page.name}` : null,
    metaLead.form ? `Formulário: ${metaLead.form.name}` : null,
    metaLead.adAccount ? `Conta de anúncio: ${metaLead.adAccount.name}` : null,
    email ? `E-mail: ${email}` : null,
    `Leadgen ID: ${metaLead.leadgenId}`,
    Object.keys(fields).length ? `Campos: ${JSON.stringify(fields)}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return prisma.$transaction(async (transaction) => {
    const lead = await transaction.lead.create({
      data: {
        organizationId: metaLead.organizationId,
        companyName,
        contactName,
        contactPhone,
        channel: "meta_lead_ads",
        stage: "NEW",
        notes,
      },
    });

    await transaction.metaLead.update({
      where: { id: metaLead.id },
      data: {
        leadId: lead.id,
        processingStatus: "CONVERTED",
        processedAt: new Date(),
      },
    });

    await transaction.operationsAuditEvent.create({
      data: {
        actorId: input.actorId,
        organizationId: metaLead.organizationId,
        action: "META_LEAD_CONVERTED",
        entityType: "Lead",
        entityId: lead.id,
        metadata: {
          metaLeadId: metaLead.id,
          leadgenId: metaLead.leadgenId,
          pageId: metaLead.page?.pageId ?? null,
          formId: metaLead.form?.formId ?? null,
        },
      },
    });

    return lead;
  });
}

export async function processMetaWebhookPayload(payload: MetaWebhookPayload) {
  const imported: Array<{ leadgenId: string; organizationId: string | null }> = [];

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "leadgen" || !change.value?.leadgen_id) continue;

      const leadgenId = change.value.leadgen_id;
      const page = change.value.page_id
        ? await prisma.metaPage.findUnique({ where: { pageId: change.value.page_id } })
        : null;
      const form = change.value.form_id
        ? await prisma.metaLeadForm.findUnique({ where: { formId: change.value.form_id } })
        : null;
      const organizationId = page?.organizationId ?? form?.organizationId ?? null;
      const connection = organizationId
        ? await prisma.organizationIntegrationConnection.findUnique({
            where: {
              organizationId_provider: { organizationId, provider: META_PROVIDER },
            },
          })
        : null;
      const accessToken = connection?.tokenCiphertext
        ? decryptToken(connection.tokenCiphertext)
        : null;

      const details = accessToken
        ? await graphGet<MetaLeadDetails>(`/${leadgenId}`, accessToken, {
            fields: "id,created_time,field_data,form_id,ad_id,campaign_id",
          }).catch(() => null)
        : null;

      await prisma.metaLead.upsert({
        where: { leadgenId },
        create: {
          leadgenId,
          organizationId,
          pageRefId: page?.id ?? null,
          formRefId: form?.id ?? null,
          createdTime: details?.created_time
            ? new Date(details.created_time)
            : metaDateFromSeconds(change.value.created_time),
          fieldData: jsonValue(details?.field_data),
          rawPayload: jsonValue({
            webhook: change.value,
            graph: details,
          }),
          processingStatus: details ? "IMPORTED" : "NEW",
        },
        update: {
          organizationId,
          pageRefId: page?.id ?? null,
          formRefId: form?.id ?? null,
          createdTime: details?.created_time
            ? new Date(details.created_time)
            : metaDateFromSeconds(change.value.created_time),
          fieldData: jsonValue(details?.field_data),
          rawPayload: jsonValue({
            webhook: change.value,
            graph: details,
          }),
          processingStatus: details ? "IMPORTED" : "NEW",
        },
      });

      imported.push({ leadgenId, organizationId });
    }
  }

  return imported;
}

export async function getMetaConnectionStatus(organizationId: string | null): Promise<MetaConnectionStatus> {
  const [connection, counts] = await Promise.all([
    organizationId
      ? prisma.organizationIntegrationConnection.findUnique({
          where: { organizationId_provider: { organizationId, provider: META_PROVIDER } },
        })
      : null,
    Promise.all([
      prisma.metaBusinessAccount.count({ where: organizationId ? { organizationId } : undefined }),
      prisma.metaPage.count({ where: organizationId ? { organizationId } : undefined }),
      prisma.instagramAccount.count({ where: organizationId ? { organizationId } : undefined }),
      prisma.metaAdAccount.count({ where: organizationId ? { organizationId } : undefined }),
      prisma.metaLeadForm.count({ where: organizationId ? { organizationId } : undefined }),
      prisma.metaLead.count({ where: organizationId ? { organizationId } : undefined }),
      prisma.metaCampaignSnapshot.count({ where: organizationId ? { organizationId } : undefined }),
      prisma.integrationWebhookEvent.count({ where: { provider: META_PROVIDER } }),
    ]),
  ]);

  return {
    organizationId,
    connected: Boolean(connection && connection.status !== "DISCONNECTED"),
    configured: Boolean(
      process.env.META_APP_ID &&
        process.env.META_APP_SECRET &&
        process.env.META_TOKEN_ENCRYPTION_KEY,
    ),
    connection: connection
      ? {
          id: connection.id,
          status: connection.status,
          lastSyncedAt: connection.lastSyncedAt?.toISOString() ?? null,
          lastSyncStatus: connection.lastSyncStatus,
          lastSyncError: connection.lastSyncError,
          userName: connection.accountName ?? undefined,
          userId: connection.externalId ?? undefined,
          tokenExpiresAt: connection.tokenExpiresAt?.toISOString(),
        }
      : null,
    counts: {
      businesses: counts[0],
      pages: counts[1],
      instagramAccounts: counts[2],
      adAccounts: counts[3],
      leadForms: counts[4],
      leads: counts[5],
      campaignSnapshots: counts[6],
      webhookEvents: counts[7],
    },
  };
}

export async function verifyMetaWebhookToken(token: string | null) {
  const esperado = await obterCredencial("META_WEBHOOK_VERIFY_TOKEN");
  return Boolean(esperado) && token === esperado;
}

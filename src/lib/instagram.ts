import crypto from "crypto";
import { obterCredencial, exigirCredencial } from "@/lib/credenciais";
import { prisma } from "@/lib/prisma";
import { cifrarToken, decifrarToken } from "@/lib/token-de-conexao";

/**
 * Login próprio do Instagram (API do Instagram com login do Instagram).
 *
 * Por que existe, já que o Hub Social ler Instagram pelo Facebook:
 * o caminho pelo Facebook (`lib/meta.ts`) só enxerga a conta profissional que
 * está VINCULADA a uma Página. Cliente que tem Instagram e não tem Página fica
 * de fora, e isso é cada vez mais comum entre os pequenos. Este módulo é o
 * caminho para esse cliente.
 *
 * É outro app dentro do mesmo painel da Meta, com credenciais próprias
 * (`INSTAGRAM_APP_ID` e `INSTAGRAM_APP_SECRET`, que NÃO são o App ID do
 * Facebook), outro host (`graph.instagram.com`) e outro consentimento. Por isso
 * módulo separado em vez de mais um ramo dentro de `meta.ts`.
 *
 * O que os dois compartilham de propósito: a tabela de conexão
 * (`OrganizationIntegrationConnection`), a cifra do token
 * (`lib/token-de-conexao.ts`) e a tabela `InstagramAccount`. Assim o painel
 * mostra a conta no mesmo lugar, tenha ela chegado por um caminho ou pelo outro.
 */

export const INSTAGRAM_PROVIDER = "instagram_login";
const STATE_COOKIE = "avila_instagram_oauth_state";

export { STATE_COOKIE as INSTAGRAM_STATE_COOKIE };

/** Origem gravada em `InstagramAccount.origem`. */
export const ORIGEM_LOGIN_PROPRIO = "instagram_login";

type RespostaToken = {
  access_token: string;
  user_id?: number | string;
  permissions?: string;
};

type RespostaTokenLongo = {
  access_token: string;
  token_type?: string;
  expires_in?: number;
};

export type PerfilInstagram = {
  id: string;
  user_id?: string;
  username: string;
  name?: string;
  account_type?: string;
  profile_picture_url?: string;
  followers_count?: number;
  media_count?: number;
};

function versaoGraph() {
  // O host do Instagram versiona separado do Graph do Facebook; fixar aqui
  // evita herdar a versão da Meta e quebrar quando uma das duas andar sozinha.
  return process.env.INSTAGRAM_GRAPH_VERSION || "v23.0";
}

export async function instagramRedirectUri(origin: string) {
  return (
    (await obterCredencial("INSTAGRAM_REDIRECT_URI")) ||
    `${origin.replace(/\/$/, "")}/api/integrations/instagram/oauth/callback`
  );
}

/**
 * Escopos do login próprio. Não são os mesmos nomes do caminho pelo Facebook:
 * lá é `instagram_basic`, aqui é `instagram_business_basic`. Trocar um pelo
 * outro devolve erro de escopo inválido, e o nome parecido faz esse erro custar
 * meia hora de quem for depurar.
 */
export async function instagramEscopos() {
  return (
    (await obterCredencial("INSTAGRAM_OAUTH_SCOPES")) ||
    [
      "instagram_business_basic",
      "instagram_business_manage_messages",
      "instagram_business_manage_comments",
      "instagram_business_content_publish",
    ].join(",")
  );
}

export function codificarEstadoInstagram(organizationId: string) {
  return `${organizationId}.${crypto.randomBytes(24).toString("hex")}`;
}

export function decodificarEstadoInstagram(valor: string | null) {
  if (!valor) return null;
  const [organizationId, nonce] = valor.split(".");
  if (!organizationId || !nonce) return null;
  return { organizationId };
}

export async function montarUrlDeLoginInstagram(origin: string, state: string) {
  const url = new URL("https://www.instagram.com/oauth/authorize");
  url.searchParams.set("client_id", await exigirCredencial("INSTAGRAM_APP_ID"));
  url.searchParams.set("redirect_uri", await instagramRedirectUri(origin));
  url.searchParams.set("scope", await instagramEscopos());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  return url;
}

async function pedirJson<T>(url: string, init?: RequestInit): Promise<T> {
  const resposta = await fetch(url, { ...init, cache: "no-store" });
  const dados = (await resposta.json().catch(() => null)) as
    | (T & { error?: unknown; error_message?: string; error_type?: string })
    | null;

  if (!resposta.ok || !dados) {
    const detalhe =
      (dados && typeof dados.error_message === "string" && dados.error_message) ||
      (dados &&
        typeof dados.error === "object" &&
        dados.error !== null &&
        "message" in dados.error &&
        typeof (dados.error as { message?: unknown }).message === "string" &&
        (dados.error as { message: string }).message) ||
      `HTTP ${resposta.status}`;
    throw new Error(`Instagram: ${detalhe}`);
  }

  return dados;
}

/**
 * Troca o código pelo token e já converte para o de 60 dias.
 *
 * O token curto que sai da primeira troca vale uma hora. Guardar ele seria
 * gravar uma conexão que nasce quebrada, então a conversão acontece aqui e não
 * em outro lugar que alguém possa esquecer de chamar.
 */
export async function trocarCodigoInstagram(origin: string, code: string) {
  const appId = await exigirCredencial("INSTAGRAM_APP_ID");
  const appSecret = await exigirCredencial("INSTAGRAM_APP_SECRET");

  const corpo = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    grant_type: "authorization_code",
    redirect_uri: await instagramRedirectUri(origin),
    code,
  });

  const curto = await pedirJson<RespostaToken>("https://api.instagram.com/oauth/access_token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: corpo,
  });

  const longoUrl = new URL("https://graph.instagram.com/access_token");
  longoUrl.searchParams.set("grant_type", "ig_exchange_token");
  longoUrl.searchParams.set("client_secret", appSecret);
  longoUrl.searchParams.set("access_token", curto.access_token);

  const longo = await pedirJson<RespostaTokenLongo>(longoUrl.toString());

  const perfil = await buscarPerfil(longo.access_token);

  return {
    accessToken: longo.access_token,
    tokenType: longo.token_type ?? "bearer",
    tokenExpiresAt: longo.expires_in ? new Date(Date.now() + longo.expires_in * 1000) : null,
    escopos: curto.permissions ? curto.permissions.split(",") : [],
    perfil,
  };
}

export async function buscarPerfil(accessToken: string) {
  const url = new URL(`https://graph.instagram.com/${versaoGraph()}/me`);
  url.searchParams.set(
    "fields",
    "id,user_id,username,name,account_type,profile_picture_url,followers_count,media_count",
  );
  url.searchParams.set("access_token", accessToken);
  return pedirJson<PerfilInstagram>(url.toString());
}

/**
 * Renova o token de 60 dias.
 *
 * A Meta só renova token com mais de 24 horas de vida e que ainda não venceu.
 * Vencido não tem renovação: o cliente precisa autorizar de novo. É por isso
 * que a conexão guarda `tokenExpiresAt` e o painel mostra.
 */
export async function renovarTokenInstagram(organizationId: string) {
  const conexao = await prisma.organizationIntegrationConnection.findUnique({
    where: {
      organizationId_provider: { organizationId, provider: INSTAGRAM_PROVIDER },
    },
    select: { id: true, tokenCiphertext: true },
  });
  if (!conexao?.tokenCiphertext) throw new Error("Instagram não conectado para este cliente.");

  const url = new URL("https://graph.instagram.com/refresh_access_token");
  url.searchParams.set("grant_type", "ig_refresh_token");
  url.searchParams.set("access_token", decifrarToken(conexao.tokenCiphertext));

  const renovado = await pedirJson<RespostaTokenLongo>(url.toString());
  const expiraEm = renovado.expires_in
    ? new Date(Date.now() + renovado.expires_in * 1000)
    : null;

  await prisma.organizationIntegrationConnection.update({
    where: { id: conexao.id },
    data: {
      tokenCiphertext: cifrarToken(renovado.access_token),
      tokenExpiresAt: expiraEm,
      lastSyncedAt: new Date(),
      lastSyncStatus: "REFRESHED",
      lastSyncError: null,
    },
  });

  return { tokenExpiresAt: expiraEm };
}

export type ConexaoInstagram = {
  actorId: string;
  organizationId: string;
  accessToken: string;
  tokenType: string;
  tokenExpiresAt: Date | null;
  escopos: string[];
  perfil: PerfilInstagram;
};

export async function salvarConexaoInstagram(entrada: ConexaoInstagram) {
  const cifrado = cifrarToken(entrada.accessToken);
  const contaId = String(entrada.perfil.user_id ?? entrada.perfil.id);

  return prisma.$transaction(async (transacao) => {
    const conexao = await transacao.organizationIntegrationConnection.upsert({
      where: {
        organizationId_provider: {
          organizationId: entrada.organizationId,
          provider: INSTAGRAM_PROVIDER,
        },
      },
      create: {
        organizationId: entrada.organizationId,
        provider: INSTAGRAM_PROVIDER,
        externalId: contaId,
        accountName: entrada.perfil.username,
        status: "ACTIVE",
        tokenCiphertext: cifrado,
        tokenType: entrada.tokenType,
        tokenExpiresAt: entrada.tokenExpiresAt,
        scopes: entrada.escopos,
        lastSyncedAt: new Date(),
        lastSyncStatus: "CONNECTED",
        metadata: {
          accountType: entrada.perfil.account_type ?? null,
          graphVersion: versaoGraph(),
        },
      },
      update: {
        externalId: contaId,
        accountName: entrada.perfil.username,
        status: "ACTIVE",
        tokenCiphertext: cifrado,
        tokenType: entrada.tokenType,
        tokenExpiresAt: entrada.tokenExpiresAt,
        scopes: entrada.escopos,
        lastSyncedAt: new Date(),
        lastSyncStatus: "CONNECTED",
        lastSyncError: null,
        metadata: {
          accountType: entrada.perfil.account_type ?? null,
          graphVersion: versaoGraph(),
        },
      },
    });

    // A mesma conta pode já existir por ter vindo pelo Facebook. Neste caso a
    // linha é atualizada, não duplicada: `instagramAccountId` é único, e o que
    // muda é a origem passar a registrar o caminho novo.
    await transacao.instagramAccount.upsert({
      where: { instagramAccountId: contaId },
      create: {
        instagramAccountId: contaId,
        organizationId: entrada.organizationId,
        username: entrada.perfil.username,
        name: entrada.perfil.name ?? null,
        accountType: entrada.perfil.account_type ?? null,
        profilePictureUrl: entrada.perfil.profile_picture_url ?? null,
        followersCount: entrada.perfil.followers_count ?? null,
        mediaCount: entrada.perfil.media_count ?? null,
        origem: ORIGEM_LOGIN_PROPRIO,
        status: "ACTIVE",
        lastSyncedAt: new Date(),
        rawMetadata: entrada.perfil as object,
      },
      update: {
        organizationId: entrada.organizationId,
        username: entrada.perfil.username,
        name: entrada.perfil.name ?? null,
        accountType: entrada.perfil.account_type ?? null,
        profilePictureUrl: entrada.perfil.profile_picture_url ?? null,
        followersCount: entrada.perfil.followers_count ?? null,
        mediaCount: entrada.perfil.media_count ?? null,
        origem: ORIGEM_LOGIN_PROPRIO,
        status: "ACTIVE",
        lastSyncedAt: new Date(),
        rawMetadata: entrada.perfil as object,
      },
    });

    await transacao.operationsAuditEvent.create({
      data: {
        actorId: entrada.actorId,
        organizationId: entrada.organizationId,
        action: "INSTAGRAM_LOGIN_CONNECTED",
        entityType: "OrganizationIntegrationConnection",
        entityId: conexao.id,
        metadata: {
          username: entrada.perfil.username,
          accountType: entrada.perfil.account_type ?? null,
        },
      },
    });

    return conexao;
  });
}

/** O que o painel mostra do login próprio, sem tocar no token. */
export async function estadoDoInstagram(organizationId: string) {
  const conexao = await prisma.organizationIntegrationConnection.findUnique({
    where: {
      organizationId_provider: { organizationId, provider: INSTAGRAM_PROVIDER },
    },
    select: {
      accountName: true,
      externalId: true,
      status: true,
      scopes: true,
      tokenExpiresAt: true,
      lastSyncedAt: true,
      lastSyncStatus: true,
      lastSyncError: true,
    },
  });
  if (!conexao) return null;

  const contas = await prisma.instagramAccount.findMany({
    where: { organizationId, origem: ORIGEM_LOGIN_PROPRIO },
    select: {
      username: true,
      name: true,
      accountType: true,
      followersCount: true,
      mediaCount: true,
      profilePictureUrl: true,
    },
    orderBy: { username: "asc" },
  });

  return { conexao, contas };
}

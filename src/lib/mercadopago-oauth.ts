import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { obterCredencial, salvarCredencial } from "@/lib/credenciais";
import { financeiraPorSlug } from "@/lib/credenciais-financeiro";

/**
 * Conectar a conta do Mercado Pago por OAuth, em vez de colar o token.
 *
 * O que isto resolve: o `MP_ACCESS_TOKEN` deixa de ser copiado do painel de
 * desenvolvedor e passa a vir da tela de autorização do próprio Mercado Pago —
 * que mostra, antes do "permitir", QUAL conta está logada. E o token passa a
 * ser renovado sozinho: o de OAuth vale 180 dias e vem com `refresh_token`.
 *
 * O que isto NÃO resolve, e a tela diz: a assinatura secreta do webhook
 * (`MP_WEBHOOK_SECRET`) é da aplicação, gerada no painel, e não vem em resposta
 * nenhuma do OAuth. A própria conexão depende do painel uma vez — Client ID,
 * Client Secret e o endereço de retorno cadastrado na aplicação.
 *
 * Sem PKCE: o painel é cliente confidencial, a troca do código leva o
 * `client_secret` e acontece no servidor. Se a aplicação no Mercado Pago
 * estiver com PKCE ligado, a troca é recusada e o erro aparece na tela.
 */

const AUTORIZACAO = "https://auth.mercadopago.com.br/authorization";
const TOKEN = "https://api.mercadopago.com/oauth/token";

export const COOKIE_DE_ESTADO = "avila_ops_mp_oauth";
export const VALIDADE_DO_ESTADO_SEGUNDOS = 10 * 60;
const AUDIENCIA = "mercadopago-oauth";

export const CAMINHO_DE_RETORNO = "/api/empresa/mercadopago/oauth/callback";
export const FICHA = "/empresa/credenciais/financeiro/mercado-pago";

/** Renova quando faltar menos que isto para o token vencer. */
const FOLGA_DE_RENOVACAO_MS = 30 * 24 * 60 * 60 * 1000;
/** Renovação que falhou não é tentada de novo a cada chamada da API. */
const ESPERA_APOS_FALHA_MS = 60 * 60 * 1000;

export class MercadoPagoOAuthErro extends Error {}

function segredoDoEstado(): string {
  const valor = process.env.APP_JWT_SECRET;
  if (!valor) throw new Error("APP_JWT_SECRET não configurado");
  return valor;
}

/**
 * O endereço que o Mercado Pago chama de volta. Tem de ser, letra por letra, o
 * cadastrado na aplicação — por isso a tela o mostra para copiar.
 */
export function enderecoDeRetorno(): string {
  const base = (process.env.APP_URL ?? "https://app.avilaops.com").replace(/\/+$/, "");
  return `${base}${CAMINHO_DE_RETORNO}`;
}

export async function credenciaisDaAplicacao(): Promise<{ clientId: string; clientSecret: string }> {
  const [clientId, clientSecret] = await Promise.all([
    obterCredencial("MP_CLIENT_ID"),
    obterCredencial("MP_CLIENT_SECRET"),
  ]);
  return { clientId: clientId?.trim() ?? "", clientSecret: clientSecret?.trim() ?? "" };
}

/** O `state`: assinado, curto e preso a quem começou a conexão. */
export function assinarEstado(adminId: string): string {
  return jwt.sign({ sub: adminId, nonce: crypto.randomBytes(16).toString("base64url") }, segredoDoEstado(), {
    audience: AUDIENCIA,
    expiresIn: VALIDADE_DO_ESTADO_SEGUNDOS,
  });
}

export function estadoValido(estado: string | null | undefined, adminId: string): boolean {
  if (!estado) return false;
  try {
    const carga = jwt.verify(estado, segredoDoEstado(), { audience: AUDIENCIA });
    return typeof carga === "object" && carga.sub === adminId;
  } catch {
    return false;
  }
}

export function urlDeAutorizacao(clientId: string, estado: string): string {
  const url = new URL(AUTORIZACAO);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("platform_id", "mp");
  url.searchParams.set("state", estado);
  url.searchParams.set("redirect_uri", enderecoDeRetorno());
  return url.toString();
}

export type TokenDoMercadoPago = {
  accessToken: string;
  refreshToken: string;
  publicKey: string | null;
  userId: string;
  expiraEm: Date;
  producao: boolean;
};

async function pedirToken(corpo: Record<string, string>): Promise<TokenDoMercadoPago> {
  const { clientId, clientSecret } = await credenciaisDaAplicacao();
  if (!clientId || !clientSecret) {
    throw new MercadoPagoOAuthErro(
      "Guarde o Client ID e o Client Secret da aplicação do Mercado Pago antes de conectar.",
    );
  }

  let resposta: Response;
  try {
    resposta = await fetch(TOKEN, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, ...corpo }),
      signal: AbortSignal.timeout(30_000),
      cache: "no-store",
    });
  } catch {
    throw new MercadoPagoOAuthErro("O Mercado Pago não respondeu à troca do código. Tente de novo.");
  }

  const dados = (await resposta.json().catch(() => null)) as Record<string, unknown> | null;
  if (!resposta.ok || !dados) {
    // `message` e `error` do Mercado Pago dizem o motivo ("invalid_grant",
    // "invalid redirect_uri") e nunca trazem segredo. Vão para a tela porque é
    // com eles que se conserta o cadastro da aplicação.
    const motivo = [dados?.error, dados?.message].filter((v) => typeof v === "string").join(": ");
    throw new MercadoPagoOAuthErro(
      `O Mercado Pago recusou a troca do código (${resposta.status}${motivo ? ` — ${motivo}` : ""}).`,
    );
  }

  const accessToken = typeof dados.access_token === "string" ? dados.access_token : "";
  const refreshToken = typeof dados.refresh_token === "string" ? dados.refresh_token : "";
  const segundos = typeof dados.expires_in === "number" ? dados.expires_in : 0;
  if (!accessToken || !refreshToken || segundos <= 0 || dados.user_id == null) {
    throw new MercadoPagoOAuthErro("A resposta do Mercado Pago veio sem token, sem validade ou sem a conta.");
  }

  return {
    accessToken,
    refreshToken,
    publicKey: typeof dados.public_key === "string" && dados.public_key ? dados.public_key : null,
    userId: String(dados.user_id),
    expiraEm: new Date(Date.now() + segundos * 1000),
    producao: dados.live_mode === true,
  };
}

export function trocarCodigo(codigo: string): Promise<TokenDoMercadoPago> {
  return pedirToken({ grant_type: "authorization_code", code: codigo, redirect_uri: enderecoDeRetorno() });
}

/** Impressão digital do token: liga o `refresh_token` ao token que ele renova. */
export function digitalDoToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Guarda o resultado no cofre, nas mesmas chaves que o resto do código já lê.
 *
 * A impressão digital existe por causa de um caso que custaria dinheiro: o dono
 * conecta por OAuth e, meses depois, cola à mão o token de OUTRA conta. Sem a
 * digital, a renovação automática trocaria o token colado pelo renovado da
 * conta antiga, e o dinheiro voltaria a entrar nela sem ninguém pedir. Com
 * ela, a renovação só acontece enquanto o token em uso for o que o OAuth pôs.
 */
export async function guardarConexao(token: TokenDoMercadoPago, atorId: string, origem: string) {
  const comum = { origem, consumidores: ["src/lib/mercadopago.ts", "src/lib/mercadopago-oauth.ts"] };
  // Rótulo e ajuda do catálogo: `salvarCredencial` regrava os dois, e a chave
  // não pode perder a explicação só porque o valor veio por outro caminho.
  const doCatalogo = (chave: string) => {
    const campo = financeiraPorSlug("mercado-pago")?.campos.find((c) => c.chave === chave);
    return { rotulo: campo?.rotulo ?? null, descricao: campo?.ajuda ?? null };
  };
  await salvarCredencial(
    { chave: "MP_ACCESS_TOKEN", valor: token.accessToken, ...doCatalogo("MP_ACCESS_TOKEN"), ...comum },
    atorId,
  );
  await salvarCredencial(
    { chave: "MP_REFRESH_TOKEN", valor: token.refreshToken, rotulo: "Refresh token do OAuth", segredo: true, ...comum },
    atorId,
  );
  await salvarCredencial(
    { chave: "MP_OAUTH_DIGITAL", valor: digitalDoToken(token.accessToken), rotulo: "Digital do token conectado", segredo: false, ...comum },
    atorId,
  );
  await salvarCredencial(
    { chave: "MP_OAUTH_EXPIRA_EM", valor: token.expiraEm.toISOString(), rotulo: "Vencimento do token conectado", segredo: false, ...comum },
    atorId,
  );
  await salvarCredencial(
    { chave: "MP_OAUTH_USER_ID", valor: token.userId, rotulo: "Conta conectada (user_id)", segredo: false, ...comum },
    atorId,
  );
  if (token.publicKey) {
    await salvarCredencial(
      { chave: "MP_PUBLIC_KEY", valor: token.publicKey, ...doCatalogo("MP_PUBLIC_KEY"), ...comum },
      atorId,
    );
  }
}

export type EstadoDaConexao = {
  /** Client ID e Client Secret guardados: dá para começar. */
  aplicacaoPronta: boolean;
  faltam: string[];
  /** Há conexão por OAuth E o token em uso ainda é o dela. */
  conectada: boolean;
  /** Havia conexão, mas o token foi trocado à mão depois. */
  substituidaAMao: boolean;
  userId: string | null;
  expiraEm: string | null;
};

export async function estadoDaConexao(): Promise<EstadoDaConexao> {
  const [{ clientId, clientSecret }, token, refresh, digital, expiraEm, userId] = await Promise.all([
    credenciaisDaAplicacao(),
    obterCredencial("MP_ACCESS_TOKEN"),
    obterCredencial("MP_REFRESH_TOKEN"),
    obterCredencial("MP_OAUTH_DIGITAL"),
    obterCredencial("MP_OAUTH_EXPIRA_EM"),
    obterCredencial("MP_OAUTH_USER_ID"),
  ]);

  const faltam = [...(clientId ? [] : ["Client ID"]), ...(clientSecret ? [] : ["Client Secret"])];
  const houveConexao = Boolean(refresh && digital);
  const tokenEhODaConexao = Boolean(token && digital && digitalDoToken(token.trim()) === digital);

  return {
    aplicacaoPronta: faltam.length === 0,
    faltam,
    conectada: houveConexao && tokenEhODaConexao,
    substituidaAMao: houveConexao && !tokenEhODaConexao,
    userId: houveConexao && tokenEhODaConexao ? userId : null,
    expiraEm: houveConexao && tokenEhODaConexao ? expiraEm : null,
  };
}

let renovacaoEmCurso: Promise<void> | null = null;
let naoTentarAntesDe = 0;

/**
 * Renova o token conectado quando ele está perto de vencer.
 *
 * Chamada antes de cada pedido à API — barata, porque o cofre tem cache de um
 * minuto. Uma renovação por vez no processo: o `refresh_token` do Mercado Pago
 * é trocado a cada uso, e duas renovações simultâneas deixariam uma delas com
 * um refresh já gasto.
 *
 * Nunca lança: token perto de vencer ainda cobra. A falha sai no log com marca
 * própria e a próxima tentativa fica para daqui a uma hora.
 */
export async function renovarTokenSeVencendo(agora = Date.now()): Promise<void> {
  if (agora < naoTentarAntesDe) return;
  if (renovacaoEmCurso) return renovacaoEmCurso;

  renovacaoEmCurso = (async () => {
    try {
      const [token, refresh, digital, expiraEm] = await Promise.all([
        obterCredencial("MP_ACCESS_TOKEN"),
        obterCredencial("MP_REFRESH_TOKEN"),
        obterCredencial("MP_OAUTH_DIGITAL"),
        obterCredencial("MP_OAUTH_EXPIRA_EM"),
      ]);
      if (!token || !refresh || !digital || !expiraEm) return;
      // Token colado à mão depois da conexão: não é nosso para renovar.
      if (digitalDoToken(token.trim()) !== digital) return;

      const vencimento = new Date(expiraEm).getTime();
      if (Number.isNaN(vencimento) || vencimento - agora > FOLGA_DE_RENOVACAO_MS) return;

      const novo = await pedirToken({ grant_type: "refresh_token", refresh_token: refresh.trim() });
      await guardarConexao(novo, "sistema", "oauth:renovacao");
      console.info(`[mercadopago-oauth] token renovado; novo vencimento em ${novo.expiraEm.toISOString()}`);
    } catch (erro) {
      naoTentarAntesDe = agora + ESPERA_APOS_FALHA_MS;
      console.error(
        "[mercadopago-oauth] RENOVAÇÃO FALHOU: o token conectado segue em uso até vencer. Reconecte em Empresa › Credenciais › Mercado Pago.",
        erro instanceof Error ? erro.message : erro,
      );
    }
  })().finally(() => {
    renovacaoEmCurso = null;
  });

  return renovacaoEmCurso;
}

/** Só para teste: zera o que o processo lembra entre chamadas. */
export function zerarMemoriaDaRenovacao() {
  renovacaoEmCurso = null;
  naoTentarAntesDe = 0;
}

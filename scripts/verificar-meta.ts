/**
 * Confere se o app da Meta está de pé e se o ambiente tem tudo que o Hub Social
 * precisa. Não altera nada — só consulta a Graph API e imprime o diagnóstico.
 *
 *   npm run meta:verificar                      # usa .env.local
 *   npm run meta:verificar -- --env=.env.production
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

type Resultado = { rotulo: string; ok: boolean; detalhe: string };

const resultados: Resultado[] = [];

function registrar(rotulo: string, ok: boolean, detalhe: string) {
  resultados.push({ rotulo, ok, detalhe });
}

function carregarEnv(arquivo: string) {
  const caminho = path.resolve(process.cwd(), arquivo);
  if (!fs.existsSync(caminho)) {
    throw new Error(`Arquivo de ambiente não encontrado: ${caminho}`);
  }

  for (const linha of fs.readFileSync(caminho, "utf8").split("\n")) {
    const limpa = linha.trim();
    if (!limpa || limpa.startsWith("#")) continue;

    const separador = limpa.indexOf("=");
    if (separador < 1) continue;

    const chave = limpa.slice(0, separador).trim();
    const valor = limpa.slice(separador + 1).trim().replace(/^["']|["']$/g, "");
    if (valor) process.env[chave] = valor;
  }
}

async function graph(caminho: string, params: Record<string, string>) {
  const versao = process.env.META_GRAPH_VERSION || "v25.0";
  const url = new URL(`https://graph.facebook.com/${versao}${caminho}`);
  for (const [chave, valor] of Object.entries(params)) {
    url.searchParams.set(chave, valor);
  }

  // Obrigatório quando o app exige prova de posse do secret; inofensivo quando
  // não exige. Sem isso, chamada de servidor volta GraphMethodException.
  const appSecret = process.env.META_APP_SECRET;
  const accessToken = params.access_token;
  if (appSecret && accessToken && !accessToken.includes("|")) {
    url.searchParams.set(
      "appsecret_proof",
      crypto.createHmac("sha256", appSecret).update(accessToken).digest("hex"),
    );
  }

  const resposta = await fetch(url, { cache: "no-store" });
  const corpo = (await resposta.json().catch(() => null)) as
    | { error?: { message?: string; code?: number }; [k: string]: unknown }
    | null;

  if (!resposta.ok || corpo?.error) {
    const erro = corpo?.error;
    throw new Error(`${erro?.message ?? `HTTP ${resposta.status}`}${erro?.code ? ` (code ${erro.code})` : ""}`);
  }

  return corpo ?? {};
}

function conferirObrigatorias() {
  const obrigatorias = [
    "META_APP_ID",
    "META_APP_SECRET",
    "META_REDIRECT_URI",
    "META_OAUTH_SCOPES",
    "META_TOKEN_ENCRYPTION_KEY",
    "META_WEBHOOK_VERIFY_TOKEN",
  ];

  const faltando = obrigatorias.filter((chave) => !process.env[chave]);
  registrar(
    "Variáveis obrigatórias do Hub Social",
    faltando.length === 0,
    faltando.length === 0 ? "todas preenchidas" : `faltando: ${faltando.join(", ")}`,
  );

  return faltando.length === 0;
}

async function conferirApp() {
  const appId = process.env.META_APP_ID!;
  const appToken = `${appId}|${process.env.META_APP_SECRET!}`;

  try {
    const app = (await graph(`/${appId}`, {
      fields: "id,name,link,category",
      access_token: appToken,
    })) as { name?: string; link?: string };

    registrar("App da Meta acessível", true, `${app.name ?? appId} — ${app.link ?? ""}`);
  } catch (erro) {
    registrar("App da Meta acessível", false, erro instanceof Error ? erro.message : String(erro));
    return;
  }

  try {
    const inscricoes = (await graph(`/${appId}/subscriptions`, { access_token: appToken })) as {
      data?: Array<{ object?: string; fields?: Array<{ name?: string } | string> }>;
    };

    const assinados = (inscricoes.data ?? []).map((item) => {
      const campos = (item.fields ?? [])
        .map((campo) => (typeof campo === "string" ? campo : campo.name))
        .filter(Boolean)
        .join(", ");
      return `${item.object}: ${campos || "sem campos"}`;
    });

    registrar(
      "Webhooks assinados",
      assinados.length > 0,
      assinados.length > 0 ? assinados.join(" | ") : "nenhum objeto assinado no painel da Meta",
    );
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    // Código 104 com app token válido é a assinatura de app marcado como
    // "Aplicativo nativo ou para computador": a Meta desliga o app access token
    // nesse modo, e o Hub Social é servidor, não app nativo.
    const nativo = mensagem.includes("code 104");
    registrar(
      "Webhooks assinados",
      false,
      nativo
        ? 'app token recusado (code 104) — desligue "Aplicativo nativo ou para computador" em Configurações > Avançado'
        : mensagem,
    );
  }
}

async function conferirWhatsApp() {
  const token = process.env.WHATSAPP_API_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !phoneNumberId) {
    const faltando = [
      token ? null : "WHATSAPP_API_TOKEN",
      phoneNumberId ? null : "WHATSAPP_PHONE_NUMBER_ID",
    ].filter(Boolean);
    registrar("WhatsApp Cloud API", false, `faltando: ${faltando.join(", ")}`);
    return;
  }

  try {
    const numero = (await graph(`/${phoneNumberId}`, {
      fields: "id,display_phone_number,verified_name,quality_rating",
      access_token: token,
    })) as { display_phone_number?: string; verified_name?: string; quality_rating?: string };

    registrar(
      "WhatsApp Cloud API",
      true,
      `${numero.verified_name ?? "sem nome"} — ${numero.display_phone_number ?? phoneNumberId} (qualidade: ${numero.quality_rating ?? "n/d"})`,
    );
  } catch (erro) {
    registrar("WhatsApp Cloud API", false, erro instanceof Error ? erro.message : String(erro));
  }
}

function imprimirUrlDeLogin() {
  const versao = process.env.META_GRAPH_VERSION || "v25.0";
  const url = new URL(`https://www.facebook.com/${versao}/dialog/oauth`);
  url.searchParams.set("client_id", process.env.META_APP_ID!);
  url.searchParams.set("redirect_uri", process.env.META_REDIRECT_URI!);
  url.searchParams.set("scope", process.env.META_OAUTH_SCOPES!);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", "teste-manual");

  console.log("\nURL de login (abra no navegador para testar o consentimento):");
  console.log(url.toString());
  console.log(
    "\nO redirect_uri acima precisa estar cadastrado em Login do Facebook > Configurações > URIs de redirecionamento do OAuth válidos.",
  );
}

async function principal() {
  const arquivoEnv =
    process.argv.find((argumento) => argumento.startsWith("--env="))?.split("=")[1] ?? ".env.local";

  carregarEnv(arquivoEnv);
  console.log(`Ambiente carregado de ${arquivoEnv}\n`);

  const completo = conferirObrigatorias();
  if (completo) {
    await conferirApp();
  }
  await conferirWhatsApp();

  for (const { rotulo, ok, detalhe } of resultados) {
    console.log(`${ok ? "OK  " : "FALHA"} ${rotulo}: ${detalhe}`);
  }

  if (completo) imprimirUrlDeLogin();

  process.exitCode = resultados.every((resultado) => resultado.ok) ? 0 : 1;
}

principal().catch((erro) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exitCode = 1;
});

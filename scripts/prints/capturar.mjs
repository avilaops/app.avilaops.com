/**
 * Prints das telas do Hub Social: desktop e iPhone, claro e escuro.
 * Roda no GitHub Actions contra o app local com dados fictícios (semear.ts).
 */
import { mkdir } from "node:fs/promises";
import jwt from "jsonwebtoken";
import { chromium, devices } from "playwright";

const BASE = process.env.PRINTS_BASE_URL ?? "http://127.0.0.1:3000";
const SAIDA = process.env.PRINTS_SAIDA ?? "prints";
const token = jwt.sign({ sub: "prints-owner", role: "OWNER" }, process.env.APP_JWT_SECRET, { expiresIn: 3600 });

const telas = [
  ["seo", "/hub-social/seo"],
  ["seo-dominios", "/hub-social/seo?view=domains"],
  ["seo-detalhe", "/hub-social/seo?domain=clinicahorizonte.example"],
  ["dominios", "/hub-social/dominios"],
  ["google", "/hub-social/google"],
  ["meta", "/hub-social/meta"],
  ["meta-ativos", "/hub-social/meta/ativos"],
  ["meta-campanhas", "/hub-social/meta/campanhas"],
  ["meta-leads", "/hub-social/meta/leads"],
  ["whatsapp", "/hub-social/whatsapp"],
  ["newsletter", "/hub-social/newsletter"],
  ["estudio", "/hub-social/estudio"],
];

const formatos = [
  ["desktop", { viewport: { width: 1440, height: 900 } }],
  ["iphone", devices["iPhone 13"]],
];

const browser = await chromium.launch();
const falhas = [];
await mkdir(SAIDA, { recursive: true });

for (const [nomeFormato, opcoes] of formatos) {
  for (const tema of ["claro", "escuro"]) {
    const contexto = await browser.newContext({ ...opcoes, locale: "pt-BR", timezoneId: "America/Sao_Paulo" });
    const host = new URL(BASE).hostname;
    await contexto.addCookies([{ name: "avila_ops_session", value: token, domain: host, path: "/", httpOnly: true }]);
    // Preferência manual do tema da casa, válida por uma hora (src/lib/tema-noturno).
    const valor = JSON.stringify({ tema: tema === "escuro" ? "dark" : "light", ate: Date.now() + 3_600_000 });
    await contexto.addInitScript((v) => localStorage.setItem("avilaops-tema", v), valor);

    const pagina = await contexto.newPage();
    for (const [nome, caminho] of telas) {
      const resposta = await pagina.goto(BASE + caminho, { waitUntil: "networkidle", timeout: 90_000 });
      const status = resposta?.status() ?? 0;
      if (status >= 400 || new URL(pagina.url()).pathname === "/login") falhas.push(`${caminho} → ${status} ${pagina.url()}`);
      // Em print de página inteira, barra fixa aparece no meio da imagem: fica no fim do fluxo.
      await pagina.addStyleTag({ content: ".tab-bar,.mobile-topbar{position:static!important}" });
      await pagina.screenshot({ path: `${SAIDA}/${nomeFormato}-${tema}-${nome}.png`, fullPage: true });
    }
    await contexto.close();
  }
}

await browser.close();
if (falhas.length) {
  console.error("Telas com problema:\n" + falhas.join("\n"));
  process.exit(1);
}
console.log(`Prints em ${SAIDA}/`);

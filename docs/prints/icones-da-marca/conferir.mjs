/**
 * Conferência visual do gerador de ícones, nos dois temas e nos dois tamanhos.
 * Loga, abre a aba "Identidade e arquivos", fotografa, gera os ícones de
 * verdade e fotografa de novo. Reprova se o console soltar erro ou se a página
 * estourar na horizontal.
 */
import { chromium } from "playwright-core";
import { mkdir, readFile } from "node:fs/promises";

const TOKEN = (await readFile("./token.txt", "utf8")).trim();

const EXE = "C:/Users/nicol/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe";
const BASE = "http://localhost:3210";
const SAIDA = process.argv[2] ?? "./tiros";
const ORG = "org-visual";

const TELAS = [
  { nome: "iphone", width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  { nome: "desktop", width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
];

const problemas = [];

/**
 * Mede a página E o bloco do gerador. Só o documento não basta: o <pre> do
 * trecho de <head> alargava o bloco para fora da tela sem mexer no
 * scrollWidth do documento, e a primeira versão desta função deu tudo certo
 * numa tela que estava visivelmente cortada no iPhone.
 */
async function conferirLargura(page, rotulo) {
  const medida = await page.evaluate(() => {
    const doc = document.documentElement;
    const bloco = document.querySelector(".icon-generator");
    return {
      scroll: doc.scrollWidth,
      cliente: doc.clientWidth,
      blocoLargura: bloco ? Math.round(bloco.getBoundingClientRect().width) : 0,
      blocoScroll: bloco ? bloco.scrollWidth : 0,
    };
  });
  if (medida.scroll > medida.cliente + 1) {
    problemas.push(`${rotulo}: documento estoura (${medida.scroll} > ${medida.cliente})`);
  }
  if (medida.blocoLargura > medida.cliente) {
    problemas.push(`${rotulo}: bloco mais largo que a tela (${medida.blocoLargura} > ${medida.cliente})`);
  }
  if (medida.blocoScroll > medida.blocoLargura + 1) {
    problemas.push(`${rotulo}: conteúdo vaza do bloco (${medida.blocoScroll} > ${medida.blocoLargura})`);
  }
  return medida;
}

/** `?section=files` já abre a ficha na aba "Identidade e arquivos". */
const URL_IDENTIDADE = `${BASE}/clientes/${ORG}?section=files`;

async function rodar(tema) {
  const navegador = await chromium.launch({ executablePath: EXE });
  for (const tela of TELAS) {
    const contexto = await navegador.newContext({
      viewport: { width: tela.width, height: tela.height },
      deviceScaleFactor: tela.deviceScaleFactor,
      isMobile: tela.isMobile,
      hasTouch: tela.hasTouch,
      colorScheme: tema,
    });

    // O Ávila OS não usa prefers-color-scheme: o tema é `data-theme` no <html>,
    // gravado por um script no <head> a partir do localStorage. Sem plantar o
    // override, as duas passagens sairiam idênticas.
    await contexto.addInitScript(
      ([chave, t]) => {
        try {
          window.localStorage.setItem(chave, JSON.stringify({ tema: t, ate: Date.now() + 86400000 }));
        } catch {}
      },
      ["avilaops-tema", tema],
    );
    const page = await contexto.newPage();
    const rotulo = `${tela.nome}/${tema}`;

    // O websocket do HMR do dev server não conecta neste ambiente; é ruído do
    // servidor de desenvolvimento, não defeito da tela.
    const RUIDO = /webpack-hmr|WebSocket connection|react-devtools/i;
    page.on("console", (m) => {
      if (m.type() === "error" && !RUIDO.test(m.text())) {
        problemas.push(`${rotulo}: console.error — ${m.text()}`);
      }
    });
    page.on("pageerror", (e) => problemas.push(`${rotulo}: pageerror — ${e.message}`));

    await contexto.addCookies([
      { name: "avila_ops_session", value: TOKEN, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" },
      { name: "color_scheme", value: tema, domain: "localhost", path: "/", sameSite: "Lax" },
    ]);

    await page.goto(URL_IDENTIDADE, { waitUntil: "networkidle" });

    const gerador = page.locator(".icon-generator");
    await gerador.waitFor({ state: "visible", timeout: 15000 });
    await gerador.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);

    const temaNaTela = await page.evaluate(() => document.documentElement.dataset.theme);
    if (temaNaTela !== tema) problemas.push(`${rotulo}: a página pintou "${temaNaTela}", não "${tema}"`);

    await conferirLargura(page, rotulo);
    await gerador.screenshot({ path: `${SAIDA}/${tela.nome}-${tema}-1-antes.png` });

    // Abre o bloco de código para conferir o <pre> que costuma vazar largura.
    const detalhes = page.locator(".icon-generator-codigo summary");
    if (await detalhes.count()) {
      await detalhes.click();
      await page.waitForTimeout(250);
      await conferirLargura(page, `${rotulo} (código aberto)`);
      await gerador.screenshot({ path: `${SAIDA}/${tela.nome}-${tema}-2-codigo.png` });
      await detalhes.click();
    }

    // Só o desktop no tema escuro dispara a geração de verdade: uma vez basta,
    // e as outras passagens conferem o estado "conjunto completo".
    if (tela.nome === "desktop" && tema === "dark") {
      const botao = page.getByRole("button", { name: /^Gerar \d+ ícones?$/ });
      if (await botao.count()) {
        await botao.click();
        await page.locator(".icon-generator-ok, .icon-generator-erro").waitFor({ timeout: 60000 });
        await page.waitForTimeout(1500);
        await gerador.screenshot({ path: `${SAIDA}/${tela.nome}-${tema}-3-depois.png` });
        const ok = await page.locator(".icon-generator-ok").count();
        const erro = await page.locator(".icon-generator-erro").textContent().catch(() => null);
        if (!ok) problemas.push(`${rotulo}: geração falhou — ${erro ?? "sem mensagem"}`);
        await page.screenshot({ path: `${SAIDA}/${tela.nome}-${tema}-4-pagina.png`, fullPage: false });
      } else {
        problemas.push(`${rotulo}: botão "Gerar N ícones" não apareceu`);
      }
    }

    await contexto.close();
  }
  await navegador.close();
}

await mkdir(SAIDA, { recursive: true });
for (const tema of ["light", "dark"]) await rodar(tema);

if (problemas.length) {
  console.log("PROBLEMAS:");
  for (const p of problemas) console.log(" -", p);
  process.exit(1);
}
console.log("OK: sem erro de console e sem estouro horizontal.");

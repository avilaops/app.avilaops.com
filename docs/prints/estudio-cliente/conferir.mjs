/**
 * Conferência visual do vínculo peça ↔ cliente no Estúdio.
 * Cria uma peça para o cliente, abre o editor e fotografa a pré-visualização:
 * a peça tem que sair com a logo e as cores do cliente, não com a marca da casa.
 */
import { chromium } from "playwright-core";
import { mkdir, readFile } from "node:fs/promises";

const EXE = "C:/Users/nicol/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe";
const BASE = "http://localhost:3210";
const SAIDA = process.argv[2] ?? "./estudio";
const TOKEN = (await readFile("./token.txt", "utf8")).trim();

const TELAS = [
  { nome: "iphone", width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  { nome: "desktop", width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
];

const problemas = [];
const RUIDO = /webpack-hmr|WebSocket connection|react-devtools/i;

async function conferirLargura(page, rotulo) {
  const m = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    cliente: document.documentElement.clientWidth,
  }));
  if (m.scroll > m.cliente + 1) problemas.push(`${rotulo}: documento estoura (${m.scroll} > ${m.cliente})`);
}

async function rodar(tema) {
  const navegador = await chromium.launch({ executablePath: EXE });
  for (const tela of TELAS) {
    const contexto = await navegador.newContext({
      viewport: { width: tela.width, height: tela.height },
      deviceScaleFactor: tela.deviceScaleFactor,
      isMobile: tela.isMobile,
      hasTouch: tela.hasTouch,
    });
    await contexto.addInitScript(
      ([chave, t]) => {
        try {
          window.localStorage.setItem(chave, JSON.stringify({ tema: t, ate: Date.now() + 86400000 }));
        } catch {}
      },
      ["avilaops-tema", tema],
    );
    await contexto.addCookies([
      { name: "avila_ops_session", value: TOKEN, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" },
      { name: "color_scheme", value: tema, domain: "localhost", path: "/", sameSite: "Lax" },
    ]);

    const page = await contexto.newPage();
    const rotulo = `${tela.nome}/${tema}`;
    page.on("console", (m) => {
      if (m.type() === "error" && !RUIDO.test(m.text())) problemas.push(`${rotulo}: console.error — ${m.text()}`);
    });
    page.on("pageerror", (e) => problemas.push(`${rotulo}: pageerror — ${e.message}`));

    await page.goto(`${BASE}/hub-social/estudio`, { waitUntil: "networkidle" });
    const temaNaTela = await page.evaluate(() => document.documentElement.dataset.theme);
    if (temaNaTela !== tema) problemas.push(`${rotulo}: pintou "${temaNaTela}", não "${tema}"`);

    await conferirLargura(page, rotulo);
    await page.screenshot({ path: `${SAIDA}/${tela.nome}-${tema}-1-lista.png`, fullPage: false });

    // Folha "Nova peça": o seletor de cliente é o que estamos conferindo.
    await page.getByRole("button", { name: "Nova peça" }).first().click();
    const seletor = page.locator('select').first();
    await seletor.waitFor({ timeout: 10000 });
    const opcoes = await seletor.locator("option").allTextContents();
    if (!opcoes.some((o) => /Ávila Ops \(peça da casa\)/.test(o))) {
      problemas.push(`${rotulo}: falta a opção da casa no seletor de cliente`);
    }
    if (!opcoes.some((o) => /Saúde Pet Brasil/.test(o))) {
      problemas.push(`${rotulo}: o cliente semeado não aparece no seletor`);
    }
    await conferirLargura(page, `${rotulo} (nova peça)`);
    await page.screenshot({ path: `${SAIDA}/${tela.nome}-${tema}-2-nova-peca.png`, fullPage: false });

    // Só uma passagem cria a peça de verdade e abre o editor.
    if (tela.nome === "desktop" && tema === "dark") {
      await seletor.selectOption({ label: "Saúde Pet Brasil" });
      // "Cena com personagem" não usa a marca em pixel nenhum e "Cartão de
      // chamada" só usa o site e as cores. "Post de frase" usa os quatro:
      // logo, nome, site e as duas cores — é o que prova o vínculo inteiro.
      // O radio fica atrás do rótulo; clicar no card é o que a pessoa faz.
      await page.locator("label.estudio-template-card", { hasText: "Post de frase" }).first().click();
      await page.screenshot({ path: `${SAIDA}/${tela.nome}-${tema}-3-cliente-escolhido.png` });
      await page.getByRole("button", { name: /Criar e editar/ }).click();
      await page.waitForURL(/\/hub-social\/estudio\/[a-z0-9]+/, { timeout: 30000 });
      await page.waitForTimeout(2500);
      await conferirLargura(page, `${rotulo} (editor)`);
      await page.screenshot({ path: `${SAIDA}/${tela.nome}-${tema}-4-editor.png`, fullPage: false });

      // A prova: o iframe da pré-visualização tem que trazer a logo do cliente
      // embutida em base64, e não o PNG da casa.
      const dentro = await page.evaluate(() => {
        const f = document.querySelector("iframe");
        const html = f?.contentDocument?.documentElement?.outerHTML ?? "";
        return {
          tamanho: html.length,
          temDataUri: html.includes("data:image/png;base64,"),
          temLogoDaCasa: html.includes("/estudio/logo-avilaops.png"),
          temNomeDoCliente: html.includes("SAÚDE PET"),
          temCorDaCasa: html.includes("#102840"),
        };
      });
      if (dentro.temCorDaCasa) problemas.push(`${rotulo}: a peça ainda usa a cor da casa (#102840)`);
      if (!dentro.temDataUri) problemas.push(`${rotulo}: a pré-visualização não embutiu a logo do cliente`);
      if (dentro.temLogoDaCasa) problemas.push(`${rotulo}: a peça do cliente ainda usa a logo da Ávila Ops`);
      if (!dentro.temNomeDoCliente) problemas.push(`${rotulo}: o nome do cliente não chegou na peça`);
      console.log("dentro do iframe:", JSON.stringify(dentro));
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
console.log("OK: seletor de cliente presente e peça renderizando com a marca do cliente.");

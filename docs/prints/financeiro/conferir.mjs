/**
 * Conferência visual do módulo Financeiro: cada rota em 390, 768 e 1440 de
 * largura, nos temas claro e escuro. Fotografa a página inteira e reprova se:
 *
 * - o console soltar erro (menos o ruído do HMR do dev server);
 * - o tema pintado não for o pedido (o Ávila OS usa `data-theme`, não
 *   `prefers-color-scheme`: sem plantar o override as duas passagens saem
 *   iguais e ninguém percebe);
 * - qualquer bloco passar da largura da tela. Medir só o documento dá falso
 *   "sem estouro" (ver docs/prints/icones-da-marca): aqui cada elemento dentro
 *   do conteúdo é medido, e só escapa quem mora dentro de um contêiner que
 *   rola na horizontal de propósito;
 * - no celular, o último elemento do conteúdo ficar escondido atrás da barra
 *   de abas.
 *
 *   node conferir.mjs <pasta-de-saída> [prefixo]
 */
import { chromium } from "playwright-core";
import { mkdir, readFile } from "node:fs/promises";

const TOKEN = (await readFile(process.env.TOKEN_FILE ?? "./token.txt", "utf8")).trim();
const EXE = process.env.CHROME ?? "C:/Users/nicol/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe";
const BASE = process.env.BASE ?? "http://localhost:3211";
const SAIDA = process.argv[2] ?? "./tiros";
const PREFIXO = process.argv[3] ?? "";
const ROTAS = (process.env.ROTAS ?? "/financeiro,/financeiro/contas,/financeiro/mercadopago,/relatorios,/financeiro/importar,/financeiro/credito").split(",");

const TELAS = [
  { nome: "390", width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  { nome: "768", width: 768, height: 1024, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
  { nome: "1440", width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
];

const problemas = [];

async function conferirLargura(page, rotulo) {
  const achados = await page.evaluate(() => {
    const largura = document.documentElement.clientWidth;
    const saida = [];
    if (document.documentElement.scrollWidth > largura + 1) {
      saida.push(`documento ${document.documentElement.scrollWidth} > ${largura}`);
    }
    const raiz = document.querySelector("main") ?? document.body;
    // Contêiner que rola na horizontal de propósito (abas, tabela larga) não
    // é estouro. Contêiner com overflow hidden que corta o filho é: foi assim
    // que o cartão de alerta do Mercado Pago sumia pela direita sem que o
    // documento acusasse nada.
    const dentroDeRolagem = (el) => {
      for (let p = el.parentElement; p && p !== raiz; p = p.parentElement) {
        if (/(auto|scroll)/.test(getComputedStyle(p).overflowX)) return true;
      }
      return false;
    };
    const cortadoPor = (el, caixa) => {
      for (let p = el.parentElement; p && p !== raiz; p = p.parentElement) {
        if (/(auto|scroll)/.test(getComputedStyle(p).overflowX)) return null;
        if (/(hidden|clip)/.test(getComputedStyle(p).overflowX)) {
          const limite = p.getBoundingClientRect();
          if (caixa.right > limite.right + 1) return p;
        }
      }
      return null;
    };
    const nomeDe = (el) =>
      `${el.tagName.toLowerCase()}${typeof el.className === "string" && el.className.trim() ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : ""}`;
    for (const el of raiz.querySelectorAll("*")) {
      const caixa = el.getBoundingClientRect();
      if (caixa.width === 0 || caixa.height === 0) continue;
      if (getComputedStyle(el).position === "fixed") continue;
      // Texto com reticências de propósito não conta: é corte desenhado.
      if (getComputedStyle(el).textOverflow === "ellipsis") continue;
      if (caixa.right > largura + 1 && !dentroDeRolagem(el)) {
        saida.push(`${nomeDe(el)} vai até ${Math.round(caixa.right)}px`);
      } else {
        const pai = cortadoPor(el, caixa);
        if (pai && el.children.length === 0) saida.push(`${nomeDe(el)} cortado por ${nomeDe(pai)}`);
      }
      if (saida.length > 6) break;
    }
    return saida;
  });
  for (const achado of achados) problemas.push(`${rotulo}: ${achado}`);
}

/** No celular, o fim do conteúdo precisa ficar acima da barra de abas. */
async function conferirBarraInferior(page, rotulo) {
  const r = await page.evaluate(async () => {
    window.scrollTo(0, document.documentElement.scrollHeight);
    await new Promise((ok) => setTimeout(ok, 250));
    const barra = document.querySelector(".tab-bar");
    const main = document.querySelector("main");
    if (!barra || !main || getComputedStyle(barra).display === "none") return null;
    const topoBarra = barra.getBoundingClientRect().top;
    const folhas = [...main.querySelectorAll("*")].filter(
      (el) => el.children.length === 0 && el.getBoundingClientRect().height > 0,
    );
    const fim = Math.max(...folhas.map((el) => el.getBoundingClientRect().bottom));
    return { topoBarra: Math.round(topoBarra), fim: Math.round(fim) };
  });
  if (r && r.fim > r.topoBarra) problemas.push(`${rotulo}: conteúdo termina em ${r.fim}px, atrás da barra (${r.topoBarra}px)`);
}

async function rodar(tema) {
  const navegador = await chromium.launch({ executablePath: EXE });
  for (const tela of TELAS) {
    const contexto = await navegador.newContext({
      viewport: { width: tela.width, height: tela.height },
      deviceScaleFactor: tela.deviceScaleFactor,
      isMobile: tela.isMobile,
      hasTouch: tela.hasTouch,
      colorScheme: tema,
      locale: "pt-BR",
      timezoneId: "America/Sao_Paulo",
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

    for (const rota of ROTAS) {
      const page = await contexto.newPage();
      const nomeRota = rota.replace(/^\//, "").replace(/[/?=&]+/g, "-") || "inicio";
      const rotulo = `${nomeRota} ${tela.nome}/${tema}`;
      const RUIDO = /webpack-hmr|WebSocket connection|react-devtools|Download the React DevTools/i;
      page.on("console", (m) => {
        if (m.type() === "error" && !RUIDO.test(m.text())) problemas.push(`${rotulo}: console.error ${m.text().slice(0, 200)}`);
      });
      page.on("pageerror", (e) => problemas.push(`${rotulo}: pageerror ${e.message}`));

      const resposta = await page.goto(BASE + rota, { waitUntil: "networkidle", timeout: 90000 });
      if (!resposta || resposta.status() >= 400 || !page.url().startsWith(BASE + rota.split("?")[0])) {
        problemas.push(`${rotulo}: abriu ${page.url()} com ${resposta?.status()}`);
      }
      await page.waitForTimeout(1500);
      const temaNaTela = await page.evaluate(() => document.documentElement.dataset.theme);
      if (temaNaTela !== tema) problemas.push(`${rotulo}: pintou "${temaNaTela}"`);

      await conferirLargura(page, rotulo);
      // Na página inteira a barra de abas (fixa) sairia pintada no meio do
      // print; ela some só para esta foto, e a foto seguinte mostra o fim da
      // página com a barra no lugar, que é o que interessa conferir.
      await page.addStyleTag({ content: ".tab-bar{visibility:hidden}" }).then((tag) =>
        page.screenshot({ path: `${SAIDA}/${PREFIXO}${nomeRota}-${tela.nome}-${tema}.png`, fullPage: true }).then(() => tag.evaluate((t) => t.remove())),
      );
      if (tela.isMobile && tela.width < 821) {
        await conferirBarraInferior(page, rotulo);
        await page.screenshot({ path: `${SAIDA}/${PREFIXO}${nomeRota}-${tela.nome}-${tema}-fim.png` });
      }
      await page.close();
    }
    await contexto.close();
  }
  await navegador.close();
}

await mkdir(SAIDA, { recursive: true });
for (const tema of (process.env.TEMAS ?? "light,dark").split(",")) await rodar(tema);

if (problemas.length) {
  console.log(`${problemas.length} problema(s):`);
  for (const p of problemas) console.log(" -", p);
  process.exitCode = 1;
} else {
  console.log("Sem problemas.");
}

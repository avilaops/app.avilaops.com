/**
 * Conferência visual do cofre com os logotipos dos provedores.
 *
 * Entra por cookie de sessão (o clique em "Entrar" acontece antes da hidratação
 * e vira POST nativo, que a API recusa) e troca o tema pelo `localStorage`, que
 * guarda `{ tema, ate }` em JSON. `colorScheme` do Playwright não muda nada
 * aqui: o Ávila OS lê `data-theme` no `<html>`.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";
import jwt from "jsonwebtoken";

const BASE = "http://localhost:3210";
const ROTA = "/operacao/credenciais";
const SAIDA = process.argv[2] ?? "./tiros";
const SEGREDO = "segredo-conferencia-visual-local";

const TELAS = [
  { nome: "desktop", viewport: { width: 1440, height: 900 }, dpr: 1 },
  { nome: "iphone", viewport: { width: 390, height: 844 }, dpr: 2 },
];

const token = jwt.sign({ sub: "admin-visual", role: "OWNER" }, SEGREDO, { expiresIn: 28800 });

const problemas = [];

async function conferirLargura(page, rotulo) {
  const medida = await page.evaluate(() => {
    const doc = document.documentElement;
    const grupos = [...document.querySelectorAll(".grupo")];
    const maiorGrupo = Math.max(0, ...grupos.map((g) => g.scrollWidth));
    const titulos = [...document.querySelectorAll(".grupo-titulo")];
    const maiorTitulo = Math.max(0, ...titulos.map((t) => t.scrollWidth));
    return {
      documento: doc.scrollWidth,
      janela: doc.clientWidth,
      maiorGrupo,
      maiorTitulo,
      tema: doc.getAttribute("data-theme"),
      logos: [...document.querySelectorAll(".logo-social")].map((img) => ({
        src: img.getAttribute("src"),
        largura: img.clientWidth,
        altura: img.clientHeight,
        completa: img.complete && img.naturalWidth > 0,
        mono: img.classList.contains("logo-social--mono"),
      })),
    };
  });

  if (medida.documento > medida.janela + 1) {
    problemas.push(`${rotulo}: documento ${medida.documento}px numa janela de ${medida.janela}px`);
  }
  if (medida.maiorGrupo > medida.janela + 1) {
    problemas.push(`${rotulo}: grupo ${medida.maiorGrupo}px numa janela de ${medida.janela}px`);
  }
  const quebradas = medida.logos.filter((l) => !l.completa);
  if (quebradas.length) {
    problemas.push(`${rotulo}: logotipo que não carregou: ${quebradas.map((l) => l.src).join(", ")}`);
  }
  const amassadas = medida.logos.filter((l) => l.largura !== 16 || l.altura !== 16);
  if (amassadas.length) {
    problemas.push(
      `${rotulo}: logotipo fora de 16x16: ${amassadas.map((l) => `${l.src} ${l.largura}x${l.altura}`).join(", ")}`,
    );
  }
  return medida;
}

async function main() {
  await mkdir(SAIDA, { recursive: true });
  const navegador = await chromium.launch();

  for (const tela of TELAS) {
    for (const tema of ["light", "dark"]) {
      const contexto = await navegador.newContext({
        viewport: tela.viewport,
        deviceScaleFactor: tela.dpr,
      });
      await contexto.addCookies([
        { name: "avila_ops_session", value: token, url: BASE },
        { name: "color_scheme", value: tema, url: BASE },
      ]);
      await contexto.addInitScript(
        ([t]) => {
          const ate = Date.now() + 1000 * 60 * 60 * 12;
          window.localStorage.setItem("avilaops-tema", JSON.stringify({ tema: t, ate }));
        },
        [tema],
      );

      const page = await contexto.newPage();
      const erros = [];
      page.on("console", (m) => {
        if (m.type() === "error" && !m.text().includes("websocket")) erros.push(m.text());
      });
      page.on("pageerror", (e) => erros.push(String(e)));

      await page.goto(`${BASE}${ROTA}`, { waitUntil: "networkidle" });
      await page.waitForSelector(".grupo-titulo", { timeout: 20000 });
      await page.waitForTimeout(600);

      const rotulo = `${tela.nome}-${tema}`;
      const medida = await conferirLargura(page, rotulo);

      if (medida.tema !== tema) {
        problemas.push(`${rotulo}: pedi tema ${tema}, a página pintou ${medida.tema}`);
      }
      if (erros.length) problemas.push(`${rotulo}: console.error -> ${erros.join(" | ")}`);

      await page.screenshot({ path: path.join(SAIDA, `${rotulo}.png`), fullPage: true });
      console.log(
        `${rotulo}: tema=${medida.tema} logos=${medida.logos.length} ` +
          `mono=${medida.logos.filter((l) => l.mono).length} doc=${medida.documento}/${medida.janela}`,
      );
      await contexto.close();
    }
  }

  await navegador.close();

  await writeFile(
    path.join(SAIDA, "relatorio.txt"),
    problemas.length ? problemas.join("\n") : "sem problemas",
    "utf8",
  );

  if (problemas.length) {
    console.error("\nREPROVOU:");
    for (const p of problemas) console.error(" - " + p);
    process.exit(1);
  }
  console.log("\nsem problemas");
}

main();

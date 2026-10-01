/**
 * Sonda rápida: a mesma lista não pode aparecer duas vezes na mesma tela.
 *
 * As telas de Lojas trazem duas apresentações do mesmo dado — uma lista de
 * linhas no celular e uma tabela no desktop — e cada uma some no tamanho da
 * outra. Em 19/09/2026 as duas apareciam juntas em toda largura de desktop, e
 * o print não denunciava: cada metade estava bonita, o defeito era existirem
 * as duas. Ninguém lê 1.900px de print procurando repetição.
 *
 * Foram duas causas somadas, e as duas são armadilha de repetição:
 *
 * 1. `globals.css` entra depois do `@import "tailwindcss"` e sem `@layer`, e
 *    utilitário e classe própria têm a mesma especificidade. Em
 *    `class="min-[821px]:hidden pilha"` o `display:flex` de `.pilha` ganhava.
 * 2. No Tailwind 4 `max-*` é exclusivo (`< valor`), então o par 820/821 não
 *    cobria a largura de exatamente 820px.
 *
 * Irmã do `conferir-sharp.mjs`: dois segundos aqui contra um defeito que
 * chegou a produção e sobreviveu a uma revisão inteira.
 */
import jwt from "jsonwebtoken";
import { chromium } from "playwright";

const BASE = process.env.PRINTS_BASE_URL ?? "http://127.0.0.1:3000";
const token = jwt.sign({ sub: "prints-owner", role: "OWNER" }, process.env.APP_JWT_SECRET, { expiresIn: 3600 });

/** As duas pontas e a fronteira, que é onde o par de breakpoints se desencontra. */
const LARGURAS = [375, 430, 819, 820, 821, 1024, 1440];
const TELAS = ["/lojas", "/lojas/padaria-aurora"];

// No CI o `playwright install` põe o Chromium onde a biblioteca espera. Fora
// dele, `PW_CHROMIUM` aponta para um binário já instalado na máquina — sem
// isso esta sonda só roda no CI, e sonda que não roda à mão não é usada.
const navegador = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
const falhas = [];

for (const caminho of TELAS) {
  for (const width of LARGURAS) {
    const ctx = await navegador.newContext({ viewport: { width, height: 900 } });
    await ctx.addCookies([
      { name: "avila_ops_session", value: token, domain: "127.0.0.1", path: "/", httpOnly: true },
    ]);
    const pagina = await ctx.newPage();
    await pagina.goto(BASE + caminho, { waitUntil: "networkidle" });
    if (new URL(pagina.url()).pathname !== caminho) {
      falhas.push(`${caminho} @${width}px: caiu em ${pagina.url()} — a sonda não chegou a medir nada`);
      await ctx.close();
      continue;
    }
    const estado = await pagina.evaluate(() => {
      const visivel = (el) => el instanceof HTMLElement && el.offsetParent !== null;
      const lista = [...document.querySelectorAll('[class*="min-["][class*="hidden"]')].filter(
        (el) => el.querySelector(".grupo"),
      );
      const tabela = [...document.querySelectorAll('[class*="max-["][class*="hidden"]')].filter((el) =>
        el.querySelector("table"),
      );
      return { lista: lista.filter(visivel).length, tabela: tabela.filter(visivel).length };
    });
    if (estado.lista > 0 && estado.tabela > 0) {
      falhas.push(`${caminho} @${width}px: lista de celular e tabela visíveis ao mesmo tempo`);
    }
    if (estado.lista === 0 && estado.tabela === 0) {
      falhas.push(`${caminho} @${width}px: nenhuma das duas apresentações apareceu`);
    }
    await ctx.close();
  }
}

await navegador.close();

if (falhas.length) {
  console.error("Apresentações duplicadas (ou nenhuma):");
  for (const f of falhas) console.error(" -", f);
  process.exit(1);
}
console.log(`Sem duplicata em ${TELAS.length} telas × ${LARGURAS.length} larguras.`);

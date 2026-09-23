/**
 * Prints do painel para revisão visual no PR: desktop e três iPhones, claro e
 * escuro. Roda no GitHub Actions contra o app local com dados fictícios
 * (semear.ts).
 *
 * Por que quatro iPhones e não um: docs/auditoria-mobile-ios.md pede conferência
 * a 375×812 e 430×932, e até 17/09/2026 o CI só capturava 390×844 — o aparelho
 * do meio, justamente o que não mostra nem o aperto do menor nem a sobra do
 * maior. O 393×852 entrou em 19/09/2026 com a passada de densidade: é a
 * largura do iPhone 15/16 Pro, o aparelho mais comum hoje. Os 16 itens de QA da auditoria seguem sem aparelho real; estes prints
 * não os substituem, mas cobrem o que imagem consegue provar.
 *
 * Duas armadilhas que custaram tempo e ficam registradas aqui:
 *
 * 1. `next.config.ts` usa `output: "standalone"`, e o Next avisa no próprio log
 *    que `next start` não funciona com isso. Na prática serve a página mas
 *    devolve 404 em parte dos chunks, e a árvore some na hidratação — print
 *    silenciosamente errado, que é pior do que print ausente. O app é servido
 *    por `node .next/standalone/server.js`, com `.next/static` e `public`
 *    copiados para dentro do bundle (ver o workflow).
 * 2. Navegar de uma tela para outra na mesma aba faz o roteador do Next abortar
 *    os chunks em voo (ERR_ABORTED) e a árvore some. Cada tela ganha uma página
 *    nova — print não precisa exercitar transição de rota.
 *
 * Se você estiver comparando dois conjuntos de prints byte a byte (o jeito de
 * provar que uma mudança de CSS não mexeu em nada), saiba que a captura é
 * determinística — duas rodadas da mesma build dão 164 PNGs idênticos — com
 * uma exceção: **horário relativo**. `/hub-social/dominios` mostra "sync há N h"
 * contra o relógio, então um par antes/depois separado por tempo suficiente
 * diverge nessa tela sem que uma linha de CSS tenha mudado. Antes de tratar uma
 * diferença como regressão, abra o PNG e confira se o que mudou não é um número
 * de horas.
 */
import { mkdir } from "node:fs/promises";
import jwt from "jsonwebtoken";
import { chromium, devices } from "playwright";

const BASE = process.env.PRINTS_BASE_URL ?? "http://127.0.0.1:3000";
const SAIDA = process.env.PRINTS_SAIDA ?? "prints";
const token = jwt.sign({ sub: "prints-owner", role: "OWNER" }, process.env.APP_JWT_SECRET, { expiresIn: 3600 });

/**
 * `abrirMenu` diz que a tela só existe depois de um toque: a folha "Mais" não
 * está no DOM enquanto fechada, então nenhum print a mostrava.
 */
const telas = [
  // Hub Social — os sete canais
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

  // O resto do painel, que a varredura mobile precisa ver
  ["operacao", "/operacao"],
  ["clientes", "/clientes"],
  ["projetos", "/projetos"],
  ["vagas", "/vagas"],
  ["implantacao", "/implantacao"],
  ["financeiro", "/financeiro"],
  ["financeiro-mercadopago", "/financeiro/mercadopago"],

  // O menu, nos dois lados da regra de abertura: em /operacao a tela tem aba e
  // nenhum grupo abre; em /hub-social/seo não tem, e o grupo dela abre sozinho.
  ["menu-com-aba", "/operacao", { abrirMenu: true }],
  ["menu-sem-aba", "/hub-social/seo", { abrirMenu: true }],
];

const formatos = [
  ["desktop", { viewport: { width: 1440, height: 900 } }],
  // Os três aparelhos que a auditoria cita, do mais apertado ao mais folgado.
  ["iphone-se", { ...devices["iPhone 13"], viewport: { width: 375, height: 812 } }],
  ["iphone-13", devices["iPhone 13"]],
  ["iphone-15", { ...devices["iPhone 13"], viewport: { width: 393, height: 852 } }],
  ["iphone-max", { ...devices["iPhone 13"], viewport: { width: 430, height: 932 } }],
];

// No CI o Playwright instala o próprio Chromium e o caminho padrão serve.
// PW_CHROMIUM existe para rodar a captura localmente contra um navegador que a
// máquina já tem, sem baixar outro de 150 MB só para tirar print.
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
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

    for (const [nome, caminho, opcoesTela = {}] of telas) {
      // Página nova por tela: ver a armadilha 2 no cabeçalho.
      const pagina = await contexto.newPage();
      const resposta = await pagina.goto(BASE + caminho, { waitUntil: "networkidle", timeout: 90_000 });
      const status = resposta?.status() ?? 0;
      if (status >= 400 || new URL(pagina.url()).pathname === "/login") falhas.push(`${caminho} → ${status} ${pagina.url()}`);

      if (opcoesTela.abrirMenu) {
        // A folha do menu só existe no celular; no desktop o botão nem aparece.
        const botao = pagina.getByRole("button", { name: "Mais" });
        if ((await botao.count()) === 0) {
          await pagina.close();
          continue;
        }
        await botao.click();
        // A folha sobe em 240ms; sem esperar, o print pega a página de trás
        // aparecendo através dela.
        await pagina.locator(".sheet-group-toggle").first().waitFor({ state: "visible", timeout: 15_000 });
        await pagina.waitForTimeout(500);
        // Folha é modal e rola por dentro: print da janela, não da página toda.
        await pagina.screenshot({ path: `${SAIDA}/${nomeFormato}-${tema}-${nome}.png` });
        await pagina.close();
        continue;
      }

      // Em print de página inteira, barra fixa aparece no meio da imagem: fica no fim do fluxo.
      await pagina.addStyleTag({ content: ".tab-bar,.mobile-topbar{position:static!important}" });
      await pagina.screenshot({ path: `${SAIDA}/${nomeFormato}-${tema}-${nome}.png`, fullPage: true });
      await pagina.close();
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

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ehDaCasa, ehDono, rotuloDoPapel } from "@/lib/auth";
import { navegacaoDoPapel } from "@/lib/navegacao";

/**
 * O sócio entra no painel e não no caixa.
 *
 * `SOCIO` existe para dar a alguém a operação inteira sem entregar dinheiro,
 * segredo e concessão de acesso. Isso só se sustenta enquanto `ehDaCasa()` e
 * `ehDono()` continuarem sendo coisas diferentes: se um dia alguém achar que
 * "da casa" basta para uma rota de dinheiro, o sócio passa a ver o extrato sem
 * que ninguém perceba. Os testes abaixo são o alarme disso.
 */
describe("papel SOCIO", () => {
  it("entra no painel", () => {
    expect(ehDaCasa("SOCIO")).toBe(true);
  });

  it("não é dono: dinheiro, cofre e acesso continuam fora", () => {
    expect(ehDono("SOCIO")).toBe(false);
  });

  it("dono continua dono", () => {
    expect(ehDaCasa("OWNER")).toBe(true);
    expect(ehDono("OWNER")).toBe(true);
  });

  it("cliente e dono de negócio seguem fora do painel", () => {
    for (const papel of ["ADMIN", "CLIENT", "", "socio", "Socio", null, undefined]) {
      expect(ehDaCasa(papel as string)).toBe(false);
      expect(ehDono(papel as string)).toBe(false);
    }
  });

  it("tem nome próprio na tela", () => {
    expect(rotuloDoPapel("SOCIO")).toBe("Sócio");
  });

  it("o menu do sócio não oferece porta que vai ser fechada", () => {
    const doSocio = navegacaoDoPapel("SOCIO");
    const hrefs = doSocio.flatMap((grupo) => grupo.items.map((item) => item.href));

    expect(hrefs.some((href) => href.startsWith("/financeiro"))).toBe(false);
    expect(hrefs).not.toContain("/relatorios");
    // e continua vendo o resto: um menu vazio passaria nos testes acima
    expect(hrefs).toContain("/operacao");
    expect(hrefs).toContain("/clientes");
  });

  it("o menu do dono continua completo", () => {
    const doDono = navegacaoDoPapel("OWNER");
    const hrefs = doDono.flatMap((grupo) => grupo.items.map((item) => item.href));
    expect(hrefs.some((href) => href.startsWith("/financeiro"))).toBe(true);
  });
});

/**
 * Esconder o menu não protege nada: quem souber a URL chega na página. Quem
 * protege é a checagem dentro de cada rota. Este teste lê o código das rotas de
 * dinheiro e exige que cada uma chame `ehDono` — `getAdmin()` sozinho passa a
 * deixar o sócio entrar, que é justamente o que não pode acontecer.
 */
describe("rotas de dinheiro exigem o dono", () => {
  const raiz = join(process.cwd(), "src", "app", "api");

  const rotas = (function achar(dir: string): string[] {
    return readdirSync(dir).flatMap((nome) => {
      const caminho = join(dir, nome);
      if (statSync(caminho).isDirectory()) return achar(caminho);
      return nome === "route.ts" ? [caminho] : [];
    });
  })(raiz);

  const dinheiro = [
    "bank-transactions",
    "ledger-entries",
    "reconciliations",
    "mercadopago",
    "reports",
    "service-plans",
    join("integrations", "wise"),
    join("integrations", "efi"),
    join("organizations"), // cofre, assinatura e acesso moram aqui dentro
  ];

  const sensiveis = rotas.filter((caminho) => {
    const relativo = caminho.slice(raiz.length).replace(/\\/g, "/");

    // Webhook não tem sessão: quem chama é o Mercado Pago, não uma pessoa. O
    // papel não existe para conferir, e a rota se defende consultando a API em
    // vez de confiar no corpo do POST.
    if (relativo.includes("/webhooks/")) return false;

    // "reports" aqui é o relatório financeiro. O de saúde de domínio é SEO e
    // mora no mesmo prefixo por coincidência de nome.
    if (relativo.includes("weekly-health")) return false;

    if (!dinheiro.some((parte) => relativo.includes(parte.replace(/\\/g, "/")))) return false;

    // dentro de organizations/ só o que é dinheiro, segredo ou acesso
    if (relativo.includes("organizations")) {
      return ["cofre", "assinatura", "acesso", "fiscal"].some((p) => relativo.includes(p));
    }
    return true;
  });

  it("achou as rotas para conferir (a lista não pode silenciar vazia)", () => {
    expect(sensiveis.length).toBeGreaterThan(10);
  });

  for (const caminho of sensiveis) {
    const nome = caminho.slice(raiz.length).replace(/\\/g, "/");
    it(`${nome} chama ehDono`, () => {
      expect(readFileSync(caminho, "utf8")).toContain("ehDono");
    });
  }
});

import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import MobileNav from "@/components/MobileNav";
import {
  abasCelular,
  abasDoPapel,
  grupoInicialAberto,
  navegacao,
  navegacaoDoPapel,
  secaoTemAba,
  type SecaoApp,
} from "@/lib/navegacao";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
  usePathname: () => "/operacao",
}));

/**
 * A folha "Mais" tinha 27 itens numa lista plana — quase três telas de rolagem
 * até o último grupo. Com os grupos dobrados o menu cabe numa tela, e a
 * pergunta passa a ser qual abrir sozinho.
 *
 * O que estes testes travam é a regra de abertura e a promessa de que grupo
 * fechado não deixa item no DOM. Sem a segunda, "dobrar" seria só esconder com
 * CSS, e os 27 itens continuariam no Tab e no leitor de tela.
 */

const TODOS = navegacaoDoPapel("OWNER");

describe("regra de qual grupo abre", () => {
  it("abre o grupo onde a tela mora quando ela não tem aba própria", () => {
    // SEO vive no Hub Social e não acende aba nenhuma: quem está no SEO quase
    // sempre quer o vizinho — o Meta, o WhatsApp.
    expect(grupoInicialAberto(TODOS, "seo", false)).toBe("Hub Social");
    expect(grupoInicialAberto(TODOS, "jobs", false)).toBe("Casa");
    expect(grupoInicialAberto(TODOS, "fiscal", false)).toBe("Fiscal");
  });

  it("não abre nada quando a tela já tem aba no rodapé", () => {
    // Quem tem aba chega nela por um toque no rodapé. Abrir "Mais" é o gesto
    // de ir para onde as abas não alcançam — abrir o grupo de onde você veio
    // seria oferecer o caminho que você não pediu.
    expect(grupoInicialAberto(TODOS, "operations", true)).toBeNull();
    expect(grupoInicialAberto(TODOS, "overview", true)).toBeNull();
  });

  it("devolve nulo para seção que não está em grupo nenhum", () => {
    expect(grupoInicialAberto(TODOS, "nao-existe" as SecaoApp, false)).toBeNull();
  });

  it("respeita o papel: sócio não abre grupo que ele não enxerga", () => {
    const doSocio = navegacaoDoPapel("ADMIN");
    // "Fiscal" é somenteDono — para o ADMIN o grupo nem existe.
    expect(doSocio.some((grupo) => grupo.label === "Fiscal")).toBe(false);
    expect(grupoInicialAberto(doSocio, "fiscal", false)).toBeNull();
  });

  it("casa com o que a barra de abas decide, nos dois sentidos", () => {
    // `secaoTemAba` é o outro lado do `maisAtivo` que o componente já usava:
    // se as duas discordassem, a folha abriria grupo para tela com aba.
    for (const grupo of TODOS) {
      for (const item of grupo.items) {
        const temAba = secaoTemAba(abasCelular, item.section);
        const aberto = grupoInicialAberto(TODOS, item.section, temAba);
        if (temAba) expect(aberto).toBeNull();
        else expect(aberto).toBe(grupo.label);
      }
    }
  });
});

describe("folha do menu no celular", () => {
  function render(section: SecaoApp) {
    return renderToStaticMarkup(
      <MobileNav section={section} adminName="Pessoa Dona Exemplo" papel="OWNER" />,
    );
  }

  it("não renderiza a folha enquanto ela não é aberta", () => {
    // A `Sheet` não existe no DOM fechada — o menu inteiro é custo zero até
    // alguém tocar em "Mais".
    const html = render("operations");
    expect(html).not.toContain("sheet-group-toggle");
    expect(html).toContain("tab-bar");
  });

  it("mostra as abas do rodapé e acende a da seção atual", () => {
    const html = render("operations");
    for (const aba of abasDoPapel("OWNER")) {
      expect(html).toContain(`>${aba.label}<`);
    }
    expect(html).toContain("tab-item tab-item-active");
  });

  it("acende o “Mais” quando a tela não pertence a aba nenhuma", () => {
    // SEO mora na folha: o "Mais" aceso é "você está aqui", não "há um menu".
    const html = render("seo");
    expect(html).toContain("tab-item tab-item-active");
    expect(html).toContain(">Mais<");
  });
});

describe("contrato dos grupos dobráveis", () => {
  it("todo grupo tem rótulo único — é ele que identifica o aberto", () => {
    const rotulos = navegacao.map((grupo) => grupo.label);
    expect(new Set(rotulos).size).toBe(rotulos.length);
  });

  it("o rótulo vira um id de lista estável e sem espaço", () => {
    for (const grupo of navegacao) {
      const id = `grupo-${grupo.label.toLowerCase().replace(/\s+/g, "-")}`;
      expect(id).toMatch(/^grupo-[a-zà-ú0-9-]+$/);
    }
  });

  it("nenhum grupo passa de sete itens, então o aberto sempre cabe na tela", () => {
    // O mesmo teto que `navegacao.test.ts` já impõe, dito aqui pelo motivo
    // desta feature: com sete itens o grupo aberto dá ~860px, pouco mais de
    // uma tela. Com doze, dobrar não resolveria nada.
    for (const grupo of navegacao) {
      expect(grupo.items.length).toBeLessThanOrEqual(7);
    }
  });
});

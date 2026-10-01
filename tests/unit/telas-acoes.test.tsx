import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import AcoesDaTela from "@/components/telas/AcoesDaTela";

// As ações usam o roteador do Next; fora do app ele não existe.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => undefined }),
}));

const marcacao = (online: boolean, podeRevogar = true) =>
  renderToStaticMarkup(<AcoesDaTela id="tela-cozinha" nome="Tela da cozinha" online={online} podeRevogar={podeRevogar} />);

describe("ações de uma tela", () => {
  it("com a tela no ar, os três comandos ficam disponíveis", () => {
    const html = marcacao(true);
    expect(html).toContain("Recarregar");
    expect(html).toContain("Avisar");
    expect(html).toContain("Revogar");
    expect(html).not.toContain("Sem pulso: só revogar funciona");
  });

  /**
   * A regra que esta tela existe para respeitar: recarregar e avisar precisam
   * de alguém do outro lado para responder dentro dos 60 s do protocolo, e
   * revogar não — é exatamente assim que se recupera uma tela que ninguém
   * alcança. Oferecer os três botões iguais faria o operador insistir no que
   * não pode funcionar.
   */
  it("com a tela fora do ar, só revogar continua clicável — e a tela diz por quê", () => {
    const html = marcacao(false);
    const botoes = [...html.matchAll(/<button[^>]*>([^<]*)<\/button>/g)].map((m) => ({
      rotulo: m[1].trim(),
      desabilitado: m[0].includes("disabled"),
    }));
    expect(botoes).toEqual([
      { rotulo: "Recarregar", desabilitado: true },
      { rotulo: "Avisar", desabilitado: true },
      { rotulo: "Revogar", desabilitado: false },
    ]);
    expect(html).toContain("Sem pulso: só revogar funciona enquanto a tela não voltar.");
  });

  /**
   * Revogar é irreversível e a rota recusa quem não é o dono. Mostrar o botão
   * ao sócio seria oferecer uma porta que sempre diz não.
   */
  it("para quem não é o dono, revogar não aparece e a tela não promete o que ele não pode", () => {
    const html = marcacao(false, false);
    expect(html).not.toContain(">Revogar<");
    expect(html).not.toContain("só revogar funciona");
    expect(html).toContain("Revogar é com o dono da conta.");
  });
});

import { describe, expect, it } from "vitest";
import { canaisHubSocial, canalDoPathname } from "@/lib/hub-social";
import { navegacao } from "@/lib/navegacao";

const antigos = /^\/operacao\/(seo|dominios|google|meta|whatsapp|newsletter|estudio)(\/|$)/;

describe("hub social", () => {
  it("os sete canais estão no menu, num grupo só e na ordem das abas", () => {
    const grupo = navegacao.find((g) => g.label === "Hub Social");
    expect(grupo?.items.map((i) => i.href)).toEqual(canaisHubSocial.map((c) => c.href));
  });

  it("nenhum item do menu aponta para o caminho antigo em Operação", () => {
    const hrefs = navegacao.flatMap((g) => g.items.map((i) => i.href));
    expect(hrefs.filter((h) => antigos.test(h))).toEqual([]);
  });

  it("cada canal tem seção própria (é ela que acende o menu)", () => {
    const secoes = canaisHubSocial.map((c) => c.section);
    expect(new Set(secoes).size).toBe(secoes.length);
  });

  it("o pathname acha o canal, inclusive em sub-rotas, sem casar prefixo parcial", () => {
    expect(canalDoPathname("/hub-social/seo")?.chave).toBe("seo");
    expect(canalDoPathname("/hub-social/meta/leads")?.chave).toBe("meta");
    expect(canalDoPathname("/hub-social/estudio/abc123")?.chave).toBe("estudio");
    expect(canalDoPathname("/hub-social")).toBeNull();
    expect(canalDoPathname("/hub-social/seoteste")).toBeNull();
    expect(canalDoPathname("/operacao/seo")).toBeNull();
  });
});

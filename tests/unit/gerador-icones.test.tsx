import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import GeradorDeIcones, { type AtivoDaMarca } from "@/components/GeradorDeIcones";
import { ICONES_DERIVADOS } from "@/lib/marca/especificacoes";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
  usePathname: () => "/clientes/abc",
}));

/**
 * O gerador é a porta de entrada dos seis cards de ícone do dossiê. O que estes
 * testes travam é o que a tela promete antes de qualquer clique: sem logo não
 * existe botão, e o botão nunca diz que vai gerar o que já tem arquivo.
 */

function ativo(parcial: Partial<AtivoDaMarca> & { assetType: string }): AtivoDaMarca {
  return {
    id: `id-${parcial.assetType}`,
    name: "arquivo.png",
    mimeType: "image/png",
    version: "1",
    isCurrent: true,
    ...parcial,
  };
}

function renderizar(brandAssets: AtivoDaMarca[]) {
  return renderToStaticMarkup(
    <GeradorDeIcones organizationId="org1" organizationName="Saúde Pet" brandAssets={brandAssets} />,
  );
}

describe("GeradorDeIcones", () => {
  it("sem logo utilizável pede a logo em vez de mostrar um botão que falharia", () => {
    const html = renderizar([
      ativo({ assetType: "Manual da marca", mimeType: "application/pdf", name: "manual.pdf" }),
    ]);
    expect(html).toContain("Envie primeiro uma logo");
    expect(html).not.toContain("Gerar ");
  });

  it("com uma logo, oferece gerar os seis ícones que faltam", () => {
    const html = renderizar([ativo({ assetType: "Logo principal", name: "logo.svg", mimeType: "image/svg+xml" })]);
    expect(html).toContain(`Gerar ${ICONES_DERIVADOS.length} ícones`);
    expect(html).toContain(`${ICONES_DERIVADOS.length} faltando`);
    for (const icone of ICONES_DERIVADOS) expect(html).toContain(icone.assetType);
  });

  it("conta só o que falta: tipo que já tem arquivo fica de fora da chamada", () => {
    const html = renderizar([
      ativo({ assetType: "Logo principal" }),
      ativo({ assetType: "Favicon", mimeType: "image/x-icon", name: "favicon.ico" }),
      ativo({ assetType: "Open Graph Image" }),
    ]);
    expect(html).toContain(`Gerar ${ICONES_DERIVADOS.length - 2} ícones`);
    expect(html).toContain(`${ICONES_DERIVADOS.length - 2} faltando`);
  });

  it("conjunto completo não vira botão ativo: não sobrescreve arte feita à mão sem pedido", () => {
    const html = renderizar([
      ativo({ assetType: "Logo principal" }),
      ...ICONES_DERIVADOS.map((i) => ativo({ assetType: i.assetType })),
    ]);
    expect(html).toContain("conjunto completo");
    expect(html).toContain("Nada a gerar");
    expect(html).toContain("disabled");
  });

  it("versão antiga de um tipo não conta como arquivo atual", () => {
    const html = renderizar([
      ativo({ assetType: "Logo principal" }),
      ativo({ assetType: "Favicon", isCurrent: false, version: "1" }),
    ]);
    expect(html).toContain(`${ICONES_DERIVADOS.length} faltando`);
  });

  it("mostra o código pronto para o site do cliente", () => {
    const html = renderizar([ativo({ assetType: "Logo principal" })]);
    expect(html).toContain("apple-touch-icon.png");
    expect(html).toContain("site.webmanifest");
    expect(html).toContain("Saúde Pet");
  });

  it("mostra a prévia dos seis usos com a logo escolhida, antes de gerar qualquer arquivo", () => {
    const html = renderizar([ativo({ assetType: "Logo principal", name: "logo.svg", mimeType: "image/svg+xml" })]);

    for (const uso of ["Aba do navegador", "Tela do Android", "Tela do iPhone", "Maskable", "WhatsApp (16:9)", "Link compartilhado"]) {
      expect(html).toContain(uso);
    }
    expect(html.match(/src="\/api\/organizations\/org1\/brand-assets\/id-Logo principal\/preview"/g)).toHaveLength(6);
  });

  it("a prévia segue a regra do gerador: maskable com a zona segura, iPhone com fundo, favicon vazado", () => {
    const html = renderizar([ativo({ assetType: "Logo principal" })]);
    const icone = (classe: string) => html.match(new RegExp(`<span class="[^"]*${classe}"[^>]*>`))?.[0] ?? "";

    // Folga padrão de 10%: o maskable ignora e usa os 22% que o Android exige.
    expect(icone("icon-previa-maskable")).toContain("padding:22%");
    expect(icone("icon-previa-android")).toContain("padding:10%");
    // O iOS pinta transparência de preto: sem fundo escolhido, sai branco.
    expect(icone("icon-previa-iphone")).toContain("background:#FFFFFF");
    expect(icone("icon-previa-favicon")).toContain("icon-previa-vazado");
    expect(icone("icon-previa-favicon")).not.toContain("background:");
  });

  it("sem logo não há prévia", () => {
    expect(renderizar([ativo({ assetType: "Manual da marca", mimeType: "application/pdf" })])).not.toContain("icon-previa");
  });
});

/**
 * Os arquivos que a casa entrega em todo site de cliente, gerados a partir do
 * domínio e do nome da empresa. Funções puras: nada aqui vai à rede ou ao
 * banco, então o conteúdo é o mesmo quer ele seja mostrado na tela, gravado
 * como registro ou publicado na borda.
 *
 * Antes isto morava dentro de `seo-autofix.ts`, misturado com a gravação. A
 * separação existe porque agora o mesmo texto tem três destinos, e um deles
 * (a borda) serve o arquivo para o público: se o gerador e o que é publicado
 * pudessem divergir, a tela mostraria uma coisa e o site serviria outra.
 */

export type ArquivoEntrega = {
  /** Caminho absoluto no site do cliente, começando com barra. */
  caminho: string;
  tipo: string;
  corpo: string;
};

export type DadosDoSite = {
  fqdn: string;
  empresa: string;
};

export function robotsTxt({ fqdn }: DadosDoSite): ArquivoEntrega {
  return {
    caminho: "/robots.txt",
    tipo: "text/plain; charset=utf-8",
    corpo: [
      "# Gerado pela Ávila Ops",
      "User-agent: *",
      "Allow: /",
      "",
      `Sitemap: https://${fqdn}/sitemap.xml`,
      "",
    ].join("\n"),
  };
}

export function sitemapXml({ fqdn }: DadosDoSite, hoje = new Date()): ArquivoEntrega {
  return {
    caminho: "/sitemap.xml",
    tipo: "application/xml; charset=utf-8",
    corpo: [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      "  <url>",
      `    <loc>https://${fqdn}/</loc>`,
      `    <lastmod>${hoje.toISOString().slice(0, 10)}</lastmod>`,
      "    <changefreq>weekly</changefreq>",
      "    <priority>1.0</priority>",
      "  </url>",
      "</urlset>",
      "",
    ].join("\n"),
  };
}

export function llmsTxt({ fqdn, empresa }: DadosDoSite): ArquivoEntrega {
  return {
    caminho: "/llms.txt",
    tipo: "text/plain; charset=utf-8",
    corpo: [
      `# ${empresa}`,
      `> ${empresa} no endereço https://${fqdn}`,
      "",
      "## Sobre",
      `- Empresa: ${empresa}`,
      `- Domínio oficial: ${fqdn}`,
      "",
      "## Links",
      `- [Página inicial](https://${fqdn}/)`,
      `- [Sitemap](https://${fqdn}/sitemap.xml)`,
      "",
    ].join("\n"),
  };
}

/** Os três arquivos, na ordem em que a tela os mostra. */
export function arquivosDoSite(dados: DadosDoSite, hoje = new Date()): ArquivoEntrega[] {
  return [robotsTxt(dados), sitemapXml(dados, hoje), llmsTxt(dados)];
}

/** Os caminhos que a entrega sabe servir. Nada fora desta lista é publicado. */
export const CAMINHOS_ENTREGA = ["/robots.txt", "/sitemap.xml", "/llms.txt"] as const;

export type CaminhoEntrega = (typeof CAMINHOS_ENTREGA)[number];

export function ehCaminhoDeEntrega(caminho: string): caminho is CaminhoEntrega {
  return (CAMINHOS_ENTREGA as readonly string[]).includes(caminho);
}

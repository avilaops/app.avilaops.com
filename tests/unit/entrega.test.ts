import { describe, expect, it } from "vitest";
import {
  arquivosDoSite,
  CAMINHOS_ENTREGA,
  ehCaminhoDeEntrega,
  llmsTxt,
  robotsTxt,
  sitemapXml,
} from "@/lib/entrega/conteudo";
import { relatoDaEntrega } from "@/lib/entrega/relato";
import { fonteDoWorker, NOME_WORKER, rotasDoDominio } from "@/lib/entrega/worker-fonte";

const SITE = { fqdn: "padariaaurora.com.br", empresa: "Padaria Aurora" };

describe("conteúdo da entrega", () => {
  it("o robots aponta o sitemap do próprio domínio", () => {
    expect(robotsTxt(SITE).corpo).toContain("Sitemap: https://padariaaurora.com.br/sitemap.xml");
  });

  it("o sitemap sai com a data do dia, em ISO curto", () => {
    const xml = sitemapXml(SITE, new Date("2026-09-19T03:00:00Z")).corpo;
    expect(xml).toContain("<lastmod>2026-09-19</lastmod>");
    expect(xml).toContain("<loc>https://padariaaurora.com.br/</loc>");
  });

  it("o llms.txt nomeia a empresa e o domínio", () => {
    const texto = llmsTxt(SITE).corpo;
    expect(texto).toContain("# Padaria Aurora");
    expect(texto).toContain("padariaaurora.com.br");
  });

  it("os três arquivos saem na ordem da tela e com tipo declarado", () => {
    const arquivos = arquivosDoSite(SITE);
    expect(arquivos.map((a) => a.caminho)).toEqual([...CAMINHOS_ENTREGA]);
    expect(arquivos.every((a) => a.tipo.includes("charset=utf-8"))).toBe(true);
  });

  it("só reconhece os caminhos da lista", () => {
    expect(ehCaminhoDeEntrega("/robots.txt")).toBe(true);
    expect(ehCaminhoDeEntrega("/index.html")).toBe(false);
    expect(ehCaminhoDeEntrega("/")).toBe(false);
  });
});

describe("worker da borda", () => {
  const mapa = { "padariaaurora.com.br": arquivosDoSite(SITE) };

  it("embute o conteúdo como dado, não como código", () => {
    const fonte = fonteDoWorker({
      "x.com": [{ caminho: "/robots.txt", tipo: "text/plain", corpo: '"); fetch("http://mau' }],
    });
    // O corpo aparece escapado dentro do JSON, nunca solto no meio do script.
    expect(fonte).toContain('\\"); fetch(\\"http://mau');
    expect(fonte).not.toContain('"); fetch("http://mau');
  });

  it("normaliza o hostname para minúsculas", () => {
    const fonte = fonteDoWorker({ "Padaria.COM.BR": arquivosDoSite(SITE) });
    expect(fonte).toContain('"padaria.com.br"');
  });

  /**
   * A propriedade que mantém o site do cliente de pé: fora dos caminhos
   * mapeados, e em qualquer erro, a resposta é a do origin.
   */
  it("cai para o origin quando o caminho não é da entrega e quando algo falha", () => {
    const fonte = fonteDoWorker(mapa);
    expect(fonte).toContain("if (!arquivo) return fetch(request);");
    expect(fonte).toContain("} catch (erro) {");
    expect(fonte.match(/return fetch\(request\);/g)).toHaveLength(2);
  });

  it("serve com o cabeçalho que a conferência procura depois", () => {
    expect(fonteDoWorker(mapa)).toContain('"x-avila-entrega": "1"');
  });

  /**
   * Rota por caminho exato, nunca curinga: é o que garante que a borda não
   * consegue atrapalhar o resto do site nem que queira.
   */
  it("as rotas são caminhos exatos, sem curinga", () => {
    const rotas = rotasDoDominio("Padaria.com.br", arquivosDoSite(SITE));
    expect(rotas).toEqual([
      "padaria.com.br/robots.txt",
      "padaria.com.br/sitemap.xml",
      "padaria.com.br/llms.txt",
    ]);
    expect(rotas.some((r) => r.includes("*"))).toBe(false);
  });

  it("um script só para todos os domínios", () => {
    expect(NOME_WORKER).toBe("avila-entrega");
    const fonte = fonteDoWorker({
      "a.com": arquivosDoSite({ fqdn: "a.com", empresa: "A" }),
      "b.com": arquivosDoSite({ fqdn: "b.com", empresa: "B" }),
    });
    expect(fonte).toContain('"a.com"');
    expect(fonte).toContain('"b.com"');
  });

  it("o script gerado é JavaScript válido", () => {
    // Não executa: só confere que o parser aceita o que vai para a borda.
    expect(() => new Function(fonteDoWorker(mapa).replace("export default", "const _ ="))).not.toThrow();
  });
});

describe("relato da entrega", () => {
  const base = {
    fqdn: "padariaaurora.com.br",
    empresa: "Padaria Aurora",
    zoneId: "zona-1",
    foraDeAlcance: null,
    jaServidos: [],
    publicados: [],
    confirmados: [],
  };

  it("domínio fora da conta não vira sucesso", () => {
    const relato = relatoDaEntrega({ ...base, zoneId: null, foraDeAlcance: "sem-zona" });
    expect(relato.ok).toBe(false);
    expect(relato.texto).toContain("não está na conta Cloudflare");
  });

  it("domínio sem proxy diz o que fazer", () => {
    const relato = relatoDaEntrega({ ...base, foraDeAlcance: "sem-proxy" });
    expect(relato.ok).toBe(false);
    expect(relato.texto).toContain("Ligue o proxy");
  });

  /**
   * O caso que motivou este trabalho: publicar sem conferir contava como
   * aplicado, e a auditoria seguinte reprovava os mesmos itens.
   */
  it("publicado sem confirmação pela borda não é sucesso", () => {
    const relato = relatoDaEntrega({
      ...base,
      publicados: ["/robots.txt", "/sitemap.xml"],
      confirmados: ["/robots.txt"],
    });
    expect(relato.ok).toBe(false);
    expect(relato.texto).toContain("ainda sem resposta pela borda: /sitemap.xml");
    expect(relato.texto).toContain("no ar: /robots.txt");
  });

  it("tudo confirmado é sucesso", () => {
    const relato = relatoDaEntrega({
      ...base,
      publicados: [...CAMINHOS_ENTREGA],
      confirmados: [...CAMINHOS_ENTREGA],
    });
    expect(relato.ok).toBe(true);
    expect(relato.texto).toContain("no ar: /robots.txt, /sitemap.xml, /llms.txt");
  });

  it("site que já servia tudo é sucesso sem publicar nada", () => {
    const relato = relatoDaEntrega({ ...base, jaServidos: [...CAMINHOS_ENTREGA] });
    expect(relato.ok).toBe(true);
    expect(relato.texto).toContain("nada precisou ser publicado");
  });

  it("nada publicado e nada servido não é sucesso", () => {
    expect(relatoDaEntrega(base).ok).toBe(false);
  });

  it("erro do domínio aparece na frase", () => {
    const relato = relatoDaEntrega({ ...base, erro: "token sem permissão de Workers" });
    expect(relato.ok).toBe(false);
    expect(relato.texto).toContain("token sem permissão de Workers");
  });
});

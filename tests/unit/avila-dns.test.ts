import { afterEach, describe, expect, it, vi } from "vitest";
import {
  achatar,
  comPontoFinal,
  idDoRegistro,
  lerIdDoRegistro,
  montarConteudo,
  mudancaParaCriar,
  mudancasParaAlterar,
  mudancasParaRemover,
  semPontoFinal,
  separarPrioridade,
  type RRset,
} from "@/lib/dominios/dns/rrset";
import { ProvedorAvilaDns } from "@/lib/dominios/dns/avila";
import { lerServicoDeDns, provedorDeDnsDoDominio, rotuloDoServico } from "@/lib/dominios/dns";

/**
 * O risco deste módulo mora numa frase: um servidor autoritativo guarda
 * conjuntos (nome + tipo), a tela mostra linhas. Traduzir errado apaga mais do
 * que se pediu, e o sintoma é e-mail parando de chegar. É o que estes testes
 * seguram.
 */

const ZONA: RRset[] = [
  {
    name: "cliente.com.br.",
    type: "MX",
    ttl: 3600,
    records: [
      { content: "10 mx1.provedor.com." },
      { content: "20 mx2.provedor.com." },
      { content: "30 mx3.provedor.com." },
    ],
  },
  { name: "cliente.com.br.", type: "A", ttl: 300, records: [{ content: "203.0.113.10" }] },
  {
    name: "cliente.com.br.",
    type: "TXT",
    ttl: 3600,
    records: [{ content: '"v=spf1 include:provedor.com ~all"' }, { content: '"verificacao=abc"', disabled: true }],
  },
];

describe("nome com ponto final", () => {
  it("põe o ponto que o protocolo exige e as pessoas esquecem", () => {
    expect(comPontoFinal("Cliente.com.BR")).toBe("cliente.com.br.");
    expect(comPontoFinal("cliente.com.br.")).toBe("cliente.com.br.");
    expect(semPontoFinal("cliente.com.br.")).toBe("cliente.com.br");
  });
});

describe("id de uma linha", () => {
  it("vai e volta sem perder o conteúdo", () => {
    const id = idDoRegistro("cliente.com.br", "MX", "10 mx1.provedor.com.");
    expect(lerIdDoRegistro(id)).toEqual({
      nome: "cliente.com.br.",
      tipo: "MX",
      conteudo: "10 mx1.provedor.com.",
    });
  });

  it("linhas diferentes do mesmo conjunto têm ids diferentes", () => {
    const a = idDoRegistro("cliente.com.br", "MX", "10 mx1.provedor.com.");
    const b = idDoRegistro("cliente.com.br", "MX", "20 mx2.provedor.com.");
    expect(a).not.toBe(b);
  });

  it("id quebrado não vira registro", () => {
    expect(lerIdDoRegistro("nao-e-base64-valido!!!")).toBeNull();
  });
});

describe("prioridade de MX e SRV", () => {
  it("entra no conteúdo, porque o protocolo guarda um texto só", () => {
    expect(montarConteudo({ tipo: "MX", nome: "x", conteudo: "mx1.provedor.com.", prioridade: 10 })).toBe(
      "10 mx1.provedor.com.",
    );
  });

  it("não duplica quando o conteúdo já vem com ela", () => {
    expect(montarConteudo({ tipo: "MX", nome: "x", conteudo: "10 mx1.provedor.com.", prioridade: 20 })).toBe(
      "10 mx1.provedor.com.",
    );
  });

  it("tipo sem prioridade não ganha número na frente", () => {
    expect(montarConteudo({ tipo: "A", nome: "x", conteudo: "203.0.113.10", prioridade: 10 })).toBe("203.0.113.10");
  });

  it("na leitura, volta a ser campo separado", () => {
    expect(separarPrioridade("MX", "10 mx1.provedor.com.")).toEqual({
      conteudo: "mx1.provedor.com.",
      prioridade: 10,
    });
    expect(separarPrioridade("A", "203.0.113.10")).toEqual({ conteudo: "203.0.113.10", prioridade: null });
  });
});

describe("achatar a zona em linhas", () => {
  it("um conjunto de três conteúdos vira três linhas", () => {
    const linhas = achatar(ZONA).filter((l) => l.tipo === "MX");

    expect(linhas).toHaveLength(3);
    expect(linhas[0].prioridade).toBe(10);
    // Forma lógica, como a do serviço externo: sem o ponto final.
    expect(linhas[0].conteudo).toBe("mx1.provedor.com");
    expect(linhas[0].nome).toBe("cliente.com.br");
  });

  it("registro desativado não aparece", () => {
    const txt = achatar(ZONA).filter((l) => l.tipo === "TXT");
    expect(txt).toHaveLength(1);
  });
});

describe("criar uma linha", () => {
  it("preserva as linhas que já existiam no conjunto", () => {
    const mudanca = mudancaParaCriar(ZONA, {
      tipo: "MX",
      nome: "cliente.com.br",
      conteudo: "mx4.provedor.com.",
      prioridade: 40,
    });

    expect(mudanca.changetype).toBe("REPLACE");
    const conteudos = mudanca.changetype === "REPLACE" ? mudanca.records.map((r) => r.content) : [];
    expect(conteudos).toHaveLength(4);
    expect(conteudos).toContain("10 mx1.provedor.com.");
    expect(conteudos).toContain("40 mx4.provedor.com.");
  });

  it("conjunto novo nasce só com a linha pedida", () => {
    const mudanca = mudancaParaCriar(ZONA, { tipo: "CNAME", nome: "www.cliente.com.br", conteudo: "cliente.com.br." });

    expect(mudanca.changetype).toBe("REPLACE");
    expect(mudanca.changetype === "REPLACE" && mudanca.records).toHaveLength(1);
    expect(mudanca.name).toBe("www.cliente.com.br.");
  });

  it("não duplica conteúdo igual ao que já está lá", () => {
    const mudanca = mudancaParaCriar(ZONA, { tipo: "A", nome: "cliente.com.br", conteudo: "203.0.113.10" });
    expect(mudanca.changetype === "REPLACE" && mudanca.records).toHaveLength(1);
  });

  it("herda o TTL do conjunto quando não é informado", () => {
    const mudanca = mudancaParaCriar(ZONA, { tipo: "A", nome: "cliente.com.br", conteudo: "203.0.113.11" });
    expect(mudanca.changetype === "REPLACE" && mudanca.ttl).toBe(300);
  });
});

describe("remover uma linha", () => {
  it("tirar um MX de três reescreve o conjunto com dois, não apaga os três", () => {
    const mudancas = mudancasParaRemover(ZONA, {
      nome: "cliente.com.br",
      tipo: "MX",
      conteudo: "20 mx2.provedor.com.",
    });

    expect(mudancas).toHaveLength(1);
    expect(mudancas[0].changetype).toBe("REPLACE");
    const conteudos = mudancas[0].changetype === "REPLACE" ? mudancas[0].records.map((r) => r.content) : [];
    expect(conteudos).toEqual(["10 mx1.provedor.com.", "30 mx3.provedor.com."]);
  });

  it("tirar a última linha apaga o conjunto", () => {
    const mudancas = mudancasParaRemover(ZONA, {
      nome: "cliente.com.br",
      tipo: "A",
      conteudo: "203.0.113.10",
    });

    expect(mudancas).toEqual([{ changetype: "DELETE", name: "cliente.com.br.", type: "A" }]);
  });

  it("conjunto que não existe não gera mudança nenhuma", () => {
    expect(mudancasParaRemover(ZONA, { nome: "nada.cliente.com.br", tipo: "A", conteudo: "1.2.3.4" })).toEqual([]);
  });
});

describe("alterar uma linha", () => {
  it("no mesmo conjunto, troca só aquela linha", () => {
    const mudancas = mudancasParaAlterar(
      ZONA,
      { nome: "cliente.com.br", tipo: "MX", conteudo: "20 mx2.provedor.com." },
      { tipo: "MX", nome: "cliente.com.br", conteudo: "mx9.provedor.com.", prioridade: 20 },
    );

    expect(mudancas).toHaveLength(1);
    const conteudos = mudancas[0].changetype === "REPLACE" ? mudancas[0].records.map((r) => r.content) : [];
    expect(conteudos).toEqual(["10 mx1.provedor.com.", "20 mx9.provedor.com.", "30 mx3.provedor.com."]);
  });

  it("mudar o nome move a linha: sai de um conjunto e entra em outro", () => {
    const mudancas = mudancasParaAlterar(
      ZONA,
      { nome: "cliente.com.br", tipo: "A", conteudo: "203.0.113.10" },
      { tipo: "A", nome: "app.cliente.com.br", conteudo: "203.0.113.10" },
    );

    expect(mudancas).toHaveLength(2);
    expect(mudancas[0]).toEqual({ changetype: "DELETE", name: "cliente.com.br.", type: "A" });
    expect(mudancas[1].name).toBe("app.cliente.com.br.");
  });

  it("mudar o TTL vale para o conjunto inteiro, que é como o protocolo guarda", () => {
    const mudancas = mudancasParaAlterar(
      ZONA,
      { nome: "cliente.com.br", tipo: "MX", conteudo: "10 mx1.provedor.com." },
      { tipo: "MX", nome: "cliente.com.br", conteudo: "mx1.provedor.com.", prioridade: 10, ttl: 60 },
    );

    expect(mudancas[0].changetype === "REPLACE" && mudancas[0].ttl).toBe(60);
  });
});

describe("adaptador do DNS da casa", () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
    vi.restoreAllMocks();
  });

  it("sem endereço e chave, declara-se não configurado", async () => {
    delete process.env.AVILA_DNS_API_URL;
    delete process.env.AVILA_DNS_API_KEY;

    const provedor = new ProvedorAvilaDns();
    expect(provedor.configurado()).toBe(false);
    expect(provedor.podeEditar()).toBe(false);

    const diagnostico = await provedor.verificar();
    expect(diagnostico.configurado).toBe(false);
    expect(diagnostico.operacional).toBe(false);
  });

  it("não configurado recusa a leitura em vez de devolver zona vazia", async () => {
    delete process.env.AVILA_DNS_API_URL;
    await expect(new ProvedorAvilaDns().listar("cliente.com.br")).rejects.toThrow(/não está configurado/);
  });

  it("manda a chave no cabeçalho e o nome da zona com ponto final", async () => {
    process.env.AVILA_DNS_API_URL = "https://dns.exemplo/";
    process.env.AVILA_DNS_API_KEY = "segredo";

    const espiao = vi.fn(async () => new Response(JSON.stringify({ rrsets: ZONA }), { status: 200 }));
    globalThis.fetch = espiao as unknown as typeof fetch;

    const linhas = await new ProvedorAvilaDns().listar("cliente.com.br");

    const [url, init] = espiao.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(url)).toBe("https://dns.exemplo/api/v1/servers/localhost/zones/cliente.com.br.");
    expect((init.headers as Record<string, string>)["X-API-Key"]).toBe("segredo");
    expect(linhas.filter((l) => l.tipo === "MX")).toHaveLength(3);
  });

  it("apagar um MX de três envia REPLACE com os dois que ficam", async () => {
    process.env.AVILA_DNS_API_URL = "https://dns.exemplo";
    process.env.AVILA_DNS_API_KEY = "segredo";

    const enviados: unknown[] = [];
    globalThis.fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        enviados.push(JSON.parse(String(init.body)));
        return new Response(null, { status: 204 });
      }
      return new Response(JSON.stringify({ rrsets: ZONA }), { status: 200 });
    }) as unknown as typeof fetch;

    const id = idDoRegistro("cliente.com.br", "MX", "20 mx2.provedor.com.");
    await new ProvedorAvilaDns().remover("cliente.com.br", id);

    expect(enviados).toHaveLength(1);
    const corpo = enviados[0] as { rrsets: { changetype: string; records?: { content: string }[] }[] };
    expect(corpo.rrsets[0].changetype).toBe("REPLACE");
    expect(corpo.rrsets[0].records?.map((r) => r.content)).toEqual([
      "10 mx1.provedor.com.",
      "30 mx3.provedor.com.",
    ]);
  });

  it("erro do serviço não vaza o corpo da resposta", async () => {
    process.env.AVILA_DNS_API_URL = "https://dns.exemplo";
    process.env.AVILA_DNS_API_KEY = "segredo";
    globalThis.fetch = vi.fn(
      async () => new Response("interno: 10.0.0.5 recusou a chave abc123", { status: 500 }),
    ) as unknown as typeof fetch;

    await expect(new ProvedorAvilaDns().listar("cliente.com.br")).rejects.toThrow(/respondeu 500/);
    await expect(new ProvedorAvilaDns().listar("cliente.com.br")).rejects.not.toThrow(/abc123/);
  });
});

describe("qual serviço responde por cada domínio", () => {
  it("o valor guardado escolhe o adaptador, um domínio por vez", () => {
    expect(provedorDeDnsDoDominio({ dnsProvider: "AVILA" })?.adaptador).toBe("avila-dns");
    expect(provedorDeDnsDoDominio({ dnsProvider: "EXTERNO" })?.adaptador).toBe("cloudflare");
    expect(provedorDeDnsDoDominio({ dnsProvider: "NENHUM" })).toBeNull();
  });

  it("valor desconhecido ou ausente não vira serviço por engano", () => {
    expect(lerServicoDeDns(null)).toBe("NENHUM");
    expect(lerServicoDeDns("qualquer-coisa")).toBe("NENHUM");
    expect(provedorDeDnsDoDominio({ dnsProvider: undefined })).toBeNull();
  });

  it("o rótulo da tela não cita fornecedor", () => {
    expect(rotuloDoServico("AVILA")).toBe("DNS da Ávila Ops");
    expect(rotuloDoServico("EXTERNO")).toBe("serviço externo");
    expect(rotuloDoServico("NENHUM")).toBe("sem DNS gerenciado");
  });
});

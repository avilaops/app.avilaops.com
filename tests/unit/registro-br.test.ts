import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  consolidar,
  consultarDominioBr,
  diasAte,
  limparCacheRegistroBr,
  respostaEhDoMesmoNome,
  type LeituraRdapBr,
  type RespostaAvail,
} from "@/lib/registro-br";
import { diasAteVencer, estaVencendo, filtrarDominios, type DomainRow } from "@/components/dominios/tipos";

const CONSULTADO_EM = "2026-09-18T12:00:00.000Z";

/** Recorte fiel de `https://rdap.registro.br/domain/uol.com.br`, medido em 18/09/2026. */
const RDAP_UOL: LeituraRdapBr = {
  tipo: "REGISTRADO",
  dados: {
    ldhName: "uol.com.br",
    status: ["active"],
    events: [
      { eventAction: "registration", eventDate: "1996-04-24T12:00:00Z" },
      { eventAction: "last changed", eventDate: "2024-08-27T08:21:19Z" },
      { eventAction: "expiration", eventDate: "2034-04-24T12:00:00Z" },
    ],
    nameservers: [{ ldhName: "eliot.uol.com.br" }, { ldhName: "borges.uol.com.br" }],
    entities: [
      {
        roles: ["registrant"],
        publicIds: [{ type: "cnpj", identifier: "01.109.184/0004-38" }],
        vcardArray: [
          "vcard",
          [
            ["version", {}, "text", "4.0"],
            ["kind", {}, "text", "org"],
            ["fn", {}, "text", "Universo Online S.A."],
          ],
        ],
      },
      { roles: ["technical"] },
    ],
  },
};

describe("consolidar", () => {
  it("lê expiração, titular e CNPJ do RDAP", () => {
    const consulta = consolidar("uol.com.br", RDAP_UOL, null, CONSULTADO_EM);

    expect(consulta.status).toBe("REGISTRADO");
    expect(consulta.expiraEm).toBe("2034-04-24T12:00:00.000Z");
    expect(consulta.registradoEm).toBe("1996-04-24T12:00:00.000Z");
    expect(consulta.alteradoEm).toBe("2024-08-27T08:21:19.000Z");
    expect(consulta.titular).toBe("Universo Online S.A.");
    expect(consulta.documentoTitular).toBe("01.109.184/0004-38");
    expect(consulta.nameservers).toEqual(["eliot.uol.com.br", "borges.uol.com.br"]);
    expect(consulta.fontes).toEqual(["RDAP"]);
  });

  it("não inventa expiração para domínio isento, como nic.br", () => {
    const rdap: LeituraRdapBr = {
      tipo: "REGISTRADO",
      dados: {
        status: ["active"],
        events: [{ eventAction: "registration", eventDate: "1997-07-11T12:00:00Z" }],
      },
    };
    const avail: RespostaAvail = { status: 2, exempt: true, "publication-status": "published" };

    const consulta = consolidar("nic.br", rdap, avail, CONSULTADO_EM);

    expect(consulta.status).toBe("REGISTRADO");
    expect(consulta.expiraEm).toBeNull();
    expect(consulta.mensagem).toContain("sem data de expiração publicada");
  });

  it("usa o expires-at da busca só quando o RDAP não traz o evento", () => {
    const rdap: LeituraRdapBr = { tipo: "REGISTRADO", dados: { events: [] } };
    const avail: RespostaAvail = { status: 2, "expires-at": "2028-04-12T00:00:00-03:00" };

    expect(consolidar("uol.net.br", rdap, avail, CONSULTADO_EM).expiraEm).toBe("2028-04-12T03:00:00.000Z");
  });

  it("o RDAP manda: expiração da busca não sobrescreve a do registro", () => {
    const avail: RespostaAvail = { status: 2, "expires-at": "2030-01-01T00:00:00-03:00" };

    expect(consolidar("uol.com.br", RDAP_UOL, avail, CONSULTADO_EM).expiraEm).toBe("2034-04-24T12:00:00.000Z");
  });

  it("404 no RDAP é domínio livre", () => {
    const consulta = consolidar("avilaops.com.br", { tipo: "LIVRE" }, { status: 0 }, CONSULTADO_EM);

    expect(consulta.status).toBe("LIVRE");
    expect(consulta.expiraEm).toBeNull();
  });

  it("nome sem registro mas reservado pelo CG não é oferecido como livre", () => {
    const avail: RespostaAvail = { status: 3, reasons: ["Palavra reservada pelo CG"] };

    const consulta = consolidar("banco.com.br", { tipo: "LIVRE" }, avail, CONSULTADO_EM);

    expect(consulta.status).toBe("BLOQUEADO");
    expect(consulta.mensagem).toContain("Palavra reservada pelo CG");
  });

  it("nome inválido não vira 'livre'", () => {
    const consulta = consolidar("xn--invalido-99.com.br", { tipo: "LIVRE" }, { status: 4 }, CONSULTADO_EM);

    expect(consulta.status).toBe("INVALIDO");
  });

  it("com o RDAP fora do ar, a busca sustenta sozinha e a resposta diz isso", () => {
    const avail: RespostaAvail = { status: 2, hosts: ["ns1.exemplo.com.br"], "expires-at": "2027-03-01T00:00:00-03:00" };

    const consulta = consolidar("exemplo.com.br", { tipo: "INDEFINIDO", http: 503 }, avail, CONSULTADO_EM);

    expect(consulta.status).toBe("REGISTRADO");
    expect(consulta.fontes).toEqual(["AVAIL"]);
    expect(consulta.mensagem).toContain("não é uma interface documentada");
  });

  it("resposta sobre outro nome não vira data deste domínio", () => {
    // Medido em 18/09/2026: `optica-visao.com.br` devolve 303 para
    // `opticavisao.com.br`, de outro dono, e o fetch segue sozinho. Gravar
    // aquela data diria ao cliente que o domínio dele venceu.
    const avail: RespostaAvail = { status: 3 };

    const consulta = consolidar(
      "optica-visao.com.br",
      { tipo: "OUTRO_NOME", ldhName: "opticavisao.com.br" },
      avail,
      CONSULTADO_EM,
    );

    expect(consulta.status).toBe("BLOQUEADO");
    expect(consulta.expiraEm).toBeNull();
    expect(consulta.titular).toBeNull();
    expect(consulta.fontes).toEqual(["AVAIL"]);
    expect(consulta.mensagem).toContain("opticavisao.com.br");
  });

  it("outro nome com busca dizendo 'tomado' fica desconhecido, não registrado", () => {
    const consulta = consolidar(
      "a-b.com.br",
      { tipo: "OUTRO_NOME", ldhName: "ab.com.br" },
      { status: 2, "expires-at": "2030-01-01T00:00:00-03:00" },
      CONSULTADO_EM,
    );

    expect(consulta.status).toBe("DESCONHECIDO");
    expect(consulta.expiraEm).toBeNull();
  });

  it("nome inválido dá RDAP 400, e a mensagem culpa o nome, não a fonte", () => {
    // Medido em 18/09/2026: `xn--a-99.com.br` devolve RDAP 400 e avail 4.
    const avail: RespostaAvail = { status: 4, reasons: ["Domínio inválido"] };

    const consulta = consolidar("xn--a-99.com.br", { tipo: "INDEFINIDO", http: 400 }, avail, CONSULTADO_EM);

    expect(consulta.status).toBe("INVALIDO");
    expect(consulta.mensagem).toContain("não aceita este nome");
    expect(consulta.mensagem).not.toContain("RDAP indisponível");
  });

  it("sem nenhuma fonte, o resultado é desconhecido, nunca 'livre'", () => {
    const consulta = consolidar("exemplo.com.br", { tipo: "INDEFINIDO", http: 0 }, null, CONSULTADO_EM);

    expect(consulta.status).toBe("DESCONHECIDO");
    expect(consulta.fontes).toEqual([]);
  });
});

describe("consultarDominioBr", () => {
  const fetchOriginal = globalThis.fetch;

  beforeEach(() => {
    limparCacheRegistroBr();
  });

  afterEach(() => {
    globalThis.fetch = fetchOriginal;
    vi.restoreAllMocks();
  });

  function responder(rdap: { status: number; corpo?: unknown }, avail: unknown) {
    return vi.fn(async (entrada: string | URL | Request) => {
      const url = String(entrada);
      if (url.startsWith("https://rdap.registro.br/")) {
        return new Response(rdap.corpo === undefined ? "" : JSON.stringify(rdap.corpo), {
          status: rdap.status,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify(avail), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
  }

  it("recusa domínio que não é .br", async () => {
    await expect(consultarDominioBr("exemplo.com")).rejects.toThrow(/só consulta domínios \.br/);
  });

  it("recusa entrada que não é domínio", async () => {
    await expect(consultarDominioBr("nao é domínio")).rejects.toThrow(/domínio válido/);
  });

  it("aceita URL colada inteira e consulta só o host", async () => {
    const espiao = responder({ status: 404 }, { status: 0 });
    globalThis.fetch = espiao as unknown as typeof fetch;

    const consulta = await consultarDominioBr("https://www.Empresa.COM.BR/contato?x=1");

    expect(consulta.fqdn).toBe("empresa.com.br");
    expect(consulta.status).toBe("LIVRE");
    expect(String(espiao.mock.calls[0]?.[0])).toBe("https://rdap.registro.br/domain/empresa.com.br");
  });

  it("guarda domínio registrado no cache e não vai à rede de novo", async () => {
    const espiao = responder({ status: 200, corpo: RDAP_UOL.tipo === "REGISTRADO" ? RDAP_UOL.dados : {} }, { status: 2 });
    globalThis.fetch = espiao as unknown as typeof fetch;

    const primeira = await consultarDominioBr("uol.com.br");
    const segunda = await consultarDominioBr("uol.com.br");

    expect(primeira.deCache).toBe(false);
    expect(segunda.deCache).toBe(true);
    expect(segunda.expiraEm).toBe(primeira.expiraEm);
    // duas chamadas (RDAP + busca) na primeira consulta, nenhuma na segunda
    expect(espiao).toHaveBeenCalledTimes(2);
  });

  it("forcar ignora o cache. É o que o botão de atualizar precisa fazer", async () => {
    const espiao = responder({ status: 200, corpo: RDAP_UOL.tipo === "REGISTRADO" ? RDAP_UOL.dados : {} }, { status: 2 });
    globalThis.fetch = espiao as unknown as typeof fetch;

    await consultarDominioBr("uol.com.br");
    const segunda = await consultarDominioBr("uol.com.br", { forcar: true });

    expect(segunda.deCache).toBe(false);
    expect(espiao).toHaveBeenCalledTimes(4);
  });

  it("resultado desconhecido não entra no cache", async () => {
    const espiao = vi.fn(async () => new Response("", { status: 500 }));
    globalThis.fetch = espiao as unknown as typeof fetch;

    await consultarDominioBr("exemplo.com.br");
    await consultarDominioBr("exemplo.com.br");

    expect(espiao).toHaveBeenCalledTimes(4);
  });

  it("rede caindo vira DESCONHECIDO, nunca 'livre'", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error("ECONNRESET");
    }) as unknown as typeof fetch;

    const consulta = await consultarDominioBr("exemplo.com.br");

    expect(consulta.status).toBe("DESCONHECIDO");
  });
});

describe("diasAte", () => {
  const agora = new Date("2026-09-18T12:00:00.000Z");

  it("conta dias inteiros até o vencimento", () => {
    expect(diasAte("2026-10-18T12:00:00.000Z", agora)).toBe(30);
  });

  it("devolve negativo para data já passada", () => {
    expect(diasAte("2026-09-10T12:00:00.000Z", agora)).toBe(-8);
  });

  it("sem data não é zero dia, é nulo", () => {
    expect(diasAte(null, agora)).toBeNull();
    expect(diasAte("não é data", agora)).toBeNull();
  });
});

describe("filtro de vencimento na tela", () => {
  const agora = new Date("2026-09-18T12:00:00.000Z");

  function linha(fqdn: string, expiresAt: string | null): DomainRow {
    return {
      id: fqdn,
      fqdn,
      cloudflarePlan: null,
      cloudflareStatus: "active",
      dnsLastSyncedAt: null,
      dnsRecordCount: 0,
      organizationName: "Cliente",
      organizationId: null,
      cloudflareZoneId: null,
      registrar: null,
      expiresAt,
      autoRenew: null,
      nextActionAt: null,
      registroBrLidoEm: null,
      registroBrTitular: null,
      registroBrStatus: null,
    };
  }

  it("60 dias é o corte, e o que já venceu continua aparecendo", () => {
    expect(estaVencendo(linha("a.com.br", "2026-10-18T12:00:00.000Z"), agora)).toBe(true);
    expect(estaVencendo(linha("b.com.br", "2026-11-30T12:00:00.000Z"), agora)).toBe(false);
    expect(estaVencendo(linha("c.com.br", "2026-08-01T12:00:00.000Z"), agora)).toBe(true);
  });

  it("domínio sem data não entra no filtro de vencendo", () => {
    expect(estaVencendo(linha("d.com.br", null), agora)).toBe(false);
    expect(diasAteVencer(null, agora)).toBeNull();
  });

  it("o filtro devolve só o que está na janela", () => {
    const dominios = [
      linha("perto.com.br", "2026-10-01T12:00:00.000Z"),
      linha("longe.com.br", "2027-10-01T12:00:00.000Z"),
      linha("semdata.com.br", null),
    ];

    expect(filtrarDominios(dominios, "", "vencendo", agora).map((d) => d.fqdn)).toEqual(["perto.com.br"]);
    expect(filtrarDominios(dominios, "", "todas", agora)).toHaveLength(3);
  });
});

describe("respostaEhDoMesmoNome", () => {
  it("aceita o mesmo nome, com caixa e ponto final diferentes", () => {
    expect(respostaEhDoMesmoNome("uol.com.br", { ldhName: "UOL.com.br." })).toBe(true);
    expect(respostaEhDoMesmoNome("uol.com.br", { handle: "uol.com.br" })).toBe(true);
  });

  it("recusa a resposta que o registro deu sobre outro nome", () => {
    expect(respostaEhDoMesmoNome("optica-visao.com.br", { ldhName: "opticavisao.com.br" })).toBe(false);
  });

  it("resposta sem nome nenhum passa: não há com o que discordar", () => {
    expect(respostaEhDoMesmoNome("uol.com.br", {})).toBe(true);
  });
});

describe("linha sem registro no .br", () => {
  it("o status por linha distingue 'livre' de 'nunca consultado'", () => {
    const base = {
      id: "x",
      fqdn: "marcenaria-luz.com.br",
      cloudflarePlan: null,
      cloudflareStatus: "active",
      dnsLastSyncedAt: null,
      dnsRecordCount: 0,
      organizationName: "Marcenaria Luz",
      organizationId: null,
      cloudflareZoneId: null,
      registrar: null,
      expiresAt: "2026-09-15T12:00:00.000Z",
      autoRenew: null,
      nextActionAt: null,
      registroBrLidoEm: "2026-09-18T12:00:00.000Z",
      registroBrTitular: null,
      registroBrStatus: "LIVRE",
    } satisfies DomainRow;

    expect(base.registroBrStatus).toBe("LIVRE");
    // A data antiga continua na linha: apagá-la esconderia o problema.
    expect(base.expiresAt).not.toBeNull();
  });
});

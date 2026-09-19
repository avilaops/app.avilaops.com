import { describe, expect, it } from "vitest";
import {
  avaliarConsulta,
  avaliarDns,
  avaliarRegistro,
  avaliarRenovacao,
  piorEstado,
  tomEstado,
  type EntradaProvedor,
} from "@/lib/dominios/capacidades";
import { situacaoDe, type DominioDaCarteira } from "@/lib/dominios/central";
import { contarPorFiltro, filtrar, resumoDaLinha, tomDaSituacao } from "@/components/dominios/dados";

const AGORA = new Date("2026-09-19T12:00:00.000Z");

const DESLIGADO: EntradaProvedor = {
  adaptador: "epp",
  configurado: false,
  operacional: false,
  ambiente: null,
  verificadoEm: AGORA.toISOString(),
  erro: null,
};

const LIGADO: EntradaProvedor = { ...DESLIGADO, adaptador: "dns", configurado: true, operacional: true };

describe("luz do registro", () => {
  it("sem credencial fica cinza, não verde por omissão", () => {
    const capacidade = avaliarRegistro(DESLIGADO);

    expect(capacidade.estado).toBe("NAO_CONFIGURADA");
    expect(capacidade.resumo).toContain("não habilitado");
  });

  it("configurado mas sem resposta fica vermelho, não cinza", () => {
    const capacidade = avaliarRegistro({ ...DESLIGADO, configurado: true, erro: "sem sessão" });

    expect(capacidade.estado).toBe("INDISPONIVEL");
    expect(capacidade.erro).toBe("sem sessão");
  });

  it("conectado sem permissão de registrar fica amarelo", () => {
    const capacidade = avaliarRegistro({ ...LIGADO }, { registrar: false, renovar: true });

    expect(capacidade.estado).toBe("ATENCAO");
  });

  it("operacional com permissão fica verde e lista o que dá para fazer", () => {
    const capacidade = avaliarRegistro(LIGADO, { registrar: true, renovar: true, transferir: false });

    expect(capacidade.estado).toBe("OPERACIONAL");
    expect(capacidade.detalhes.find((d) => d.rotulo === "Operações liberadas")?.valor).toBe("registrar, renovar");
  });

  it("o nome do conector fica no avançado, nunca no resumo", () => {
    const capacidade = avaliarRegistro(LIGADO, { registrar: true });

    expect(capacidade.resumo).not.toContain("epp");
    expect(capacidade.avancado.some((item) => item.valor === "dns")).toBe(true);
  });
});

describe("luz do DNS", () => {
  it("conectado sem domínio sincronizado fica amarelo", () => {
    const capacidade = avaliarDns({
      provedor: LIGADO,
      dominiosComDns: 0,
      totalRegistros: 0,
      sincronizadoEm: null,
      podeEditar: true,
    });

    expect(capacidade.estado).toBe("ATENCAO");
  });

  it("com zona e registros fica verde e conta o que tem", () => {
    const capacidade = avaliarDns({
      provedor: LIGADO,
      dominiosComDns: 3,
      totalRegistros: 21,
      sincronizadoEm: AGORA.toISOString(),
      podeEditar: true,
    });

    expect(capacidade.estado).toBe("OPERACIONAL");
    expect(capacidade.resumo).toBe("21 registros em 3 domínios");
  });

  it("sem credencial fica cinza", () => {
    const capacidade = avaliarDns({
      provedor: DESLIGADO,
      dominiosComDns: 0,
      totalRegistros: 0,
      sincronizadoEm: null,
      podeEditar: false,
    });

    expect(capacidade.estado).toBe("NAO_CONFIGURADA");
  });
});

describe("luz da renovação", () => {
  const base = { comData: 5, total: 5, vencendo: 0, vencidos: 0, verificadoEm: null, podeRenovar: false };

  it("zero vencendo sem nenhuma data conhecida é cegueira, não tranquilidade", () => {
    const capacidade = avaliarRenovacao({ ...base, comData: 0 });

    expect(capacidade.estado).toBe("NAO_CONFIGURADA");
    expect(capacidade.resumo).toContain("Nenhum vencimento consultado");
  });

  it("domínio já vencido é vermelho", () => {
    expect(avaliarRenovacao({ ...base, vencidos: 1 }).estado).toBe("INDISPONIVEL");
  });

  it("domínio na janela é amarelo", () => {
    expect(avaliarRenovacao({ ...base, vencendo: 2 }).estado).toBe("ATENCAO");
  });

  it("parte da carteira sem data também pede atenção", () => {
    expect(avaliarRenovacao({ ...base, total: 8, comData: 5 }).estado).toBe("ATENCAO");
  });

  it("tudo com data e longe do prazo fica verde", () => {
    expect(avaliarRenovacao(base).estado).toBe("OPERACIONAL");
  });
});

describe("luz da consulta", () => {
  it("é verde por padrão, porque é leitura pública", () => {
    expect(avaliarConsulta({ operacional: true, verificadoEm: null, erro: null, fonte: "rdap" }).estado).toBe(
      "OPERACIONAL",
    );
  });

  it("fonte fora do ar é vermelho", () => {
    expect(avaliarConsulta({ operacional: false, verificadoEm: null, erro: "timeout", fonte: null }).estado).toBe(
      "INDISPONIVEL",
    );
  });
});

describe("piorEstado", () => {
  it("vermelho vence amarelo, que vence cinza, que vence verde", () => {
    const luz = (estado: "OPERACIONAL" | "ATENCAO" | "INDISPONIVEL" | "NAO_CONFIGURADA") =>
      ({ estado }) as never;

    expect(piorEstado([luz("OPERACIONAL"), luz("ATENCAO"), luz("INDISPONIVEL")])).toBe("INDISPONIVEL");
    expect(piorEstado([luz("OPERACIONAL"), luz("NAO_CONFIGURADA"), luz("ATENCAO")])).toBe("ATENCAO");
    expect(piorEstado([luz("OPERACIONAL"), luz("NAO_CONFIGURADA")])).toBe("NAO_CONFIGURADA");
    expect(piorEstado([luz("OPERACIONAL")])).toBe("OPERACIONAL");
  });

  it("cada estado tem um tom", () => {
    expect(tomEstado("OPERACIONAL")).toBe("bom");
    expect(tomEstado("ATENCAO")).toBe("atencao");
    expect(tomEstado("INDISPONIVEL")).toBe("ruim");
    expect(tomEstado("NAO_CONFIGURADA")).toBe("neutro");
  });
});

describe("situação de um domínio", () => {
  const base = { status: "ACTIVE", expiraEm: "2027-01-01T12:00:00.000Z", vereditoRegistro: "REGISTRADO" };

  it("registro que não encontra o domínio é atenção, não 'vencendo'", () => {
    expect(situacaoDe({ ...base, vereditoRegistro: "LIVRE" }, AGORA)).toBe("ATENCAO");
  });

  it("nunca consultado e sem data é atenção", () => {
    expect(situacaoDe({ status: "ACTIVE", expiraEm: null, vereditoRegistro: null }, AGORA)).toBe("ATENCAO");
  });

  it("consultado, registrado e sem data publicada é ativo", () => {
    expect(situacaoDe({ status: "ACTIVE", expiraEm: null, vereditoRegistro: "REGISTRADO" }, AGORA)).toBe("ATIVO");
  });

  it("dentro de 60 dias é vencendo; já vencido também", () => {
    expect(situacaoDe({ ...base, expiraEm: "2026-10-20T12:00:00.000Z" }, AGORA)).toBe("VENCENDO");
    expect(situacaoDe({ ...base, expiraEm: "2026-08-20T12:00:00.000Z" }, AGORA)).toBe("VENCENDO");
  });

  it("longe do prazo é ativo", () => {
    expect(situacaoDe(base, AGORA)).toBe("ATIVO");
  });

  it("arquivado continua arquivado", () => {
    expect(situacaoDe({ ...base, status: "ARCHIVED" }, AGORA)).toBe("ARQUIVADO");
  });
});

describe("linha da carteira", () => {
  function dominio(parcial: Partial<DominioDaCarteira>): DominioDaCarteira {
    return {
      id: parcial.fqdn ?? "x",
      fqdn: "exemplo.com.br",
      clienteId: "org-1",
      cliente: "Exemplo",
      situacao: "ATIVO",
      expiraEm: null,
      diasRestantes: null,
      dnsAqui: false,
      registrosDns: 0,
      sincronizadoEm: null,
      vereditoRegistro: "REGISTRADO",
      registroLidoEm: null,
      titular: null,
      renovacaoAutomatica: false,
      ...parcial,
    };
  }

  it("a linha não cita fornecedor nenhum", () => {
    const texto = resumoDaLinha(dominio({ dnsAqui: true, registrosDns: 6, expiraEm: "2026-11-12T12:00:00.000Z" }));

    expect(texto).not.toMatch(/cloudflare|registro\.br|nic\.br|rdap|epp/i);
    expect(texto).toContain("6 registros DNS");
  });

  it("domínio sem registro avisa em vez de mostrar prazo", () => {
    const texto = resumoDaLinha(dominio({ vereditoRegistro: "LIVRE", expiraEm: "2026-11-12T12:00:00.000Z" }));

    expect(texto).toContain("sem registro encontrado");
    expect(texto).not.toContain("vence");
  });

  it("sem data é dito, não escondido", () => {
    expect(resumoDaLinha(dominio({}))).toContain("sem data de vencimento");
  });

  it("prazo curto puxa o tom para vermelho a partir de 14 dias", () => {
    expect(tomDaSituacao(dominio({ situacao: "VENCENDO", diasRestantes: 40 }))).toBe("atencao");
    expect(tomDaSituacao(dominio({ situacao: "VENCENDO", diasRestantes: 9 }))).toBe("ruim");
    expect(tomDaSituacao(dominio({ situacao: "ATENCAO" }))).toBe("ruim");
    expect(tomDaSituacao(dominio({ situacao: "ATIVO" }))).toBe("bom");
  });

  it("o filtro separa as três situações e a busca casa domínio e cliente", () => {
    const lista = [
      dominio({ fqdn: "a.com.br", situacao: "ATIVO", cliente: "Padaria" }),
      dominio({ fqdn: "b.com.br", situacao: "VENCENDO" }),
      dominio({ fqdn: "c.com.br", situacao: "ATENCAO" }),
    ];

    expect(contarPorFiltro(lista)).toEqual({ todos: 3, ativos: 1, vencendo: 1, atencao: 1 });
    expect(filtrar(lista, "", "vencendo").map((d) => d.fqdn)).toEqual(["b.com.br"]);
    expect(filtrar(lista, "padaria", "todos").map((d) => d.fqdn)).toEqual(["a.com.br"]);
    expect(filtrar(lista, "PADARIA", "todos")).toHaveLength(1);
  });
});

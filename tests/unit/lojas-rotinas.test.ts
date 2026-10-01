import { describe, expect, it } from "vitest";
import {
  duracaoLegivel,
  haQuantoTempo,
  ordenarRotinas,
  proximaLegivel,
  resumirRotinas,
  situacaoDaRotina,
  tituloDaRotina,
  tomDaRotina,
} from "@/lib/lojas-painel";
import type { RotinaDaPlataforma, SaudeDasRotinas } from "@/lib/lojas-plataforma";

const AGORA = new Date("2026-09-19T12:00:00.000Z");

function rotina(parcial: Partial<RotinaDaPlataforma> = {}): RotinaDaPlataforma {
  return {
    nome: "mercadolivre.avisos",
    titulo: "Vendas do ML",
    // A frase inteira, como a plataforma manda: é ela que saía cortada no
    // título da linha, e é contra ela que a queda de `titulo` tem que valer.
    descricao: "Fila do Mercado Livre: venda vira pedido e baixa estoque, envio vira rastreio",
    cadencia: "a cada 5 min",
    proximaEm: "2026-09-19T12:03:00.000Z",
    ultimaEm: "2026-09-19T11:58:00.000Z",
    ultimaDuracaoMs: 42,
    ultimoResumo: { lidos: 0 },
    ultimoErro: null,
    falhasSeguidas: 0,
    execucoes: 120,
    executandoDesde: null,
    emAtraso: false,
    falhando: false,
    saudavel: true,
    ...parcial,
  };
}

function saude(rotinas: RotinaDaPlataforma[], ligado = true): SaudeDasRotinas {
  return {
    agendador: { ligado, passadaSegundos: 60 },
    saudavel: rotinas.every((r) => r.saudavel),
    rotinas,
    verificadoEm: AGORA.toISOString(),
  };
}

describe("resumirRotinas", () => {
  it("conta o que está em paz e o que pede gente", () => {
    const r = resumirRotinas(
      saude([
        rotina(),
        rotina({ nome: "seo.categorias", falhando: true, falhasSeguidas: 3, saudavel: false }),
        rotina({ nome: "cobranca.verificar", emAtraso: true, saudavel: false }),
      ]),
    );
    expect(r.total).toBe(3);
    expect(r.emPaz).toBe(1);
    expect(r.comProblema).toBe(2);
    expect(r.agendadorLigado).toBe(true);
  });

  it("sem leitura nenhuma não inventa saúde", () => {
    const r = resumirRotinas(null);
    expect(r.total).toBe(0);
    expect(r.comProblema).toBe(0);
    expect(r.ultimaAtividadeEm).toBeNull();
    // O relógio desligado é o padrão seguro: a tela diz "não sei", não "sim".
    expect(r.agendadorLigado).toBe(false);
  });

  it("a última atividade é a execução mais recente, não a primeira da lista", () => {
    const r = resumirRotinas(
      saude([
        rotina({ nome: "a", ultimaEm: "2026-09-19T09:00:00.000Z" }),
        rotina({ nome: "b", ultimaEm: "2026-09-19T11:58:00.000Z" }),
        rotina({ nome: "c", ultimaEm: null }),
      ]),
    );
    expect(r.ultimaAtividadeEm).toBe("2026-09-19T11:58:00.000Z");
  });

  it("rotina que nunca rodou não conta como problema", () => {
    // O relatório semanal numa quarta-feira: ainda não venceu.
    const r = resumirRotinas(saude([rotina({ nome: "relatorios.semanal", ultimaEm: null, execucoes: 0 })]));
    expect(r.comProblema).toBe(0);
  });
});

describe("ordenarRotinas", () => {
  it("falhando na frente, depois atrasada, depois o resto", () => {
    const nomes = ordenarRotinas([
      rotina({ nome: "em-paz" }),
      rotina({ nome: "atrasada", emAtraso: true, saudavel: false }),
      rotina({ nome: "falhando", falhando: true, saudavel: false }),
    ]).map((r) => r.nome);
    expect(nomes).toEqual(["falhando", "atrasada", "em-paz"]);
  });

  it("não mexe no array recebido", () => {
    const original = [rotina({ nome: "a" }), rotina({ nome: "b", falhando: true, saudavel: false })];
    ordenarRotinas(original);
    expect(original[0].nome).toBe("a");
  });
});

describe("tituloDaRotina", () => {
  it("usa o título curto que a plataforma manda", () => {
    expect(tituloDaRotina(rotina({ titulo: "Vendas do ML" }))).toBe("Vendas do ML");
  });

  it("plataforma antiga, sem o campo, ainda rende uma linha com título", () => {
    // Melhor a frase cortada do que uma linha sem nome nenhum.
    expect(tituloDaRotina(rotina({ titulo: undefined }))).toBe(
      "Fila do Mercado Livre: venda vira pedido e baixa estoque, envio vira rastreio",
    );
  });

  it("título em branco não vira linha vazia", () => {
    expect(tituloDaRotina(rotina({ titulo: "   " }))).toContain("venda vira pedido");
  });
});

describe("tomDaRotina", () => {
  it("falhar é mais grave que atrasar", () => {
    expect(tomDaRotina(rotina({ falhando: true, emAtraso: true }))).toBe("vermelho");
    expect(tomDaRotina(rotina({ emAtraso: true }))).toBe("amarelo");
    expect(tomDaRotina(rotina())).toBe("azul");
  });
});

describe("situacaoDaRotina", () => {
  it("diz há quanto tempo rodou quando está em paz", () => {
    expect(situacaoDaRotina(rotina(), AGORA)).toBe("rodou há 2 min");
  });

  it("execução em andamento ganha a frase, não o histórico", () => {
    expect(situacaoDaRotina(rotina({ executandoDesde: AGORA.toISOString() }), AGORA)).toBe("rodando agora");
  });

  it("conta as falhas seguidas no plural certo", () => {
    expect(situacaoDaRotina(rotina({ falhando: true, falhasSeguidas: 1, saudavel: false }), AGORA)).toBe(
      "falhou na última execução",
    );
    expect(situacaoDaRotina(rotina({ falhando: true, falhasSeguidas: 4, saudavel: false }), AGORA)).toBe(
      "falhou nas últimas 4 execuções",
    );
  });

  it("atrasada diz desde quando, não só que está", () => {
    expect(
      situacaoDaRotina(
        rotina({ emAtraso: true, saudavel: false, proximaEm: "2026-09-19T11:20:00.000Z" }),
        AGORA,
      ),
    ).toBe("atrasada — devia ter rodado há 40 min");
  });

  it("nunca rodou é 'ainda não venceu', não é vermelho", () => {
    const frase = situacaoDaRotina(
      rotina({ nome: "relatorios.semanal", cadencia: "toda segunda às 07:00", ultimaEm: null }),
      AGORA,
    );
    expect(frase).toBe("ainda não venceu");
    expect(frase).not.toContain("nunca");
  });

  it("não repete a cadência, que a linha já mostra ao lado", () => {
    // "toda segunda às 07:00 · ainda não venceu — toda segunda às 07:00" foi
    // o que a primeira versão escreveu na tela.
    for (const r of [
      rotina({ ultimaEm: null }),
      rotina(),
      rotina({ emAtraso: true, saudavel: false }),
      rotina({ falhando: true, falhasSeguidas: 2, saudavel: false }),
    ]) {
      expect(situacaoDaRotina(r, AGORA)).not.toContain(r.cadencia);
    }
  });
});

describe("proximaLegivel", () => {
  it("responde quando é de novo", () => {
    expect(proximaLegivel(rotina({ proximaEm: "2026-09-19T12:03:00.000Z" }), AGORA)).toBe("em 3 min");
  });

  it("venceu agora há pouco não vira 'há 1 min' na coluna do futuro", () => {
    // A passada do agendador é de um minuto: entre vencer e rodar existe uma
    // janela em que a rotina não está atrasada e a próxima já passou.
    expect(proximaLegivel(rotina({ proximaEm: "2026-09-19T11:59:00.000Z" }), AGORA)).toBe("a qualquer momento");
    expect(proximaLegivel(rotina({ proximaEm: AGORA.toISOString() }), AGORA)).toBe("a qualquer momento");
  });

  it("cala quando a situação já respondeu", () => {
    // Atrasada diria "há 2 h" colado a "devia ter rodado há 2 h".
    expect(proximaLegivel(rotina({ emAtraso: true, saudavel: false }), AGORA)).toBeNull();
    expect(proximaLegivel(rotina({ executandoDesde: AGORA.toISOString() }), AGORA)).toBeNull();
  });
});

describe("haQuantoTempo", () => {
  it("responde 'isso é recente?' sem obrigar a subtrair de cabeça", () => {
    expect(haQuantoTempo("2026-09-19T11:59:40.000Z", AGORA)).toBe("agora mesmo");
    expect(haQuantoTempo("2026-09-19T11:57:00.000Z", AGORA)).toBe("há 3 min");
    expect(haQuantoTempo("2026-09-19T09:00:00.000Z", AGORA)).toBe("há 3 h");
    expect(haQuantoTempo("2026-09-18T12:00:00.000Z", AGORA)).toBe("ontem");
    expect(haQuantoTempo("2026-09-16T12:00:00.000Z", AGORA)).toBe("há 3 dias");
  });

  it("acima de uma semana a data absoluta volta a ser mais fácil de ler", () => {
    // "há 23 dias" é que vira a conta difícil.
    expect(haQuantoTempo("2026-08-27T12:00:00.000Z", AGORA)).toMatch(/27 de ago/);
  });

  it("o futuro não vira 'há -3 min'", () => {
    expect(haQuantoTempo("2026-09-19T12:03:00.000Z", AGORA)).toBe("em 3 min");
    expect(haQuantoTempo("2026-09-21T10:00:00.000Z", AGORA)).toBe("em 2 dias");
    expect(haQuantoTempo("2026-09-20T12:00:00.000Z", AGORA)).toBe("amanhã");
  });

  it("a data absoluta sai no fuso de São Paulo, não no do servidor", () => {
    // 01:00Z de 20/08 é ainda 19/08 às 22h em São Paulo.
    expect(haQuantoTempo("2026-08-20T01:00:00.000Z", AGORA)).toMatch(/19 de ago/);
  });
});

describe("duracaoLegivel", () => {
  it("usa a unidade em que a duração se lê", () => {
    expect(duracaoLegivel(42)).toBe("42 ms");
    expect(duracaoLegivel(999)).toBe("999 ms");
    expect(duracaoLegivel(1000)).toBe("1 s");
    expect(duracaoLegivel(2340)).toBe("2,3 s");
    expect(duracaoLegivel(null)).toBeNull();
  });
});

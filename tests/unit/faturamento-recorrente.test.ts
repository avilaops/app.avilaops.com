import { describe, expect, it } from "vitest";
import { competenciaDe, devidaNaCompetencia, hojeNoBrasil } from "@/lib/faturamento-recorrente";

const assinatura = (inicio: string, ciclo = "MONTHLY", fim: string | null = null) => ({
  startedAt: new Date(inicio),
  endedAt: fim ? new Date(fim) : null,
  billingCycle: ciclo,
});

describe("competência e dia de hoje são os do Brasil", () => {
  it("às 23h de Brasília do dia 31 ainda é o mês que está acabando", () => {
    // 01/11 02:00 UTC = 31/10 23:00 em São Paulo.
    const virada = new Date("2026-11-01T02:00:00Z");
    expect(competenciaDe(virada)).toBe("2026-10");
    expect(hojeNoBrasil(virada).toISOString()).toBe("2026-10-31T00:00:00.000Z");
  });

  it("depois da meia-noite de Brasília já é o mês novo", () => {
    expect(competenciaDe(new Date("2026-11-01T03:30:00Z"))).toBe("2026-11");
  });
});

describe("quem tem fatura na competência", () => {
  it("mensal: do mês em que começou em diante, nunca antes", () => {
    const a = assinatura("2026-09-15T12:00:00Z");
    expect(devidaNaCompetencia(a, "2026-08")).toBe(false);
    expect(devidaNaCompetencia(a, "2026-09")).toBe(true);
    expect(devidaNaCompetencia(a, "2026-10")).toBe(true);
    expect(devidaNaCompetencia(a, "2027-01")).toBe(true);
  });

  it("anual: só no mês de aniversário", () => {
    const a = assinatura("2026-09-15T12:00:00Z", "YEARLY");
    expect(devidaNaCompetencia(a, "2026-09")).toBe(true);
    expect(devidaNaCompetencia(a, "2026-10")).toBe(false);
    expect(devidaNaCompetencia(a, "2027-08")).toBe(false);
    expect(devidaNaCompetencia(a, "2027-09")).toBe(true);
  });

  it("encerrada: fatura até o mês do encerramento, e depois não", () => {
    const a = assinatura("2026-06-01T12:00:00Z", "MONTHLY", "2026-09-20T12:00:00Z");
    expect(devidaNaCompetencia(a, "2026-09")).toBe(true);
    expect(devidaNaCompetencia(a, "2026-10")).toBe(false);
  });

  it("competência malformada não fatura ninguém", () => {
    const a = assinatura("2026-01-01T12:00:00Z");
    for (const ruim of ["", "2026", "2026-13", "2026-00", "outubro"]) {
      expect(devidaNaCompetencia(a, ruim)).toBe(false);
    }
  });
});

import { describe, expect, it } from "vitest";
import { progressoDaMeta } from "@/lib/credito";

describe("progressoDaMeta", () => {
  it("sem lançamento é zero, sem dividir por zero", () => {
    expect(progressoDaMeta([])).toEqual({
      total: 0,
      quitado: 0,
      restante: 0,
      percentual: 0,
      quantidade: 0,
      quantidadeQuitada: 0,
    });
  });

  it("soma aberto e quitado; cancelada fica de fora dos dois lados", () => {
    const meta = progressoDaMeta([
      { status: "OPEN", amount: "80395.75" },
      { status: "PAID", amount: "530.46" },
      { status: "PAID", amount: 320.69 },
      { status: "CANCELLED", amount: "3500.00" },
    ]);
    expect(meta.total).toBeCloseTo(81246.9, 2);
    expect(meta.quitado).toBeCloseTo(851.15, 2);
    expect(meta.restante).toBeCloseTo(80395.75, 2);
    expect(meta.percentual).toBe(1);
    expect(meta.quantidade).toBe(3);
    expect(meta.quantidadeQuitada).toBe(2);
  });

  it("tudo quitado é 100%", () => {
    const meta = progressoDaMeta([
      { status: "PAID", amount: "10" },
      { status: "PAID", amount: "20" },
    ]);
    expect(meta.percentual).toBe(100);
    expect(meta.restante).toBe(0);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const { rows } = vi.hoisted(() => ({ rows: new Map<string, Record<string, unknown>>() }));
vi.mock("@/lib/prisma", () => ({
  prisma: { organizationOnboardingStep: {
    count: async () => rows.size,
    createMany: async ({ data, skipDuplicates }: { data: Record<string, unknown>[]; skipDuplicates: boolean }) => {
      for (const row of data) {
        const key = `${row.organizationId}:${row.stepKey}`;
        if (rows.has(key) && skipDuplicates) continue;
        if (rows.has(key)) throw new Error("Etapa duplicada");
        rows.set(key, { ...row });
      }
    },
    upsert: async ({ where, create, update }: {
      where: { organizationId_stepKey: { organizationId: string; stepKey: string } };
      create: Record<string, unknown>; update: Record<string, unknown>;
    }) => {
      const { organizationId, stepKey } = where.organizationId_stepKey;
      const key = `${organizationId}:${stepKey}`;
      rows.set(key, rows.has(key) ? { ...rows.get(key), ...update } : { ...create });
    },
  } },
}));
import { ETAPAS, marcarEtapa } from "@/lib/onboarding-etapas";

describe("etapas de fichas existentes", () => {
  beforeEach(() => rows.clear());

  it("completa uma ficha antiga preservando sua evidência e data de conclusão", async () => {
    const previous = { organizationId: "cliente", stepKey: "BASIC", status: "DONE", notes: "Cadastro conferido", completedAt: new Date("2026-08-01") };
    rows.set("cliente:BASIC", previous);
    await marcarEtapa("cliente", "ACCESS", "Acesso criado");
    expect(rows.size).toBe(ETAPAS.length);
    expect(rows.get("cliente:BASIC")).toEqual(previous);
    expect(rows.get("cliente:ACCESS")).toMatchObject({ status: "DONE", notes: "Acesso criado" });
    expect(rows.get("cliente:GOOGLE")).toMatchObject({ status: "PENDING" });
  });

  it("repetir uma ação não duplica etapas nem perde avanços anteriores", async () => {
    await marcarEtapa("cliente", "ACCESS", "Acesso criado");
    await marcarEtapa("cliente", "STORE", "Loja criada");
    await marcarEtapa("cliente", "STORE", "Loja conferida");
    expect(rows.size).toBe(ETAPAS.length);
    expect(rows.get("cliente:ACCESS")).toMatchObject({ status: "DONE", notes: "Acesso criado" });
    expect(rows.get("cliente:STORE")).toMatchObject({ status: "DONE", notes: "Loja conferida" });
    expect(rows.get("cliente:SITE")).toMatchObject({ status: "DONE" });
    expect(rows.get("cliente:BILLING")).toMatchObject({ status: "PENDING" });
  });
});

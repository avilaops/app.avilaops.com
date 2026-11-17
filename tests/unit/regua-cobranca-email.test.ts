import { describe, expect, it } from "vitest";
import {
  claimExpirou,
  deveCancelarPorStatus,
  etapasDaRegua,
  itemProcessavel,
  proximoEstadoAposFalha,
} from "@/lib/regua-cobranca-email";

describe("régua automática de cobrança por e-mail", () => {
  it("deriva D−5, D0 e D+3 às 09:00 de São Paulo", () => {
    expect(etapasDaRegua(new Date("2026-11-20T00:00:00.000Z"))).toEqual([
      { stage: "PRE_DUE", scheduledFor: new Date("2026-11-15T12:00:00.000Z"), conteudo: "fatura" },
      { stage: "DUE", scheduledFor: new Date("2026-11-20T12:00:00.000Z"), conteudo: "ambos" },
      { stage: "OVERDUE", scheduledFor: new Date("2026-11-23T12:00:00.000Z"), conteudo: "ambos" },
    ]);
  });

  it("aceita item vencido há no máximo 24 horas", () => {
    const agora = new Date("2026-11-21T11:59:59.000Z");
    expect(itemProcessavel(new Date("2026-11-20T12:00:00.000Z"), agora)).toBe(true);
  });

  it("recusa item vencido há mais de 24 horas", () => {
    const agora = new Date("2026-11-21T12:00:01.000Z");
    expect(itemProcessavel(new Date("2026-11-20T12:00:00.000Z"), agora)).toBe(false);
  });

  it("não processa item futuro", () => {
    expect(itemProcessavel(new Date("2026-11-20T12:00:01.000Z"), new Date("2026-11-20T12:00:00.000Z"))).toBe(false);
  });

  it("repete uma vez após 30 minutos", () => {
    expect(proximoEstadoAposFalha(1, new Date("2026-11-20T12:00:00.000Z"))).toEqual({
      status: "PENDING",
      nextAttemptAt: new Date("2026-11-20T12:30:00.000Z"),
    });
  });

  it("encerra depois da segunda tentativa", () => {
    expect(proximoEstadoAposFalha(2, new Date("2026-11-20T12:00:00.000Z"))).toEqual({
      status: "FAILED",
      nextAttemptAt: null,
    });
  });

  it.each(["PAID", "CANCELLED"])("cancela pendências quando a fatura está %s", (status) => {
    expect(deveCancelarPorStatus(status)).toBe(true);
  });

  it("mantém a régua para fatura aberta ou vencida", () => {
    expect(deveCancelarPorStatus("OPEN")).toBe(false);
    expect(deveCancelarPorStatus("OVERDUE")).toBe(false);
  });

  it("libera uma reivindicação abandonada depois de dez minutos", () => {
    expect(claimExpirou(new Date("2026-11-20T11:49:59.000Z"), new Date("2026-11-20T12:00:00.000Z"))).toBe(true);
    expect(claimExpirou(new Date("2026-11-20T11:50:01.000Z"), new Date("2026-11-20T12:00:00.000Z"))).toBe(false);
  });
});

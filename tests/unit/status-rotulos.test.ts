import { describe, expect, it } from "vitest";
import { MAPA_STATUS, rotuloObjetivo, rotuloStatus } from "@/lib/status-rotulos";

describe("rotuloStatus", () => {
  it("traduz os códigos conhecidos com o tom certo", () => {
    expect(rotuloStatus("active")).toEqual({ texto: "Ativo", tom: "bom" });
    expect(rotuloStatus("pending")).toEqual({ texto: "Pendente", tom: "atencao" });
    expect(rotuloStatus("received")).toEqual({ texto: "Recebido", tom: "info" });
    expect(rotuloStatus("disconnected")).toEqual({ texto: "Desconectado", tom: "ruim" });
    expect(rotuloStatus("archived")).toEqual({ texto: "Arquivado", tom: "neutro" });
  });

  it("ignora caixa e espaços nas pontas (status do Prisma vêm em maiúsculas)", () => {
    expect(rotuloStatus("ACTIVE")).toEqual(rotuloStatus("active"));
    expect(rotuloStatus("  Pending ")).toEqual(rotuloStatus("pending"));
    expect(rotuloStatus("ARCHIVED").texto).toBe("Arquivado");
  });

  it("humaniza o que não conhece, sem lançar", () => {
    expect(rotuloStatus("waiting_review")).toEqual({ texto: "Waiting review", tom: "neutro" });
    expect(rotuloStatus("SOME-ODD_CODE")).toEqual({ texto: "Some odd code", tom: "neutro" });
  });

  it("vazio, nulo ou indefinido vira 'Sem status'", () => {
    const esperado = { texto: "Sem status", tom: "neutro" };
    expect(rotuloStatus("")).toEqual(esperado);
    expect(rotuloStatus("   ")).toEqual(esperado);
    expect(rotuloStatus(null)).toEqual(esperado);
    expect(rotuloStatus(undefined)).toEqual(esperado);
  });

  it("nenhum rótulo do mapa fica em inglês cru nem com maiúscula no meio", () => {
    for (const { texto } of Object.values(MAPA_STATUS)) {
      expect(texto).not.toMatch(/^(active|pending|received|error)$/i);
      if (texto === "OK") continue;
      expect(texto.slice(1)).not.toMatch(/[A-Z]/);
    }
  });

  it("códigos da Meta saem em português", () => {
    expect(rotuloStatus("NEW")).toEqual({ texto: "Novo", tom: "atencao" });
    expect(rotuloStatus("not_verified").texto).toBe("Não verificado");
    expect(rotuloStatus("pending_risk_review").tom).toBe("atencao");
    expect(rotuloStatus("any_active")).toEqual({ texto: "Ativa", tom: "bom" });
  });

  /**
   * O bug que originou este teste: "PROCESSED" — status que o webhook do
   * WhatsApp grava em toda mensagem tratada — não estava no mapa, caía no
   * humanizador e aparecia na tela como "Processed", em inglês, ao lado de
   * "Recebido" e "Erro". Quem grava cada código está em src/lib/whatsapp.ts,
   * src/lib/meta.ts e nos defaults do schema.prisma.
   */
  it("todo status gravado pelas integrações tem rótulo no mapa, não no humanizador", () => {
    const gravados = [
      "RECEIVED", // default de IntegrationWebhookEvent
      "PROCESSED", // whatsapp.ts, ao tratar o evento
      "FAILED",
      "ACTIVE", // meta.ts e default de DomainAsset
      "ERROR",
      "PENDING",
      "DISCONNECTED",
    ];
    for (const codigo of gravados) {
      expect(MAPA_STATUS[codigo.toLowerCase()], `${codigo} sem rótulo`).toBeDefined();
    }
  });

  it("processado é um bom desfecho, e não se confunde com processando", () => {
    expect(rotuloStatus("PROCESSED")).toEqual({ texto: "Processado", tom: "bom" });
    expect(rotuloStatus("processing")).toEqual({ texto: "Processando", tom: "info" });
  });

  it("objetivo de campanha vira rótulo; desconhecido volta cru e nulo vira nulo", () => {
    expect(rotuloObjetivo("OUTCOME_LEADS")).toBe("Leads");
    expect(rotuloObjetivo("outcome_sales")).toBe("Vendas");
    expect(rotuloObjetivo("NOVO_OBJETIVO")).toBe("NOVO_OBJETIVO");
    expect(rotuloObjetivo(null)).toBeNull();
  });
});

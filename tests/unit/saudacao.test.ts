import { describe, expect, it } from "vitest";
import { horaEmSaoPaulo, saudacao } from "@/lib/format";

// Os instantes vêm em UTC de propósito: é o relógio do servidor que monta a tela.
describe("saudação no relógio de São Paulo", () => {
  it("09:36 em São Paulo é bom dia, mesmo sendo 12:36 no servidor", () => {
    expect(horaEmSaoPaulo("2026-10-03T12:36:00Z")).toBe(9);
    expect(saudacao("2026-10-03T12:36:00Z")).toBe("Bom dia");
  });

  it("vira para boa tarde ao meio-dia daqui", () => {
    expect(saudacao("2026-10-03T14:59:00Z")).toBe("Bom dia");
    expect(saudacao("2026-10-03T15:00:00Z")).toBe("Boa tarde");
  });

  it("vira para boa noite às 18h daqui", () => {
    expect(saudacao("2026-10-03T20:59:00Z")).toBe("Boa tarde");
    expect(saudacao("2026-10-03T21:00:00Z")).toBe("Boa noite");
  });

  it("21h daqui é boa noite, mesmo já sendo madrugada do dia seguinte no servidor", () => {
    expect(saudacao("2026-10-04T00:30:00Z")).toBe("Boa noite");
  });

  it("meia-noite é hora 0, não 24", () => {
    expect(horaEmSaoPaulo("2026-10-03T03:00:00Z")).toBe(0);
    expect(saudacao("2026-10-03T03:00:00Z")).toBe("Bom dia");
  });
});

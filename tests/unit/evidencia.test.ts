import { describe, expect, it } from "vitest";
import { frescor } from "@/lib/evidencia";

const agora = new Date("2026-09-16T12:00:00Z");
const atras = (ms: number) => new Date(agora.getTime() - ms).toISOString();

describe("frescor", () => {
  it("sem leitura ou data inválida não inventa idade", () => {
    expect(frescor(null, agora)).toEqual({ texto: "sem leitura registrada", tom: "neutro" });
    expect(frescor(undefined, agora).tom).toBe("neutro");
    expect(frescor("ontem", agora).texto).toBe("sem leitura registrada");
  });

  it("escala a unidade e o tom com a idade", () => {
    expect(frescor(atras(20_000), agora)).toEqual({ texto: "há 20 s", tom: "bom" });
    expect(frescor(atras(4 * 60_000), agora)).toEqual({ texto: "há 4 min", tom: "bom" });
    expect(frescor(atras(6 * 60_000), agora).tom).toBe("atencao");
    expect(frescor(atras(3 * 3_600_000), agora)).toEqual({ texto: "há 3 h", tom: "atencao" });
    expect(frescor(atras(2 * 86_400_000), agora)).toEqual({ texto: "há 2 d", tom: "ruim" });
  });

  it("leitura no futuro conta como agora, não como negativa", () => {
    expect(frescor(atras(-60_000), agora)).toEqual({ texto: "há 0 s", tom: "bom" });
  });
});

import { afterEach, describe, expect, it } from "vitest";
import {
  internalSiteBaseUrl,
  internalSiteSlug,
  internalSiteUrl,
  resolveInternalSubdomain,
} from "@/lib/internal-site";

const original = process.env.INTERNAL_SITE_BASE_URL;

afterEach(() => {
  if (original === undefined) delete process.env.INTERNAL_SITE_BASE_URL;
  else process.env.INTERNAL_SITE_BASE_URL = original;
});

describe("internalSiteBaseUrl", () => {
  it("devolve null quando ninguém apontou um host", () => {
    delete process.env.INTERNAL_SITE_BASE_URL;
    expect(internalSiteBaseUrl()).toBeNull();
    process.env.INTERNAL_SITE_BASE_URL = "   ";
    expect(internalSiteBaseUrl()).toBeNull();
  });

  it("tira a barra final para não montar endereço com barra dupla", () => {
    process.env.INTERNAL_SITE_BASE_URL = "https://sites.avilaops.com//";
    expect(internalSiteBaseUrl()).toBe("https://sites.avilaops.com");
  });
});

describe("internalSiteUrl", () => {
  it("não inventa endereço sem host configurado", () => {
    delete process.env.INTERNAL_SITE_BASE_URL;
    expect(internalSiteUrl("padaria-do-ze")).toBeNull();
  });

  it("monta o endereço a partir do host configurado", () => {
    process.env.INTERNAL_SITE_BASE_URL = "https://sites.avilaops.com";
    expect(internalSiteUrl("padaria-do-ze")).toBe("https://sites.avilaops.com/padaria-do-ze");
  });
});

describe("internalSiteSlug", () => {
  it("tira acento, baixa caixa e junta o resto com hífen", () => {
    expect(internalSiteSlug("Padaria do Zé")).toBe("padaria-do-ze");
    expect(internalSiteSlug("  --Óptica & Cia--  ")).toBe("optica-cia");
  });

  it("para em 64 caracteres", () => {
    expect(internalSiteSlug("a".repeat(100))).toHaveLength(64);
  });
});

describe("resolveInternalSubdomain", () => {
  it("usa o primeiro candidato que sobrevive ao slug", () => {
    expect(resolveInternalSubdomain(null, "", "Padaria do Zé")).toBe("padaria-do-ze");
    expect(resolveInternalSubdomain("Ótica Vision", "padaria")).toBe("otica-vision");
  });

  it("descarta candidato que encolhe para menos de dois caracteres", () => {
    expect(resolveInternalSubdomain("!", "é")).toBeNull();
    expect(resolveInternalSubdomain("!", "AB")).toBe("ab");
  });
});

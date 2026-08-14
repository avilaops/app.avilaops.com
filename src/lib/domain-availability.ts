const DOMAIN_RE = /^(?!-)(?:[a-z0-9-]{1,63}\.)+[a-z]{2,63}$/;

export type DomainAvailabilityResult = {
  domain: string;
  status: "AVAILABLE" | "UNAVAILABLE" | "UNKNOWN";
  source: "RDAP";
  message: string;
};

export function normalizeDomainInput(value: string) {
  const trimmed = value.trim().toLowerCase();
  const withoutProtocol = trimmed.replace(/^https?:\/\//, "").split("/")[0].split("?")[0];
  const withoutWww = withoutProtocol.replace(/^www\./, "");
  return withoutWww.replace(/[^a-z0-9.-]/g, "").slice(0, 253);
}

export async function checkDomainAvailability(domainInput: string): Promise<DomainAvailabilityResult> {
  const domain = normalizeDomainInput(domainInput);
  if (!DOMAIN_RE.test(domain) || domain.includes("..")) {
    throw new Error("Informe um domínio válido, como empresa.com.br.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(`https://rdap.org/domain/${encodeURIComponent(domain)}`, {
      signal: controller.signal,
      headers: { accept: "application/rdap+json, application/json" },
    });

    if (response.status === 404) {
      return {
        domain,
        status: "AVAILABLE",
        source: "RDAP",
        message: "Nenhum registro RDAP encontrado. Confirmar preço final no provedor antes da contratação.",
      };
    }

    if (response.ok) {
      return {
        domain,
        status: "UNAVAILABLE",
        source: "RDAP",
        message: "Domínio já possui registro público.",
      };
    }

    return {
      domain,
      status: "UNKNOWN",
      source: "RDAP",
      message: `RDAP retornou HTTP ${response.status}. Confirmar manualmente no provedor.`,
    };
  } catch {
    return {
      domain,
      status: "UNKNOWN",
      source: "RDAP",
      message: "Não foi possível consultar o RDAP agora. Confirmar manualmente no provedor.",
    };
  } finally {
    clearTimeout(timeout);
  }
}

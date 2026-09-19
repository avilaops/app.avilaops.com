import { ehDominioBr, exigirDominio, normalizeDomainInput } from "@/lib/dominio";
import { consultarDominioBr, type StatusDominioBr } from "@/lib/registro-br";

export { normalizeDomainInput };

export type DomainAvailabilityResult = {
  domain: string;
  status: "AVAILABLE" | "UNAVAILABLE" | "BLOCKED" | "UNKNOWN";
  /** Qual registro respondeu. O do `.br` é o autoritativo; o `rdap.org` é o bootstrap da IANA. */
  source: "REGISTRO_BR" | "RDAP";
  message: string;
  /** ISO 8601, quando a fonte publica a expiração. Hoje só o Registro.br publica. */
  expiresAt?: string | null;
  /** Titular, quando a fonte publica. */
  holder?: string | null;
  /** Verdadeiro quando a resposta veio do cache em memória, não da rede. */
  cached?: boolean;
};

const TEMPO_LIMITE_MS = 8_000;

function traduzir(status: StatusDominioBr): DomainAvailabilityResult["status"] {
  if (status === "LIVRE") return "AVAILABLE";
  if (status === "REGISTRADO") return "UNAVAILABLE";
  if (status === "BLOQUEADO" || status === "INVALIDO") return "BLOCKED";
  return "UNKNOWN";
}

/**
 * Disponibilidade de um domínio.
 *
 * Domínio `.br` vai direto ao registro autoritativo (`rdap.registro.br`), que
 * além de dizer se existe também devolve expiração e titular. O `rdap.org`
 * responde pelo `.br` por bootstrap, mas de lá não vem a data de vencimento,
 * que é justamente o que a carteira precisa. O resto do mundo continua pelo
 * `rdap.org`.
 */
export async function checkDomainAvailability(domainInput: string): Promise<DomainAvailabilityResult> {
  const domain = exigirDominio(domainInput);

  if (ehDominioBr(domain)) {
    const consulta = await consultarDominioBr(domain);
    return {
      domain,
      status: traduzir(consulta.status),
      source: "REGISTRO_BR",
      message: consulta.mensagem,
      expiresAt: consulta.expiraEm,
      holder: consulta.titular,
      cached: consulta.deCache,
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TEMPO_LIMITE_MS);
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
        expiresAt: null,
        holder: null,
      };
    }

    if (response.ok) {
      return {
        domain,
        status: "UNAVAILABLE",
        source: "RDAP",
        message: "Domínio já possui registro público.",
        expiresAt: null,
        holder: null,
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

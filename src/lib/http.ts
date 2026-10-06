import { NextRequest } from "next/server";
import { isIP } from "node:net";
import { promises as dns } from "node:dns";

export function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
]);

/**
 * Parses a user-supplied domain into a bare hostname, rejecting anything
 * that isn't a plain HTTPS host (no IP literals, ports, paths or auth).
 * Does not by itself guarantee the host is publicly reachable — pair with
 * `assertPublicHostname` before letting the server fetch from it.
 */
export function normalizeAndValidateHostname(value: string): string {
  const raw = value.trim();

  let parsed: URL;
  try {
    parsed = new URL(raw.startsWith("http://") || raw.startsWith("https://") ? raw : `https://${raw}`);
  } catch {
    throw new Error("FQDN inválido.");
  }

  if (parsed.protocol !== "https:") {
    throw new Error("O domínio deve utilizar HTTPS.");
  }

  if (
    parsed.username ||
    parsed.password ||
    parsed.port ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error("FQDN inválido.");
  }

  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, "");

  if (!hostname || BLOCKED_HOSTNAMES.has(hostname)) {
    throw new Error("Hostname inválido.");
  }

  if (isIP(hostname)) {
    throw new Error("Endereços IP não são permitidos.");
  }

  return hostname;
}

function isPrivateIp(address: string, family: number): boolean {
  if (family === 4) {
    const [a, b] = address.split(".").map(Number);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    return false;
  }

  const lower = address.toLowerCase();
  return lower === "::1" || lower.startsWith("fe80:") || lower.startsWith("fc") || lower.startsWith("fd");
}

/**
 * Resolves `hostname` and throws if it points at a loopback, link-local or
 * private-range address, to block SSRF via DNS rebinding / internal hosts.
 */
export async function assertPublicHostname(hostname: string): Promise<void> {
  let records: { address: string; family: number }[];
  try {
    records = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new Error("Não foi possível resolver o domínio.");
  }

  if (records.length === 0 || records.some((record) => isPrivateIp(record.address, record.family))) {
    throw new Error("Domínio resolve para um endereço interno/privado.");
  }
}

export function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return true;

  try {
    const originUrl = new URL(origin);
    const forwardedHost = request.headers.get("x-forwarded-host");
    const host = forwardedHost ?? request.headers.get("host");
    return Boolean(host && originUrl.host === host);
  } catch {
    return false;
  }
}

/**
 * `sameOrigin` sem o benefício da dúvida: quem não diz de onde vem não passa.
 *
 * `sameOrigin` aceita pedido sem `Origin` porque atende também a automação, que
 * chama de fora do navegador e não manda o cabeçalho. Rota de segredo (cofre,
 * certificado, chave de API, dados da casa) não tem esse público: só o dono, no
 * navegador, com cookie. Ali a ausência do cabeçalho não é neutra — é um pedido
 * que não saiu da nossa tela.
 *
 * Navegador atual manda `Origin` em todo POST/PUT/DELETE; quando não manda,
 * `Sec-Fetch-Site` diz a mesma coisa e não pode ser forjado por script de
 * página. Sem nenhum dos dois, recusa.
 */
export function origemEstrita(request: Request) {
  if (request.headers.get("origin")) return sameOrigin(request as NextRequest);
  return request.headers.get("sec-fetch-site") === "same-origin";
}

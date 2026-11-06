/** Leitura exclusivamente no servidor da evidência ONNIX do Experiments. */
export type OnnixEvidence = {
  available: boolean;
  stale?: boolean;
  createdAt?: string;
  modelSha256?: string;
  modelBytes?: number;
  provider?: string;
  evaluation?: {
    verdict: "passed" | "failed" | "error";
    latencyMs?: number;
    inputPixels?: number[];
    outputPixels?: number[];
    outputFormat?: string;
    outputBytes?: number;
  };
};

export type OnnixSnapshot =
  | { status: "unconfigured" | "unavailable"; evidence: null }
  | { status: "ok"; evidence: OnnixEvidence };

function validEvidence(input: unknown): input is OnnixEvidence {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return false;
  const v = input as Record<string, unknown>;
  if (typeof v.available !== "boolean") return false;
  if (!v.available) return true;
  if (typeof v.createdAt !== "string" || !Number.isFinite(Date.parse(v.createdAt)) ||
      typeof v.modelSha256 !== "string" || !/^[a-f0-9]{64}$/.test(v.modelSha256)) return false;
  const e = v.evaluation;
  if (typeof e !== "object" || e === null || Array.isArray(e)) return false;
  return ["passed", "failed", "error"].includes(String((e as Record<string, unknown>).verdict));
}

/** Fail-closed: sem credencial ou sem resposta válida, jamais inventar saúde ou medição. */
export async function fetchOnnixSnapshot(): Promise<OnnixSnapshot> {
  const base = process.env.EXPERIMENTS_PRIVATE_API_URL?.trim();
  const token = process.env.EXPERIMENTS_API_TOKEN?.trim();
  if (!base || !token) return { status: "unconfigured", evidence: null };
  let url: URL;
  try {
    url = new URL("/api/v1/onnix", base);
    // Evita SSRF: apenas o gateway privado do Experiments na VPN.
    if (url.protocol !== "http:" || url.hostname !== "10.10.0.4" || url.port !== "3300") {
      return { status: "unavailable", evidence: null };
    }
  } catch {
    return { status: "unavailable", evidence: null };
  }
  try {
    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(4500),
    });
    if (!response.ok) return { status: "unavailable", evidence: null };
    const body: unknown = await response.json();
    if (!validEvidence(body)) return { status: "unavailable", evidence: null };
    return { status: "ok", evidence: body };
  } catch {
    return { status: "unavailable", evidence: null };
  }
}

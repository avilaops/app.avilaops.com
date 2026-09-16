import http from "node:http";
import https from "node:https";
import type { Socket } from "node:net";
import { PROBE_TIMEOUT_MS, PROBE_VERSION } from "@/lib/health/config";

/**
 * Teste HTTP de um serviço, com as fases separadas.
 *
 * O probe antigo usava `fetch`, que só devolve "demorou X ms" ou uma exceção.
 * Aqui cada requisição abre conexão nova (sem keep-alive, `agent: false`) para
 * que DNS, TCP e TLS sejam medidos de verdade a cada rodada, e o erro técnico
 * sai com o código e a mensagem originais do Node, sem tradução.
 *
 * A latência continua sendo o tempo até os cabeçalhos da resposta final
 * (depois dos redirecionamentos), o mesmo critério de antes: o corpo não é
 * baixado.
 */

export type ProbeTimings = {
  /** Fases da última requisição (a que respondeu ou falhou). */
  dnsMs: number | null;
  connectMs: number | null;
  tlsMs: number | null;
  ttfbMs: number | null;
};

export type ProbeResult = {
  url: string;
  finalUrl: string;
  method: "GET";
  httpStatus: number | null;
  latencyMs: number;
  errorCode: string | null;
  errorMessage: string | null;
  resolvedIp: string | null;
  redirects: number;
  timings: ProbeTimings;
  startedAt: Date;
  finishedAt: Date;
  probeVersion: string;
};

type Hop = {
  status: number | null;
  location: string | null;
  ip: string | null;
  timings: ProbeTimings;
};

const MAX_REDIRECTS = 5;

function hop(url: URL, signal: AbortSignal): Promise<Hop> {
  return new Promise((resolve, reject) => {
    const client = url.protocol === "http:" ? http : https;
    const started = performance.now();
    const marks: { lookup?: number; connect?: number; secure?: number } = {};
    let ip: string | null = null;

    const request = client.request(url, {
      method: "GET",
      agent: false,
      headers: { "User-Agent": `AvilaOps-Realtime-Monitor/2.0 (${PROBE_VERSION})`, Accept: "*/*" },
      signal,
    });

    request.on("socket", (socket: Socket) => {
      socket.on("lookup", (_error, address) => {
        marks.lookup = performance.now();
        if (typeof address === "string") ip = address;
      });
      socket.on("connect", () => {
        marks.connect = performance.now();
        ip = socket.remoteAddress ?? ip;
      });
      socket.on("secureConnect", () => {
        marks.secure = performance.now();
      });
    });

    function timings(end: number | null): ProbeTimings {
      const dnsEnd = marks.lookup ?? null;
      return {
        dnsMs: dnsEnd === null ? null : Math.round(dnsEnd - started),
        connectMs: marks.connect === undefined ? null : Math.round(marks.connect - (dnsEnd ?? started)),
        tlsMs: marks.secure === undefined || marks.connect === undefined ? null : Math.round(marks.secure - marks.connect),
        ttfbMs: end === null ? null : Math.round(end - (marks.secure ?? marks.connect ?? started)),
      };
    }

    request.on("response", (response) => {
      const end = performance.now();
      const location = typeof response.headers.location === "string" ? response.headers.location : null;
      response.destroy();
      resolve({ status: response.statusCode ?? null, location, ip, timings: timings(end) });
    });
    request.on("error", (error: NodeJS.ErrnoException) => {
      Object.assign(error, { timings: timings(null), ip });
      reject(error);
    });
    request.end();
  });
}

function codeOf(error: unknown, timedOut: boolean): string {
  if (timedOut) return "TIMEOUT";
  if (error && typeof error === "object") {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && code) return code;
    const name = (error as { name?: unknown }).name;
    if (name === "AbortError") return "TIMEOUT";
    if (typeof name === "string") return name.toUpperCase();
  }
  return "UNKNOWN";
}

export async function probeUrl(url: string, timeoutMs = PROBE_TIMEOUT_MS): Promise<ProbeResult> {
  const startedAt = new Date();
  const started = performance.now();
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  let current = new URL(url);
  let redirects = 0;
  let last: Hop | null = null;
  try {
    for (;;) {
      last = await hop(current, controller.signal);
      if (last.status !== null && last.status >= 300 && last.status < 400 && last.location && redirects < MAX_REDIRECTS) {
        current = new URL(last.location, current);
        redirects += 1;
        continue;
      }
      break;
    }
    return {
      url, finalUrl: current.toString(), method: "GET",
      httpStatus: last.status, latencyMs: Math.round(performance.now() - started),
      errorCode: null, errorMessage: null, resolvedIp: last.ip, redirects, timings: last.timings,
      startedAt, finishedAt: new Date(), probeVersion: PROBE_VERSION,
    };
  } catch (error) {
    const extra = error as { timings?: ProbeTimings; ip?: string | null; message?: string };
    return {
      url, finalUrl: current.toString(), method: "GET",
      httpStatus: null, latencyMs: Math.round(performance.now() - started),
      errorCode: codeOf(error, timedOut),
      errorMessage: timedOut ? `sem resposta em ${timeoutMs} ms` : (extra.message ?? null),
      resolvedIp: extra.ip ?? null, redirects,
      timings: extra.timings ?? { dnsMs: null, connectMs: null, tlsMs: null, ttfbMs: null },
      startedAt, finishedAt: new Date(), probeVersion: PROBE_VERSION,
    };
  } finally {
    clearTimeout(timer);
  }
}

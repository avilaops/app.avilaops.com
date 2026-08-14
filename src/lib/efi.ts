import { createHash } from "crypto";
import { readFileSync } from "fs";
import https from "https";

const PIX_BASE_URL = "https://pix.api.efipay.com.br";

type JsonRecord = Record<string, unknown>;

export type NormalizedBankTransaction = {
  externalId: string;
  endToEndId: string | null;
  txid: string | null;
  direction: "CREDIT" | "DEBIT";
  transactionType: "PIX_RECEIVED" | "PIX_SENT";
  amount: number;
  description: string;
  counterpartyName: string | null;
  occurredAt: Date;
  rawHash: string;
};

export type EfiFinancialSnapshot = {
  capturedAt: Date;
  periodStart: Date;
  periodEnd: Date;
  balance: {
    available: number;
    blockedTotal: number | null;
    blockedJudicial: number | null;
    blockedMed: number | null;
  };
  transactions: NormalizedBankTransaction[];
};

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown): number {
  const parsed = Number.parseFloat(String(value ?? "0"));
  return Number.isFinite(parsed) ? parsed : 0;
}

function nestedString(record: JsonRecord, parent: string, field: string) {
  return asString(asRecord(record[parent])[field]);
}

function certificateBuffer(): Buffer {
  const base64 = process.env.EFI_CERTIFICATE_P12_BASE64?.trim();
  if (base64) return Buffer.from(base64, "base64");

  const certificatePath = process.env.EFI_CERTIFICATE_PATH_PRODUCAO?.trim();
  if (!certificatePath) {
    throw new Error(
      "Configure EFI_CERTIFICATE_PATH_PRODUCAO ou EFI_CERTIFICATE_P12_BASE64",
    );
  }

  return readFileSync(certificatePath);
}

function requestJson(
  url: URL,
  options: {
    method?: "GET" | "POST";
    token?: string;
    body?: string;
    basicAuth?: string;
  },
): Promise<unknown> {
  const certificate = certificateBuffer();

  return new Promise((resolve, reject) => {
    const headers: Record<string, string | number> = {
      Accept: "application/json",
      "Accept-Encoding": "identity",
    };

    if (options.token) headers.Authorization = `Bearer ${options.token}`;
    if (options.basicAuth) headers.Authorization = `Basic ${options.basicAuth}`;
    if (options.body) {
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = Buffer.byteLength(options.body);
    }

    const request = https.request(
      url,
      {
        method: options.method ?? "GET",
        pfx: certificate,
        passphrase: "",
        headers,
        timeout: 20_000,
      },
      (response) => {
        let raw = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          raw += chunk;
        });
        response.on("end", () => {
          let parsed: unknown = null;
          try {
            parsed = raw ? JSON.parse(raw) : null;
          } catch {
            parsed = raw;
          }

          if (
            response.statusCode === undefined ||
            response.statusCode < 200 ||
            response.statusCode >= 300
          ) {
            const detail = asRecord(parsed);
            const message =
              asString(detail.detail) ??
              asString(detail.mensagem) ??
              asString(detail.error_description) ??
              `Efí respondeu HTTP ${response.statusCode ?? "desconhecido"}`;
            reject(new Error(message));
            return;
          }

          resolve(parsed);
        });
      },
    );

    request.on("timeout", () => {
      request.destroy(new Error("Tempo limite excedido ao consultar o Éfi"));
    });
    request.on("error", reject);
    if (options.body) request.write(options.body);
    request.end();
  });
}

async function authorize(): Promise<string> {
  const clientId = process.env.EFI_CLIENT_ID_PRODUCAO?.trim();
  const secret = process.env.EFI_SECRET_KEY_PRODUCAO?.trim();
  if (!clientId || !secret) {
    throw new Error("Credenciais de produção do Éfi não configuradas");
  }

  const body = JSON.stringify({ grant_type: "client_credentials" });
  const basicAuth = Buffer.from(`${clientId}:${secret}`).toString("base64");
  const response = asRecord(
    await requestJson(new URL(`${PIX_BASE_URL}/oauth/token`), {
      method: "POST",
      basicAuth,
      body,
    }),
  );

  const accessToken = asString(response.access_token);
  if (!accessToken) throw new Error("O Éfi não retornou token de acesso");
  return accessToken;
}

async function fetchPaginatedPix(
  token: string,
  route: string,
  arrayKey: string,
  start: Date,
  end: Date,
): Promise<JsonRecord[]> {
  const items: JsonRecord[] = [];
  let page = 0;
  let pageCount = 1;

  do {
    const url = new URL(`${PIX_BASE_URL}${route}`);
    url.searchParams.set("inicio", start.toISOString());
    url.searchParams.set("fim", end.toISOString());
    url.searchParams.set("paginacao.paginaAtual", String(page));
    url.searchParams.set("paginacao.itensPorPagina", "100");

    const response = asRecord(await requestJson(url, { token }));
    const pageItems = Array.isArray(response[arrayKey])
      ? (response[arrayKey] as unknown[]).map(asRecord)
      : [];
    items.push(...pageItems);

    const pagination = asRecord(asRecord(response.parametros).paginacao);
    pageCount = Math.max(1, Math.min(50, asNumber(pagination.quantidadeDePaginas)));
    page += 1;
  } while (page < pageCount);

  return items;
}

function normalizeDate(record: JsonRecord): Date {
  const horario = record.horario;
  const candidate =
    asString(horario) ??
    asString(asRecord(horario).solicitacao) ??
    asString(asRecord(horario).liquidacao) ??
    asString(record.data);
  const parsed = candidate ? new Date(candidate) : new Date();
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function normalizeTransaction(
  record: JsonRecord,
  direction: "CREDIT" | "DEBIT",
): NormalizedBankTransaction {
  const endToEndId = asString(record.endToEndId);
  const txid = asString(record.txid);
  const idEnvio = asString(record.idEnvio);
  const rawHash = createHash("sha256")
    .update(JSON.stringify(record))
    .digest("hex");
  const stableId = endToEndId ?? idEnvio ?? txid ?? rawHash;
  const isCredit = direction === "CREDIT";
  const counterpartyName = isCredit
    ? nestedString(record, "pagador", "nome")
    : nestedString(record, "favorecido", "nome");

  return {
    externalId: `${isCredit ? "received" : "sent"}:${stableId}`,
    endToEndId,
    txid,
    direction,
    transactionType: isCredit ? "PIX_RECEIVED" : "PIX_SENT",
    amount: Math.abs(asNumber(record.valor)),
    description: isCredit ? "Pix recebido" : "Pix enviado",
    counterpartyName,
    occurredAt: normalizeDate(record),
    rawHash,
  };
}

export async function fetchEfiFinancialSnapshot(
  requestedDays: number,
): Promise<EfiFinancialSnapshot> {
  const days = Math.max(1, Math.min(365, Math.trunc(requestedDays)));
  const capturedAt = new Date();
  const periodEnd = capturedAt;
  const periodStart = new Date(
    capturedAt.getTime() - days * 24 * 60 * 60 * 1000,
  );
  const token = await authorize();

  const [balanceResponse, received, sent] = await Promise.all([
    requestJson(new URL(`${PIX_BASE_URL}/v2/gn/saldo?bloqueios=true`), {
      token,
    }),
    fetchPaginatedPix(token, "/v2/pix", "pix", periodStart, periodEnd),
    fetchPaginatedPix(
      token,
      "/v2/gn/pix/enviados",
      "pix",
      periodStart,
      periodEnd,
    ),
  ]);

  const balance = asRecord(balanceResponse);
  const blocks = asRecord(balance.bloqueios);

  return {
    capturedAt,
    periodStart,
    periodEnd,
    balance: {
      available: asNumber(balance.saldo),
      blockedTotal:
        blocks.total === undefined ? null : asNumber(blocks.total),
      blockedJudicial:
        blocks.judicial === undefined ? null : asNumber(blocks.judicial),
      blockedMed: blocks.med === undefined ? null : asNumber(blocks.med),
    },
    transactions: [
      ...received.map((item) => normalizeTransaction(item, "CREDIT")),
      ...sent.map((item) => normalizeTransaction(item, "DEBIT")),
    ],
  };
}

import { createHash } from "crypto";
import { readFileSync } from "fs";
import https from "https";

const PIX_BASE_URL = "https://pix.api.efipay.com.br";

export type JsonRecord = Record<string, unknown>;

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

/** Chave aleatória (EVP) do Pix: 36 caracteres no formato UUID. */
const CHAVE_ALEATORIA = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Quem está do outro lado da movimentação.
 *
 * As duas pontas do Pix não são simétricas na API do Éfi, e a diferença é o
 * motivo de a conciliação viver cheia de "Não informado":
 *
 * **Enviado** (`/v2/gn/pix/enviados`) — o nome vem, mas dois níveis abaixo, em
 * `favorecido.identificacao.nome`, ao lado do CPF/CNPJ. Ler `favorecido.nome`
 * devolve `undefined` em 100% dos registros.
 *
 * **Recebido** (`/v2/pix`) — o Éfi devolve só `endToEndId`, `valor`, `chave`
 * (a NOSSA chave, a que recebeu) e `horario`. Não existe `pagador` na resposta,
 * o detalhe em `/v2/pix/{e2e}` traz os mesmos campos, e `/v2/gn/pix/{e2e}` não
 * existe (404). Pix recebido fora de cobrança simplesmente não identifica o
 * pagador — e é por isso que aqui não há fallback nenhum a tentar.
 */
function counterpartyName(record: JsonRecord, isCredit: boolean): string | null {
  if (isCredit) {
    // Mantido para o dia em que o Éfi passar a devolver, e para Pix vindo de
    // cobrança, onde o objeto existe.
    return nestedString(record, "pagador", "nome");
  }

  const favorecido = asRecord(record.favorecido);
  const nome =
    asString(asRecord(favorecido.identificacao).nome) ??
    // Formato antigo da API, caso algum registro anterior ainda apareça.
    asString(favorecido.nome);
  if (nome) return nome;

  // Sem nome, a chave ainda diz algo — telefone, e-mail e CPF são
  // reconhecíveis. Chave aleatória não identifica ninguém e vira ruído.
  const chave = asString(favorecido.chave);
  return chave && !CHAVE_ALEATORIA.test(chave) ? chave : null;
}

/** Limite do texto livre na descrição: o suficiente para reconhecer a origem. */
const LIMITE_INFO_PAGADOR = 80;

/**
 * Descrição da movimentação com o texto livre do Pix, quando existe.
 *
 * `infoPagador` é o que a pessoa digita ao pagar ("pgto redes sociais", ou o
 * próprio nome). Não é o nome do pagador e não pode ocupar a coluna de
 * origem/destino — mas, em Pix recebido, é a única pista que chega, e quem
 * concilia precisa dela na tela.
 */
function describeTransaction(record: JsonRecord, isCredit: boolean): string {
  const base = isCredit ? "Pix recebido" : "Pix enviado";
  const info = asString(record.infoPagador);
  if (!info) return base;

  const cortado =
    info.length > LIMITE_INFO_PAGADOR
      ? `${info.slice(0, LIMITE_INFO_PAGADOR - 1)}…`
      : info;

  return `${base} · ${cortado}`;
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

/**
 * Exportada para teste: é aqui que mora a diferença de formato entre as duas
 * pontas do Pix, e foi ela que deixou a conciliação inteira sem nome.
 */
export function normalizeTransaction(
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

  return {
    externalId: `${isCredit ? "received" : "sent"}:${stableId}`,
    endToEndId,
    txid,
    direction,
    transactionType: isCredit ? "PIX_RECEIVED" : "PIX_SENT",
    amount: Math.abs(asNumber(record.valor)),
    description: describeTransaction(record, isCredit),
    counterpartyName: counterpartyName(record, isCredit),
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

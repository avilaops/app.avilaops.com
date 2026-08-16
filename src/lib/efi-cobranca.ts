import { readFileSync } from "fs";
import https from "https";

const PIX_BASE_URL = "https://pix.api.efipay.com.br";
const COBRANCAS_BASE_URL = "https://cobrancas.api.efipay.com.br";

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function certificateBuffer(): Buffer {
  const base64 = process.env.EFI_CERTIFICATE_P12_BASE64?.trim();
  if (base64) return Buffer.from(base64, "base64");

  const certificatePath = process.env.EFI_CERTIFICATE_PATH_PRODUCAO?.trim();
  if (!certificatePath) {
    throw new Error("Configure EFI_CERTIFICATE_PATH_PRODUCAO ou EFI_CERTIFICATE_P12_BASE64");
  }
  return readFileSync(certificatePath);
}

function requestJson(
  url: URL,
  options: {
    method?: "GET" | "POST" | "PUT";
    token?: string;
    body?: string;
    basicAuth?: string;
    pfx?: Buffer;
  },
): Promise<unknown> {
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
        pfx: options.pfx,
        passphrase: options.pfx ? "" : undefined,
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
      request.destroy(new Error("Tempo limite excedido ao chamar o Efí"));
    });
    request.on("error", reject);
    if (options.body) request.write(options.body);
    request.end();
  });
}

async function authorizePix(): Promise<string> {
  const clientId = process.env.EFI_CLIENT_ID_PRODUCAO?.trim();
  const secret = process.env.EFI_SECRET_KEY_PRODUCAO?.trim();
  if (!clientId || !secret) {
    throw new Error("Credenciais de produção do Efí (PIX) não configuradas");
  }

  const basicAuth = Buffer.from(`${clientId}:${secret}`).toString("base64");
  const response = asRecord(
    await requestJson(new URL(`${PIX_BASE_URL}/oauth/token`), {
      method: "POST",
      basicAuth,
      body: JSON.stringify({ grant_type: "client_credentials" }),
      pfx: certificateBuffer(),
    }),
  );

  const accessToken = asString(response.access_token);
  if (!accessToken) throw new Error("O Efí não retornou token de acesso (PIX)");
  return accessToken;
}

async function authorizeCobrancas(): Promise<string> {
  const clientId = process.env.EFI_COBRANCA_CLIENT_ID?.trim();
  const secret = process.env.EFI_COBRANCA_CLIENT_SECRET?.trim();
  if (!clientId || !secret) {
    throw new Error(
      "Credenciais da aplicação de Cobranças do Efí não configuradas (EFI_COBRANCA_CLIENT_ID/EFI_COBRANCA_CLIENT_SECRET)",
    );
  }

  const basicAuth = Buffer.from(`${clientId}:${secret}`).toString("base64");
  const response = asRecord(
    await requestJson(new URL(`${COBRANCAS_BASE_URL}/v1/authorize`), {
      method: "POST",
      basicAuth,
      body: JSON.stringify({ grant_type: "client_credentials" }),
    }),
  );

  const accessToken = asString(response.access_token);
  if (!accessToken) throw new Error("O Efí não retornou token de acesso (Cobranças)");
  return accessToken;
}

export type PixCharge = {
  externalId: string;
  status: string;
  copyPaste: string;
  qrCodeBase64: string;
  expiresAt: Date;
};

export async function createPixCharge(input: {
  amount: number;
  description: string;
  expiresInSeconds?: number;
}): Promise<PixCharge> {
  const pixKey = process.env.EFI_PIX_KEY?.trim();
  if (!pixKey) throw new Error("Configure EFI_PIX_KEY (chave PIX usada para receber)");

  const token = await authorizePix();
  const expiracao = input.expiresInSeconds ?? 3600;

  const cobranca = asRecord(
    await requestJson(new URL(`${PIX_BASE_URL}/v2/cob`), {
      method: "POST",
      token,
      pfx: certificateBuffer(),
      body: JSON.stringify({
        calendario: { expiracao },
        valor: { original: input.amount.toFixed(2) },
        chave: pixKey,
        solicitacaoPagador: input.description.slice(0, 140),
      }),
    }),
  );

  const txid = asString(cobranca.txid);
  const locId = asString(asRecord(cobranca.loc).id) ?? String(asRecord(cobranca.loc).id ?? "");
  if (!txid || !locId) throw new Error("Resposta inesperada do Efí ao criar a cobrança PIX");

  const qrcode = asRecord(
    await requestJson(new URL(`${PIX_BASE_URL}/v2/loc/${locId}/qrcode`), {
      token,
      pfx: certificateBuffer(),
    }),
  );

  const copyPaste = asString(qrcode.qrcode);
  const qrCodeBase64 = asString(qrcode.imagemQrcode);
  if (!copyPaste || !qrCodeBase64) {
    throw new Error("Efí não retornou o QR Code da cobrança PIX");
  }

  return {
    externalId: txid,
    status: "PENDING",
    copyPaste,
    qrCodeBase64,
    expiresAt: new Date(Date.now() + expiracao * 1000),
  };
}

export type BoletoCharge = {
  externalId: string;
  status: string;
  boletoUrl: string;
  barcode: string;
  expiresAt: Date;
};

/**
 * Pagador da Efí.
 *
 * A empresa NÃO substitui a pessoa: quando quem paga é CNPJ, a Efí ainda exige
 * um titular pessoa física, e o CNPJ entra como `juridical_person` ao lado.
 * Mandar só o CNPJ devolve 400 sem explicar isso.
 */
export type EfiPayer = {
  name: string;
  cpf: string;
  email: string;
  company?: { cnpj: string; corporateName: string };
};

function customerPayload(payer: EfiPayer): JsonRecord {
  const customer: JsonRecord = {
    name: payer.name,
    cpf: payer.cpf.replace(/\D/g, ""),
    email: payer.email,
  };

  if (payer.company) {
    customer.juridical_person = {
      corporate_name: payer.company.corporateName,
      cnpj: payer.company.cnpj.replace(/\D/g, ""),
    };
  }

  return customer;
}

export async function createBoletoCharge(input: {
  amountCents: number;
  description: string;
  expireInDays?: number;
  payer: EfiPayer;
}): Promise<BoletoCharge> {
  const token = await authorizeCobrancas();
  const expireInDays = input.expireInDays ?? 3;
  const expireAt = new Date(Date.now() + expireInDays * 24 * 60 * 60 * 1000);

  const response = asRecord(
    await requestJson(new URL(`${COBRANCAS_BASE_URL}/v1/charge/one-step`), {
      method: "POST",
      token,
      body: JSON.stringify({
        items: [{ name: input.description.slice(0, 255), value: input.amountCents, amount: 1 }],
        payment: {
          banking_billet: {
            expire_at: expireAt.toISOString().slice(0, 10),
            customer: customerPayload(input.payer),
          },
        },
      }),
    }),
  );

  const data = asRecord(response.data);
  const chargeId = data.charge_id;
  const pdf = asRecord(data.pdf);
  const boletoUrl = asString(pdf.charge);
  const barcode = asString(data.barcode);
  if (chargeId === undefined || !boletoUrl || !barcode) {
    throw new Error("Efí não retornou os dados do boleto");
  }

  return {
    externalId: String(chargeId),
    status: "PENDING",
    boletoUrl,
    barcode,
    expiresAt: expireAt,
  };
}

export async function getCobrancaChargeStatus(chargeId: string): Promise<string> {
  const token = await authorizeCobrancas();
  const response = asRecord(
    await requestJson(new URL(`${COBRANCAS_BASE_URL}/v1/charge/${chargeId}`), { token }),
  );
  const data = asRecord(response.data);
  return asString(data.status) ?? "PENDING";
}

/**
 * Cartão exige tokenização no navegador com o Efí.js antes desta chamada
 * (o número do cartão nunca deve chegar ao backend). `paymentToken` é o
 * token retornado pelo Efí.js no cliente.
 */
export async function createCardCharge(input: {
  amountCents: number;
  description: string;
  installments: number;
  paymentToken: string;
  payer: EfiPayer;
}): Promise<{ externalId: string; status: string }> {
  const token = await authorizeCobrancas();

  const response = asRecord(
    await requestJson(new URL(`${COBRANCAS_BASE_URL}/v1/charge/one-step`), {
      method: "POST",
      token,
      body: JSON.stringify({
        items: [{ name: input.description.slice(0, 255), value: input.amountCents, amount: 1 }],
        payment: {
          credit_card: {
            installments: input.installments,
            payment_token: input.paymentToken,
            customer: customerPayload(input.payer),
          },
        },
      }),
    }),
  );

  const data = asRecord(response.data);
  const chargeId = data.charge_id;
  const status = asString(data.status) ?? "PENDING";
  if (chargeId === undefined) throw new Error("Efí não retornou o identificador da cobrança");

  return { externalId: String(chargeId), status };
}

const API_BASE = "https://api.cloudflare.com/client/v4";

// O CLOUDFLARE_TOKEN (escopo restrito) não tem leitura de DNS em todas as
// zonas — só nas que foram explicitamente escopadas antes. A sincronização
// de domínios precisa ver todas as zonas da conta por definição, então usa a
// chave global aqui (somente leitura: list zones / list dns_records).
function authHeaders(): HeadersInit {
  const email = process.env.CLOUDFLARE_EMAIL;
  const globalKey = process.env.CLOUDFLARE_API_GLOBAL_KEY;
  if (email && globalKey) {
    return { "X-Auth-Email": email, "X-Auth-Key": globalKey };
  }

  const token = process.env.CLOUDFLARE_TOKEN;
  if (!token) {
    throw new Error("Nenhuma credencial do Cloudflare configurada (CLOUDFLARE_API_GLOBAL_KEY+CLOUDFLARE_EMAIL ou CLOUDFLARE_TOKEN)");
  }
  return { Authorization: `Bearer ${token}` };
}

async function cfFetch<T>(path: string, init?: RequestInit): Promise<T> {
  // FormData monta o próprio Content-Type com a fronteira; declarar JSON por
  // cima quebraria o upload do Worker.
  const ehFormulario = typeof FormData !== "undefined" && init?.body instanceof FormData;
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...authHeaders(),
      ...(init?.body && !ehFormulario ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const data = await response.json();
  if (!data.success) {
    throw new Error(`Cloudflare API falhou em ${path}: ${JSON.stringify(data.errors)}`);
  }
  return data;
}

export type CloudflareZone = {
  id: string;
  name: string;
  status: string;
  plan: { name: string };
};

export type CloudflareDnsRecord = {
  id: string;
  type: string;
  name: string;
  content: string;
  proxied: boolean;
  ttl: number;
  priority?: number;
};

export async function listZones(): Promise<CloudflareZone[]> {
  const zones: CloudflareZone[] = [];
  let page = 1;

  for (;;) {
    const data = await cfFetch<{
      result: CloudflareZone[];
      result_info: { page: number; total_pages: number };
    }>(`/zones?per_page=50&page=${page}`);

    zones.push(...data.result);
    if (page >= data.result_info.total_pages) break;
    page += 1;
  }

  return zones;
}

export async function listDnsRecords(zoneId: string): Promise<CloudflareDnsRecord[]> {
  const records: CloudflareDnsRecord[] = [];
  let page = 1;

  for (;;) {
    const data = await cfFetch<{
      result: CloudflareDnsRecord[];
      result_info: { page: number; total_pages: number };
    }>(`/zones/${zoneId}/dns_records?per_page=100&page=${page}`);

    records.push(...data.result);
    if (page >= data.result_info.total_pages) break;
    page += 1;
  }

  return records;
}

export async function createTxtRecord(zoneId: string, name: string, content: string) {
  const data = await cfFetch<{ result: CloudflareDnsRecord }>(
    `/zones/${zoneId}/dns_records`,
    {
      method: "POST",
      body: JSON.stringify({
        type: "TXT",
        name,
        content,
        ttl: 60,
        proxied: false,
      }),
    },
  );

  return data.result;
}

/* ---------------------------------------------------------------------------
   Workers: o que publica os arquivos da entrega na borda.

   Exige um token com "Workers Scripts:Edit" na conta e "Workers Routes:Edit"
   na zona — a chave global de leitura que a sincronização de domínios usa não
   basta. Sem `CLOUDFLARE_ACCOUNT_ID` não há onde publicar o script.
   --------------------------------------------------------------------------- */

export type RotaWorker = { id: string; pattern: string; script: string };

function contaOuErro(): string {
  const conta = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!conta) {
    throw new Error(
      "CLOUDFLARE_ACCOUNT_ID não configurado: sem conta não há onde publicar o Worker.",
    );
  }
  return conta;
}

/** Sobe (ou substitui) o script do Worker na conta. */
export async function publicarScriptWorker(nome: string, fonte: string): Promise<void> {
  const conta = contaOuErro();
  const corpo = new FormData();
  corpo.append(
    "metadata",
    new Blob(
      [
        JSON.stringify({
          main_module: "worker.js",
          // Data fixa: a semântica do runtime não pode mudar sozinha embaixo
          // de um script que serve site de cliente.
          compatibility_date: "2026-09-01",
        }),
      ],
      { type: "application/json" },
    ),
  );
  corpo.append(
    "worker.js",
    new Blob([fonte], { type: "application/javascript+module" }),
    "worker.js",
  );

  await cfFetch(`/accounts/${conta}/workers/scripts/${encodeURIComponent(nome)}`, {
    method: "PUT",
    body: corpo,
  });
}

export async function listarRotasWorker(zoneId: string): Promise<RotaWorker[]> {
  const data = await cfFetch<{ result: RotaWorker[] }>(`/zones/${zoneId}/workers/routes`);
  return data.result ?? [];
}

export async function criarRotaWorker(
  zoneId: string,
  pattern: string,
  script: string,
): Promise<RotaWorker> {
  const data = await cfFetch<{ result: RotaWorker }>(`/zones/${zoneId}/workers/routes`, {
    method: "POST",
    body: JSON.stringify({ pattern, script }),
  });
  return data.result;
}

export async function apagarRotaWorker(zoneId: string, rotaId: string): Promise<void> {
  await cfFetch(`/zones/${zoneId}/workers/routes/${rotaId}`, { method: "DELETE" });
}

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
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...authHeaders(),
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
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

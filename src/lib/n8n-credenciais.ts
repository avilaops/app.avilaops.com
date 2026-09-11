/**
 * Cofre do n8n visto do painel.
 *
 * A tela do n8n corta o formulário de credencial no celular, e o Nicolas
 * opera 90% do tempo pelo iPhone. Esta ponte usa a API REST do n8n para fazer
 * o que a tela faria: listar as credenciais que os fluxos usam (existam ou
 * não), criar ou trocar o valor de uma, e religar todo nó que apontava para o
 * id antigo. É a mesma lógica do script que recriou 13 credenciais em
 * 11/09/2026, só que com tela.
 *
 * Só OWNER chega aqui (rota e página): é segredo de terceiro.
 */

const BASE = (process.env.N8N_API_BASE ?? "https://n8n.avilaops.com/api/v1").replace(/\/+$/, "");

export class N8nApiIndisponivel extends Error {}

export function n8nApiConfigurada() {
  return Boolean(process.env.N8N_API_KEY?.trim());
}

async function api<T>(caminho: string, metodo = "GET", corpo?: unknown): Promise<T> {
  const chave = process.env.N8N_API_KEY?.trim();
  if (!chave) throw new N8nApiIndisponivel("N8N_API_KEY não configurada no servidor.");
  const resposta = await fetch(`${BASE}/${caminho.replace(/^\/+/, "")}`, {
    method: metodo,
    headers: { "content-type": "application/json", "x-n8n-api-key": chave },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
    cache: "no-store",
  });
  if (!resposta.ok) {
    const texto = (await resposta.text()).slice(0, 300);
    throw new N8nApiIndisponivel(`n8n ${metodo} ${caminho} respondeu ${resposta.status}: ${texto}`);
  }
  return (await resposta.json()) as T;
}

type CredencialN8n = { id: string; name: string; type: string };
type NoN8n = { name: string; type: string; parameters?: Record<string, unknown>; credentials?: Record<string, { id: string; name: string }> };
type FluxoN8n = { id: string; name: string; active: boolean; nodes: NoN8n[]; connections: unknown; settings?: Record<string, unknown> };

/**
 * Campos que a tela pede por tipo. O que não está aqui é OAuth ou tipo raro:
 * a tela manda para o n8n.
 */
export const TIPOS_EDITAVEIS: Record<string, { rotulo: string; campos: Array<{ nome: string; rotulo: string; ajuda?: string; longo?: boolean }> }> = {
  httpHeaderAuth: {
    rotulo: "Cabeçalho HTTP",
    campos: [
      { nome: "name", rotulo: "Nome do cabeçalho", ajuda: "Ex.: authorization, x-api-key, x-admin-token" },
      { nome: "value", rotulo: "Valor", ajuda: "Se for Bearer, inclua a palavra: Bearer abc123", longo: true },
    ],
  },
  httpBearerAuth: { rotulo: "Bearer", campos: [{ nome: "token", rotulo: "Token", longo: true }] },
  httpCustomAuth: {
    rotulo: "Autenticação personalizada",
    campos: [{ nome: "json", rotulo: "JSON", ajuda: 'Ex.: {"headers":{"X-Auth-Key":"..."}}', longo: true }],
  },
  openAiApi: { rotulo: "OpenAI", campos: [{ nome: "apiKey", rotulo: "Chave da API (sk-…)", longo: true }] },
  groqApi: { rotulo: "Groq", campos: [{ nome: "apiKey", rotulo: "Chave da API (gsk_…)", longo: true }] },
  githubApi: { rotulo: "GitHub", campos: [{ nome: "accessToken", rotulo: "Token de acesso (ghp_… ou github_pat_…)", longo: true }] },
  todoistApi: { rotulo: "Todoist (token)", campos: [{ nome: "apiKey", rotulo: "Token da API", longo: true }] },
  n8nApi: { rotulo: "API do n8n", campos: [{ nome: "apiKey", rotulo: "Chave da API", longo: true }] },
};

/** Valores fixos que a tela não precisa pedir. */
const COMPLEMENTOS: Record<string, Record<string, unknown>> = {
  githubApi: { server: "https://api.github.com", user: "avilaops" },
  n8nApi: { baseUrl: BASE },
};

export type SituacaoCredencial = {
  id: string;
  nome: string;
  tipo: string;
  tipoRotulo: string;
  existe: boolean;
  editavel: boolean;
  oauth: boolean;
  nos: number;
  fluxos: string[];
  fluxosAtivos: number;
};

export async function listarSituacao(): Promise<SituacaoCredencial[]> {
  const [creds, fluxos] = await Promise.all([
    api<{ data: CredencialN8n[] }>("/credentials?limit=250"),
    api<{ data: FluxoN8n[] }>("/workflows?limit=250"),
  ]);
  const existentes = new Map(creds.data.map((c) => [c.id, c]));
  const uso = new Map<string, SituacaoCredencial>();

  for (const f of fluxos.data) {
    for (const n of f.nodes) {
      for (const [tipo, c] of Object.entries(n.credentials ?? {})) {
        const atual = uso.get(c.id) ?? {
          id: c.id,
          nome: existentes.get(c.id)?.name ?? c.name,
          tipo,
          tipoRotulo: TIPOS_EDITAVEIS[tipo]?.rotulo ?? tipo,
          existe: existentes.has(c.id),
          editavel: tipo in TIPOS_EDITAVEIS,
          oauth: /oauth/i.test(tipo),
          nos: 0,
          fluxos: [],
          fluxosAtivos: 0,
        };
        atual.nos += 1;
        if (!atual.fluxos.includes(f.name)) {
          atual.fluxos.push(f.name);
          if (f.active) atual.fluxosAtivos += 1;
        }
        uso.set(c.id, atual);
      }
    }
  }

  // Credencial que existe mas ninguém usa também aparece: dá para ver o que
  // sobrou e o que já está pronto para ligar.
  for (const c of creds.data) {
    if (!uso.has(c.id)) {
      uso.set(c.id, {
        id: c.id, nome: c.name, tipo: c.type, tipoRotulo: TIPOS_EDITAVEIS[c.type]?.rotulo ?? c.type,
        existe: true, editavel: c.type in TIPOS_EDITAVEIS, oauth: /oauth/i.test(c.type), nos: 0, fluxos: [], fluxosAtivos: 0,
      });
    }
  }

  return [...uso.values()].sort((a, b) => Number(a.existe) - Number(b.existe) || b.nos - a.nos || a.nome.localeCompare(b.nome));
}

/**
 * Cria (ou troca o valor de) uma credencial e religa os nós.
 *
 * Quando a credencial já existe, o n8n aceita PATCH e os fluxos não mudam.
 * Quando não existe (id morto da restauração), nasce uma nova com outro id e
 * todo nó que apontava para o morto passa a apontar para ela — fluxo por
 * fluxo, preservando as credenciais dos outros nós.
 */
export async function salvarCredencial(entrada: { id: string; nome: string; tipo: string; dados: Record<string, string> }) {
  const tipo = TIPOS_EDITAVEIS[entrada.tipo];
  if (!tipo) throw new Error(`Tipo ${entrada.tipo} não é editável por aqui.`);
  const dados: Record<string, unknown> = { ...(COMPLEMENTOS[entrada.tipo] ?? {}) };
  for (const campo of tipo.campos) {
    const valor = (entrada.dados[campo.nome] ?? "").trim();
    if (!valor) throw new Error(`Preencha "${campo.rotulo}".`);
    dados[campo.nome] = valor;
  }
  if (entrada.tipo === "httpCustomAuth") {
    try { JSON.parse(String(dados.json)); } catch { throw new Error("O JSON da autenticação personalizada é inválido."); }
  }

  const existentes = await api<{ data: CredencialN8n[] }>("/credentials?limit=250");
  const existe = existentes.data.some((c) => c.id === entrada.id);

  if (existe) {
    await api(`/credentials/${entrada.id}`, "PATCH", { name: entrada.nome, type: entrada.tipo, data: dados });
    return { id: entrada.id, religados: 0, fluxos: 0 };
  }

  const nova = await api<CredencialN8n>("/credentials", "POST", { name: entrada.nome, type: entrada.tipo, data: dados });
  const fluxos = await api<{ data: FluxoN8n[] }>("/workflows?limit=250");
  let religados = 0;
  let fluxosTocados = 0;

  for (const resumo of fluxos.data) {
    const usa = resumo.nodes.some((n) => Object.values(n.credentials ?? {}).some((c) => c.id === entrada.id));
    if (!usa) continue;
    const completo = await api<FluxoN8n>(`/workflows/${resumo.id}`);
    let mudou = 0;
    for (const n of completo.nodes) {
      for (const [t, c] of Object.entries(n.credentials ?? {})) {
        if (c.id === entrada.id) {
          n.credentials![t] = { id: nova.id, name: entrada.nome };
          mudou += 1;
        }
      }
    }
    if (!mudou) continue;
    const salvo = await api<FluxoN8n>(`/workflows/${resumo.id}`, "PUT", {
      name: completo.name, nodes: completo.nodes, connections: completo.connections, settings: completo.settings ?? {},
    });
    if (completo.active && !salvo.active) await api(`/workflows/${resumo.id}/activate`, "POST");
    religados += mudou;
    fluxosTocados += 1;
  }

  return { id: nova.id, religados, fluxos: fluxosTocados };
}

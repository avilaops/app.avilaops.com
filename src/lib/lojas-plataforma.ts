/**
 * Cliente da API administrativa do lojas.avilaops.com.
 *
 * A regra de ouro deste módulo: **a plataforma de lojas é dona do estado do
 * negócio** (qual loja, qual plano, se está no ar) e o Mercado Pago é dono do
 * estado do dinheiro. O admin daqui lê os dois e cruza — mas nunca guarda
 * cópia de nenhum, e nunca decide sozinho.
 *
 * Por isso toda ação destrutiva (cancelar, pausar, reajustar) vai para a
 * plataforma em vez de ir direto ao Mercado Pago: só ela sabe suspender a
 * loja, gravar o histórico e avisar o lojista no mesmo movimento. Mexer no MP
 * pela porta dos fundos deixaria os dois lados discordando até a varredura do
 * dia seguinte.
 */
const BASE = (process.env.LOJAS_API_URL ?? "https://lojas.avilaops.com").replace(/\/+$/, "");

export class PlataformaIndisponivel extends Error {}

function token(): string {
  const t = process.env.LOJAS_ADMIN_TOKEN ?? "";
  if (!t) throw new PlataformaIndisponivel("LOJAS_ADMIN_TOKEN não configurado neste ambiente.");
  return t;
}

async function chamar<T>(caminho: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const r = await fetch(BASE + caminho, {
    method: init.method ?? "GET",
    headers: { authorization: `Bearer ${token()}`, "content-type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });
  const texto = await r.text();
  let dados: unknown = null;
  try {
    dados = texto ? JSON.parse(texto) : null;
  } catch {
    dados = texto;
  }
  if (!r.ok) {
    const msg =
      dados && typeof dados === "object" && "erro" in dados
        ? String((dados as { erro?: unknown }).erro)
        : `lojas.avilaops.com respondeu ${r.status}`;
    throw new Error(msg);
  }
  return dados as T;
}

export interface LojaDaPlataforma {
  slug: string;
  nome: string;
  plano: "SITE" | "LOJA" | "LOJA_PRO";
  status: "PROVISIONANDO" | "ATIVA" | "SUSPENSA" | "CANCELADA";
  dominioPrincipal: string | null;
  criadoEm: string;
  assinaturaId: string | null;
  assinaturaStatus: string;
  ultimoPagamentoEm: string | null;
  setupPagoEm: string | null;
  suspensaEm: string | null;
  tentativasFalhas: number;
  loginEmail: string | null;
  emailContato: string | null;
  whatsapp: string | null;
  _count: { produtos: number; pedidos: number };
}

export const listarLojas = () => chamar<LojaDaPlataforma[]>("/api/admin/tenants");

export type AcaoAssinatura =
  | { acao: "cancelar" }
  | { acao: "pausar" }
  | { acao: "retomar" }
  | { acao: "valor"; centavos: number };

export const agirNaAssinatura = (slug: string, acao: AcaoAssinatura) =>
  chamar<{ slug: string; status: string; assinaturaStatus: string }>(
    `/api/admin/tenants/${encodeURIComponent(slug)}/assinatura`,
    { method: "POST", body: acao },
  );

/** Roda a varredura de inadimplência agora, em vez de esperar as 6h da manhã. */
export const rodarVarreduraDeCobranca = () =>
  chamar<{ suspensas: string[]; sincronizadas: number; faturasNovas: number }>("/api/admin/cobranca/verificar", {
    method: "POST",
  });

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * A lista de mensalidades montada de verdade, com o painel dublado.
 *
 * Protege o que o dono perguntou ao ver a tela em 08/10/2026: "onde estão as
 * opções de editar, excluir ou incluir?". Loja sem assinatura não oferecia
 * nada, e assinatura de teste cancelada dividia a lista com cliente de verdade.
 */
vi.mock("@/lib/auth", () => ({
  getAdmin: async () => ({ id: "1", nome: "Nicolas Avila", role: "OWNER", email: "nicolas@avilaops.com" }),
  ehDono: (role: string) => role === "OWNER",
}));
vi.mock("next/navigation", () => ({
  redirect: () => undefined,
  useRouter: () => ({ refresh: () => undefined }),
  usePathname: () => "/financeiro/mercadopago",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/AppShell", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/lib/mercadopago", () => ({ linkDoPagamento: (id: number) => `https://mp.exemplo/${id}` }));

const loja = (extra: Record<string, unknown>) => ({
  slug: "loja", nome: "Loja", plano: "LOJA", status: "ATIVA", dominioPrincipal: null, criadoEm: "2026-09-01T00:00:00Z",
  assinaturaId: null, assinaturaStatus: "NENHUMA", ultimoPagamentoEm: null, setupPagoEm: null, suspensaEm: null,
  tentativasFalhas: 0, loginEmail: "dono@loja.test", emailContato: null, whatsapp: null, _count: { produtos: 1, pedidos: 0 },
  ...extra,
});
const mp = (extra: Record<string, unknown>) => ({
  id: "mp-1", loja: "ref", status: "authorized", motivo: "Avila Ops · Loja", pagador: null, valorCentavos: 26900,
  criadaEm: "2026-09-01T00:00:00Z", proximaCobranca: "2026-11-01T00:00:00Z", linkCadastroCartao: null,
  ...extra,
});

vi.mock("@/lib/mercadopago-painel", () => ({
  WEBHOOK_ESPERADO: "https://lojas.avilaops.com/api/webhooks/mercadopago-assinatura",
  montarPainel: async () => ({
    configurado: true,
    conta: { apelido: "AVILAOPS", id: 1, email: "financeiro@avilaops.com", pais: "MLB", tipo: "normal" },
    webhook: null,
    saudeWebhook: null,
    pagamentos: [],
    falhas: [],
    receitaMensalCentavos: 26900,
    linhas: [
      { mp: null, loja: loja({ slug: "brilhax", nome: "Brilhax" }), divergencias: [] },
      { mp: null, loja: loja({ slug: "pkvedacoes", nome: "PK Vedações", plano: "LOJA_PRO", cobrancaIsenta: true }), divergencias: [] },
      { mp: null, loja: loja({ slug: "sandro", nome: "Sandro Motos", status: "CANCELADA" }), divergencias: [] },
      { mp: mp({ id: "mp-ativa" }), loja: loja({ slug: "vedashow", nome: "Vedashow", assinaturaId: "mp-ativa", assinaturaStatus: "AUTORIZADA" }), divergencias: [] },
      { mp: mp({ id: "mp-teste", status: "cancelled", motivo: "Avila Ops · teste webhook" }), loja: null, divergencias: [] },
    ],
  }),
}));

import MercadoPagoPage from "@/app/financeiro/mercadopago/page";

const html = async () => renderToStaticMarkup(await MercadoPagoPage());
/** O trecho da lista que pertence a uma loja: do nome dela até a próxima linha. */
const linhaDe = (pagina: string, nome: string) => {
  const inicio = pagina.indexOf(nome);
  const fim = pagina.indexOf("</li>", inicio);
  return pagina.slice(inicio, fim);
};

describe("mensalidades: o que cada linha oferece", () => {
  it("loja sem assinatura ganha o botão de criar a mensalidade", async () => {
    const linha = linhaDe(await html(), "Brilhax");
    expect(linha).toContain("Criar mensalidade");
    expect(linha).toContain("Só cobra depois do cartão cadastrado");
  });

  it("loja isenta diz que é isenta, e não oferece cobrar", async () => {
    const linha = linhaDe(await html(), "PK Vedações");
    expect(linha).toContain("Isenta: cobrada fora da plataforma");
    expect(linha).not.toContain("Criar mensalidade");
  });

  it("loja cancelada não oferece mensalidade nova", async () => {
    expect(linhaDe(await html(), "Sandro Motos")).not.toContain("Criar mensalidade");
  });

  it("loja com assinatura fica com as ações de sempre, sem o botão de criar", async () => {
    expect(linhaDe(await html(), "Vedashow")).not.toContain("Criar mensalidade");
  });

  it("assinatura cancelada sem loja sai da lista principal e fica recolhida", async () => {
    const pagina = await html();
    const recolhidas = pagina.slice(pagina.indexOf("<details class=\"mt-2"));
    expect(pagina).toContain("1 cancelada sem loja");
    expect(recolhidas).toContain("teste webhook");
    expect(pagina.slice(0, pagina.indexOf("<details class=\"mt-2"))).not.toContain("teste webhook");
  });
});

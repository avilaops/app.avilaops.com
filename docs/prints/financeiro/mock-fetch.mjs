/**
 * Respostas de mentira para o Mercado Pago e para a plataforma de Lojas,
 * carregadas com `NODE_OPTIONS=--import ./docs/prints/financeiro/mock-fetch.mjs`
 * no `next dev` da conferência visual.
 *
 * Sem isto a tela do Mercado Pago só mostra "não configurado", e o que
 * precisava ser conferido (ID da conta estourando a largura, cartão de
 * alerta cortado, slug técnico como título, descrição longa em 13 linhas)
 * nunca aparece. Os casos abaixo reproduzem exatamente esses formatos, com
 * dados inventados. Nada disto sai do processo de desenvolvimento.
 */
const original = globalThis.fetch;
const agora = Date.now();
const dia = 24 * 60 * 60 * 1000;
const iso = (emDias) => new Date(agora + emDias * dia).toISOString();

const assinaturas = [
  { id: "2c93808497a1b2c3", external_reference: "loja-exemplo", status: "authorized", reason: "Ávila Lojas · Loja", payer_email: "financeiro@lojaexemplo.com.br", auto_recurring: { transaction_amount: 149.9 }, date_created: iso(-80), next_payment_date: iso(12), init_point: null },
  { id: "2c93808497a1b2c4", external_reference: "padaria-ficticia", status: "authorized", reason: "Ávila Lojas · Site", payer_email: "contato@padariaficticia.com.br", auto_recurring: { transaction_amount: 79.9 }, date_created: iso(-40), next_payment_date: iso(3), init_point: null },
  { id: "2c93808497a1b2c5", external_reference: "arxisvr:u-smoke-7f3a9c2e-41b8-4d0e-9a7c-2b1f0e6d5c4a:starter:monthly", status: "pending", reason: "ArxisVR Starter mensal", payer_email: "teste+smoke@avilaops.com", auto_recurring: { transaction_amount: 29.9 }, date_created: iso(-15), next_payment_date: null, init_point: "https://www.mercadopago.com.br/subscriptions/checkout?preapproval_plan_id=exemplo" },
  { id: "2c93808497a1b2c6", external_reference: "auto:YvBFXq8TzL2mN4pR7sK1wD9hJ3cG6aE0", status: "cancelled", reason: "Assinatura automática", payer_email: null, auto_recurring: { transaction_amount: 19.9 }, date_created: iso(-200), next_payment_date: null, init_point: null },
];

const lojas = [
  { slug: "loja-exemplo", nome: "Loja Exemplo", plano: "LOJA", status: "ATIVA", dominioPrincipal: "lojaexemplo.com.br", criadoEm: iso(-90), assinaturaId: "2c93808497a1b2c3", assinaturaStatus: "AUTORIZADA", ultimoPagamentoEm: iso(-18), setupPagoEm: iso(-90), suspensaEm: null, tentativasFalhas: 0, loginEmail: null, emailContato: null, whatsapp: null },
  { slug: "padaria-ficticia", nome: "Padaria Fictícia", plano: "SITE", status: "SUSPENSA", dominioPrincipal: null, criadoEm: iso(-45), assinaturaId: "2c93808497a1b2c4", assinaturaStatus: "AUTORIZADA", ultimoPagamentoEm: iso(-27), setupPagoEm: iso(-45), suspensaEm: iso(-2), tentativasFalhas: 2, loginEmail: null, emailContato: null, whatsapp: null },
  { slug: "oficina-modelo", nome: "Oficina Modelo com um nome comprido de verdade", plano: "LOJA_PRO", status: "ATIVA", dominioPrincipal: null, criadoEm: iso(-10), assinaturaId: null, assinaturaStatus: "SEM_ASSINATURA", ultimoPagamentoEm: null, setupPagoEm: null, suspensaEm: null, tentativasFalhas: 0, loginEmail: null, emailContato: null, whatsapp: null },
];

const pagamentos = [
  { id: 101010101, status: "approved", status_detail: "accredited", transaction_amount: 149.9, net_received_amount: 142.41, payment_type_id: "credit_card", description: "Ávila Lojas · Loja · mensalidade de setembro de 2026 referente ao plano completo com domínio próprio, e-mail e suporte prioritário incluídos", payer: { email: "financeiro@lojaexemplo.com.br" }, date_created: iso(-18), collector_id: 1 },
  { id: 101010102, status: "rejected", status_detail: "cc_rejected_insufficient_amount", transaction_amount: 79.9, net_received_amount: null, payment_type_id: "credit_card", description: "Ávila Lojas · Site", payer: { email: "contato@padariaficticia.com.br" }, date_created: iso(-3), collector_id: 1 },
  { id: 101010103, status: "approved", status_detail: "accredited", transaction_amount: 1200, net_received_amount: 1152, payment_type_id: "bank_transfer", description: null, payer: { email: null }, date_created: iso(-6), collector_id: 1 },
];

function json(corpo, status = 200) {
  return new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });
}

globalThis.fetch = async (entrada, init) => {
  const url = typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.href : entrada.url;
  if (url.startsWith("https://api.mercadopago.com")) {
    const caminho = url.slice("https://api.mercadopago.com".length);
    if (caminho.startsWith("/users/me")) {
      return json({ id: 2847561930, nickname: "AVILAOPS20251024005122TESTEDECONTACOMNOMEENORME", email: "pix@avilaops.com", site_id: "MLB", user_type: "normal" });
    }
    if (caminho.startsWith("/applications/")) {
      return json({ id: 123, name: "Ávila Lojas", notifications_callback_url: "https://lojas.avilaops.com/api/webhooks/mercadopago-assinatura", notifications_topics: ["payment"], active: true });
    }
    if (caminho.startsWith("/preapproval/search")) return json({ results: assinaturas, paging: { total: assinaturas.length } });
    if (caminho.startsWith("/v1/payments/search")) return json({ results: pagamentos });
    return json({ message: "mock sem rota" }, 404);
  }
  if (url.startsWith("http://lojas.mock")) {
    if (url.includes("/api/admin/tenants")) return json(lojas);
    return json({ message: "mock sem rota" }, 404);
  }
  return original(entrada, init);
};

/**
 * A plataforma de lojas, fingida, só para os prints.
 *
 * A área `/lojas` não lê banco: ela lê o `lojas.avilaops.com` por HTTP. O
 * `semear.ts` não alcança isso, e sem esta peça os prints da área sairiam
 * todos no estado "plataforma não configurada" — print de tela vazia não
 * serve para a varredura mobile, que é o motivo deste job existir.
 *
 * Os dados cobrem os quatro estados de loja (no ar, suspensa, configurando e
 * no ar sem catálogo) e um catálogo com cada defeito que a tela promete
 * acusar. Nenhum segredo entra aqui, como no resto do job.
 */
import { createServer } from "node:http";

const agora = Date.now();
const dias = (n) => new Date(agora - n * 86400000).toISOString();

// Os slugs são os das organizações que o `semear.ts` cria, para o print
// mostrar o cruzamento de verdade. O "mercadinho" fica de fora dele de
// propósito: é a loja órfã, o estado que só esta área revela.
const LOJAS = [
  { slug: "padaria-aurora", nome: "Padaria Aurora", plano: "LOJA_PRO", status: "ATIVA", dominioPrincipal: "padariaaurora.example",
    criadoEm: dias(120), assinaturaId: "2c93", assinaturaStatus: "authorized", ultimoPagamentoEm: dias(3),
    setupPagoEm: dias(118), suspensaEm: null, tentativasFalhas: 0, loginEmail: "contato@padariaaurora.example",
    emailContato: "contato@padariaaurora.example", whatsapp: "5516999990000", _count: { produtos: 412, pedidos: 96 } },
  { slug: "clinica-horizonte", nome: "Clínica Horizonte", plano: "LOJA", status: "ATIVA", dominioPrincipal: null,
    criadoEm: dias(45), assinaturaId: "2c94", assinaturaStatus: "authorized", ultimoPagamentoEm: dias(12),
    setupPagoEm: dias(45), suspensaEm: null, tentativasFalhas: 2, loginEmail: "adm@clinicahorizonte.example",
    emailContato: null, whatsapp: null, _count: { produtos: 0, pedidos: 0 } },
  { slug: "oficina-vale", nome: "Oficina do Vale", plano: "LOJA", status: "SUSPENSA", dominioPrincipal: null,
    criadoEm: dias(200), assinaturaId: "2c95", assinaturaStatus: "paused", ultimoPagamentoEm: dias(70),
    setupPagoEm: dias(200), suspensaEm: dias(9), tentativasFalhas: 4, loginEmail: "adm@oficinavale.example",
    emailContato: null, whatsapp: null, _count: { produtos: 88, pedidos: 240 } },
  { slug: "serra-azul-engenharia", nome: "Construtora Serra Azul", plano: "SITE", status: "PROVISIONANDO", dominioPrincipal: null,
    criadoEm: dias(6), assinaturaId: null, assinaturaStatus: "pending", ultimoPagamentoEm: null,
    setupPagoEm: null, suspensaEm: null, tentativasFalhas: 0, loginEmail: null,
    emailContato: null, whatsapp: null, _count: { produtos: 0, pedidos: 0 } },
  { slug: "mercadinho-do-bairro", nome: "Mercadinho do Bairro", plano: "LOJA", status: "ATIVA", dominioPrincipal: null,
    criadoEm: dias(30), assinaturaId: "2c96", assinaturaStatus: "pending", ultimoPagamentoEm: null,
    setupPagoEm: dias(30), suspensaEm: null, tentativasFalhas: 0, loginEmail: "mercadinho@example.com",
    emailContato: null, whatsapp: null, _count: { produtos: 61, pedidos: 4 } },
];

// Catálogo com os quatro defeitos que a tela promete acusar, e itens sãos.
function catalogo(slug) {
  if (slug === "clinica-horizonte" || slug === "serra-azul-engenharia") return [];
  const base = [
    { nome: "Retentor de roda dianteira 6200-2RS", marca: "Sabó", sku: "SB-6200", precoCentavos: 2490, imagens: ["/a.jpg"], imagemOrigem: "propria", ativo: true, disponibilidade: "in_stock", estoque: 24 },
    { nome: "Rolamento blindado UCP-205", marca: "NSK", sku: "NSK-UCP205", precoCentavos: 8900, imagens: [], imagemOrigem: "propria", ativo: true, disponibilidade: "in_stock", estoque: 3 },
    { nome: "Junta do cabeçote alumínio", marca: null, sku: "JC-900", precoCentavos: 0, imagens: ["/b.jpg"], imagemOrigem: "propria", ativo: true, disponibilidade: "in_stock", estoque: 7 },
    { nome: "Kit de embreagem completo", marca: "Luk", sku: "LUK-KIT", precoCentavos: 78900, imagens: ["/c.jpg"], imagemOrigem: "propria", ativo: true, disponibilidade: "in_stock", estoque: 0 },
    { nome: "Correia dentada 123 dentes", marca: "Gates", sku: "GT-123", precoCentavos: 15900, imagens: ["/d.jpg"], imagemOrigem: "representativa", ativo: true, disponibilidade: "in_stock", estoque: 11 },
    { nome: "Bucha de suspensão traseira", marca: "Axios", sku: "AX-55", precoCentavos: 4500, imagens: ["/e.jpg"], imagemOrigem: "ilustracao", ativo: true, disponibilidade: "in_stock", estoque: 6 },
    { nome: "Amortecedor dianteiro (rascunho)", marca: null, sku: null, precoCentavos: 0, imagens: [], imagemOrigem: "propria", ativo: false, disponibilidade: "in_stock", estoque: null },
    { nome: "Filtro de óleo sob consulta", marca: "Tecfil", sku: "TF-10", precoCentavos: 3200, imagens: ["/f.jpg"], imagemOrigem: "propria", ativo: true, disponibilidade: "out_of_stock", estoque: 0 },
  ];
  // Enche até passar de uma página, para conferir a paginação de verdade.
  const itens = [];
  for (let i = 0; i < 8; i++) {
    for (const p of base) {
      itens.push({
        id: `${slug}-${i}-${p.sku ?? "x"}`, slug: `${(p.sku ?? "item").toLowerCase()}-${i}`,
        ...p, nome: i === 0 ? p.nome : `${p.nome} (lote ${i})`,
        precoDeCentavos: null, destaque: false, atualizadoEm: dias(2), criadoEm: dias(40),
        categoria: { nome: "Peças", slug: "pecas" },
      });
    }
  }
  return itens;
}

const PORTA = Number(process.env.PORTA_LOJAS_FALSA ?? 4599);

createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  const autorizado = (req.headers.authorization ?? "") === "Bearer token-de-conferencia";
  const json = (corpo, status = 200) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(corpo));
  };
  if (!autorizado) return json({ erro: "não autorizado" }, 401);

  if (url.pathname === "/api/admin/tenants") return json(LOJAS);

  const m = url.pathname.match(/^\/api\/admin\/tenants\/([^/]+)(\/produtos)?$/);
  if (m) {
    const loja = LOJAS.find((l) => l.slug === m[1]);
    if (!loja) return json({ erro: "loja não encontrada" }, 404);
    if (m[2]) return json(catalogo(loja.slug));
    return json({ ...loja, segmento: "motopecas", dominios: [], logoUrl: null, emailRemetente: null,
      cepOrigem: "14000-000", despachoDiasUteis: 1, freteGratisAcima: null, mlConectadoEm: null,
      mlNickname: null, mpPublicKey: "APP_USR-x", atualizadoEm: dias(1),
      _count: { ...loja._count, categorias: 7 } });
  }
  json({ erro: "rota não existe nesta API falsa" }, 404);
}).listen(PORTA, "127.0.0.1", () => console.log(`plataforma de lojas fingida em http://127.0.0.1:${PORTA}`));

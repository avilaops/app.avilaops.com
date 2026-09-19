/**
 * Dados fictícios para os prints do Hub Social no CI. Nenhum cliente real:
 * nomes inventados e domínios no TLD reservado `.example`.
 *
 * Recusa rodar fora de banco local, pela mesma razão de tests/setup.ts: o
 * banco de verdade é compartilhado com o portal do cliente.
 */
import { prisma } from "../../src/lib/prisma";

const url = process.env.DATABASE_URL ?? "";
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url)) {
  throw new Error("semear.ts só roda contra banco local descartável.");
}

const agora = Date.now();
const haMin = (min: number) => new Date(agora - min * 60_000);
const haDias = (dias: number) => new Date(agora - dias * 86_400_000);
const emDias = (dias: number) => new Date(agora + dias * 86_400_000);

export const ADMIN_ID = "prints-owner";

async function main() {
  await prisma.adminIdentity.upsert({
    where: { id: ADMIN_ID },
    update: {},
    create: {
      id: ADMIN_ID,
      nome: "Pessoa Dona Exemplo",
      email: "dono@avilaops.example",
      senhaHash: "sem-login-por-senha",
      senhaProvisoria: false,
      role: "OWNER",
    },
  });

  // O quarto cliente existe por um motivo só: razão social comprida.
  //
  // Os três primeiros cabem numa linha em qualquer aparelho, e por isso os
  // prints nunca mostraram o defeito que se vê no painel de verdade — nome de
  // cliente quebrando em quatro linhas e estourando o `min-height` de 60px da
  // linha. Ferramenta de evidência que não consegue exibir o defeito que ela
  // deveria provar não serve para decidir a correção.
  //
  // 50 caracteres, a mesma ordem de grandeza de uma razão social real com
  // ramo de atividade e tipo societário no nome. Fictício, como todo o resto
  // desta semeadura.
  const orgs = [
    { slug: "padaria-aurora", name: "Padaria Aurora", segment: "Alimentação" },
    { slug: "clinica-horizonte", name: "Clínica Horizonte", segment: "Saúde" },
    { slug: "oficina-vale", name: "Oficina do Vale", segment: "Serviços automotivos" },
    {
      slug: "serra-azul-engenharia",
      name: "Construtora Serra Azul Engenharia e Topografia LTDA",
      segment: "Engenharia e topografia",
    },
  ];
  // `update: o`, não `update: {}`: o banco local sobrevive entre execuções, e um
  // `update` vazio deixa a linha antiga como está. Foi assim que dois clientes
  // semeados com segmento apareceram no print como "Segmento não definido" —
  // eles existiam de uma semeadura anterior ao campo. No CI o banco nasce do
  // zero e a diferença não aparece; localmente ela mente calada.
  const organizacoes = [];
  for (const o of orgs) {
    organizacoes.push(await prisma.organization.upsert({ where: { slug: o.slug }, update: o, create: o }));
  }
  const [aurora, horizonte, vale] = organizacoes;

  // O vínculo loja → cliente que a área /lojas cruza com a plataforma. Três
  // das cinco lojas fingidas ficam vinculadas; as outras duas continuam órfãs
  // de propósito, porque "loja que ninguém reivindica" é justamente o estado
  // que só essa tela revela — e print que não o mostra não o prova.
  for (const org of [aurora, horizonte, vale]) {
    await prisma.organizationIntegration.upsert({
      where: { organizationId_provider: { organizationId: org.id, provider: "lojas_avilaops" } },
      update: { publicId: org.slug, accountName: org.name, status: "ACTIVE" },
      create: {
        organizationId: org.id,
        provider: "lojas_avilaops",
        publicId: org.slug,
        accountName: org.name,
        status: "ACTIVE",
      },
    });
  }

  const dominios = [
    { org: aurora, fqdn: "padariaaurora.example", status: "active", plano: "Free Website", sync: 12, dns: 9, expira: 40 },
    { org: aurora, fqdn: "aurorapaes.example", status: "active", plano: "Free Website", sync: 12, dns: 4, expira: 300 },
    { org: horizonte, fqdn: "clinicahorizonte.example", status: "active", plano: "Pro Website", sync: 30, dns: 14, expira: 18 },
    { org: horizonte, fqdn: "agendahorizonte.example", status: "pending", plano: "Free Website", sync: 60 * 26, dns: 2, expira: null },
    { org: vale, fqdn: "oficinadovale.example", status: "active", plano: "Free Website", sync: 5, dns: 7, expira: 200 },
  ];
  for (const [i, d] of dominios.entries()) {
    const ativo = await prisma.domainAsset.upsert({
      where: { fqdn: d.fqdn },
      update: {},
      create: {
        organizationId: d.org.id,
        fqdn: d.fqdn,
        cloudflareZoneId: `zona-exemplo-${i}`,
        cloudflareStatus: d.status,
        cloudflarePlan: d.plano,
        dnsLastSyncedAt: haMin(d.sync),
        expiresAt: d.expira === null ? null : emDias(d.expira),
        autoRenew: i % 2 === 0,
        registrar: "Registro.br",
      },
    });
    for (let r = 0; r < d.dns; r++) {
      await prisma.dnsRecord.upsert({
        where: { cloudflareRecordId: `${d.fqdn}-${r}` },
        update: {},
        create: { domainAssetId: ativo.id, cloudflareRecordId: `${d.fqdn}-${r}`, type: r === 0 ? "A" : "CNAME", name: d.fqdn, content: "192.0.2.10" },
      });
    }
  }

  const seo = [
    { site: "sc-domain:padariaaurora.example", provider: "google_search_console", meta: { verified: true } },
    { site: "sc-domain:clinicahorizonte.example", provider: "google_search_console", meta: { verified: true } },
    { site: "padariaaurora.example", provider: "seo_audit", meta: { score: 86, robots: { ok: true }, sitemap: { ok: true }, llms: { ok: false }, homeHtml: { hasCanonical: true } } },
    { site: "clinicahorizonte.example", provider: "seo_audit", meta: { score: 64, robots: { ok: false }, sitemap: { ok: true }, homeHtml: { hasCanonical: true } } },
    { site: "padariaaurora.example", provider: "lighthouse", meta: { performanceScore: 91, lcp: "1,8 s", cls: "0,02", inp: "120 ms" } },
    { site: "clinicahorizonte.example", provider: "lighthouse", meta: { performanceScore: 58, lcp: "4,1 s", cls: "0,18", inp: "310 ms" } },
  ];
  for (const s of seo) {
    await prisma.integrationConnection.upsert({
      where: { provider_siteUrl: { provider: s.provider, siteUrl: s.site } },
      update: {},
      create: { provider: s.provider, siteUrl: s.site, status: "ACTIVE", lastSyncedAt: haMin(90), lastSyncStatus: "SUCCESS", metadata: s.meta },
    });
  }

  const contatos = [
    ["ana@padariaaurora.example", "Ana Lima", "Padaria Aurora", "SUBSCRIBED", ["clientes"]],
    ["bruno@clinicahorizonte.example", "Bruno Reis", "Clínica Horizonte", "SUBSCRIBED", ["clientes", "saude"]],
    ["carla@oficinadovale.example", "Carla Souza", "Oficina do Vale", "SUBSCRIBED", ["clientes"]],
    ["davi@exemplo.example", "Davi Costa", null, "SUBSCRIBED", ["prospeccao"]],
    ["elisa@exemplo.example", "Elisa Nunes", null, "UNSUBSCRIBED", ["prospeccao"]],
    ["retorno@exemplo.example", null, null, "BOUNCED", []],
  ] as const;
  for (const [i, [email, name, company, status, tags]] of contatos.entries()) {
    await prisma.newsletterContact.upsert({
      where: { email },
      update: {},
      create: { email, name, company, status, tags: [...tags], source: i < 3 ? "CLIENTES" : "MANUAL", createdAt: haDias(i + 1) },
    });
  }
  if ((await prisma.newsletterCampaign.count()) === 0) {
    await prisma.newsletterCampaign.createMany({
      data: [
        { name: "Novidades de setembro", subject: "O que mudou no seu site este mês", status: "SENT", recipientCount: 3, sentCount: 3, sentAt: haDias(2), createdAt: haDias(3), audienceTags: ["clientes"], format: "TEXT", text: "Olá!" },
        { name: "Convite para diagnóstico", subject: "Seu site aparece no Google?", status: "DRAFT", createdAt: haDias(1), audienceTags: ["prospeccao"], format: "TEXT", text: "Olá!" },
      ],
    });
  }

  const eventos = [
    { tipo: "messages", status: "PROCESSED", min: 8 },
    { tipo: "message_template_status_update", status: "RECEIVED", min: 55 },
    { tipo: "flow", status: "PROCESSED", min: 60 * 5 },
    { tipo: "messages", status: "FAILED", min: 60 * 30, erro: "Assinatura inválida" },
  ];
  for (const [i, e] of eventos.entries()) {
    await prisma.integrationWebhookEvent.upsert({
      where: { idempotencyKey: `whatsapp_business:exemplo:${i}` },
      update: {},
      create: {
        provider: "whatsapp_business",
        eventType: e.tipo,
        status: e.status,
        idempotencyKey: `whatsapp_business:exemplo:${i}`,
        receivedAt: haMin(e.min),
        processedAt: e.status === "PROCESSED" ? haMin(e.min - 1) : null,
        error: e.erro ?? null,
        payload: { object: "whatsapp_business_account", exemplo: true, entrada: i },
      },
    });
  }

  await prisma.organizationIntegrationConnection.upsert({
    where: { organizationId_provider: { organizationId: horizonte.id, provider: "meta_business" } },
    update: {},
    create: {
      organizationId: horizonte.id,
      provider: "meta_business",
      status: "ACTIVE",
      accountName: "Pessoa Dona Exemplo",
      externalId: "100000000000001",
      tokenExpiresAt: emDias(5),
      lastSyncedAt: haMin(40),
      lastSyncStatus: "SUCCESS",
    },
  });
  const bm = await prisma.metaBusinessAccount.upsert({
    where: { businessId: "exemplo-bm-1" },
    update: {},
    create: { organizationId: horizonte.id, businessId: "exemplo-bm-1", name: "Clínica Horizonte BM", verificationStatus: "not_verified", timezone: "America/Sao_Paulo", lastSyncedAt: haMin(40) },
  });
  const pagina = await prisma.metaPage.upsert({
    where: { pageId: "exemplo-pagina-1" },
    update: {},
    create: { organizationId: horizonte.id, businessAccountRefId: bm.id, pageId: "exemplo-pagina-1", name: "Clínica Horizonte", username: "clinicahorizonte", lastSyncedAt: haMin(40) },
  });
  await prisma.instagramAccount.upsert({
    where: { instagramAccountId: "exemplo-ig-1" },
    update: {},
    create: { organizationId: horizonte.id, businessAccountRefId: bm.id, pageRefId: pagina.id, instagramAccountId: "exemplo-ig-1", username: "clinicahorizonte", name: "Clínica Horizonte", followersCount: 2140, lastSyncedAt: haMin(40) },
  });
  const conta = await prisma.metaAdAccount.upsert({
    where: { adAccountId: "act_exemplo_1" },
    update: {},
    create: { organizationId: horizonte.id, businessAccountRefId: bm.id, adAccountId: "act_exemplo_1", name: "Horizonte — Anúncios", currency: "BRL", accountStatus: "1", lastSyncedAt: haMin(40) },
  });
  if ((await prisma.metaCampaignSnapshot.count()) === 0) {
    await prisma.metaCampaignSnapshot.createMany({
      data: [
        { organizationId: horizonte.id, adAccountRefId: conta.id, campaignId: "c1", campaignName: "Check-up anual", status: "ACTIVE", objective: "OUTCOME_LEADS", spend: "412.50", impressions: 38120, clicks: 902, leads: 27, capturedAt: haMin(40) },
        { organizationId: horizonte.id, adAccountRefId: conta.id, campaignId: "c2", campaignName: "Agendamento online", status: "PAUSED", objective: "OUTCOME_TRAFFIC", spend: "180.00", impressions: 15400, clicks: 388, leads: 0, capturedAt: haMin(40) },
      ],
    });
  }
  const formulario = await prisma.metaLeadForm.upsert({
    where: { formId: "exemplo-form-1" },
    update: {},
    create: { organizationId: horizonte.id, pageRefId: pagina.id, adAccountRefId: conta.id, formId: "exemplo-form-1", name: "Agendar consulta", status: "ACTIVE", questions: [{ key: "full_name" }, { key: "phone_number" }, { key: "especialidade" }], lastSyncedAt: haMin(40) },
  });
  for (const [i, s] of ["NEW", "NEW", "IMPORTED"].entries()) {
    await prisma.metaLead.upsert({
      where: { leadgenId: `exemplo-lead-${i}` },
      update: {},
      create: { organizationId: horizonte.id, formRefId: formulario.id, pageRefId: pagina.id, adAccountRefId: conta.id, leadgenId: `exemplo-lead-${i}`, createdTime: haMin(30 + i * 200), processingStatus: s, fieldData: [{ name: "full_name", values: ["Pessoa Exemplo"] }, { name: "phone_number", values: ["+55 11 90000-0000"] }] },
    });
  }

  // Movimentações bancárias: sem elas a tela do Financeiro aparece vazia nos
  // prints e na conferência de densidade, que é justamente onde o cartão de
  // movimentação precisa ser medido.
  if ((await prisma.bankTransaction.count()) === 0) {
    // `efi-production` é a conta padrão que o painel escolhe (DEFAULT_ACCOUNT_ID
    // em src/lib/dashboard.ts). Pendurar as movimentações em outra conta faria
    // a tela continuar vazia.
    const conta = await prisma.bankAccount.upsert({
      where: { id: "efi-production" },
      update: {},
      create: {
        id: "efi-production",
        provider: "efi",
        externalId: "exemplo-0001",
        displayName: "Conta exemplo",
        environment: "producao",
      },
    });
    const movimentos = [
      { d: "CREDIT", t: "PIX_RECEIVED", v: "350.00", desc: "Pix recebido", quem: null, escopo: "INDEFINIDO" },
      { d: "DEBIT", t: "PIX_SENT", v: "3.50", desc: "Pix enviado", quem: "MERCADO DO BAIRRO LTDA", escopo: "PESSOAL" },
      { d: "DEBIT", t: "PIX_SENT", v: "8.00", desc: "Pix enviado", quem: "PADARIA AURORA ME", escopo: "PESSOAL" },
      { d: "DEBIT", t: "CARD_PAYMENT", v: "129.90", desc: "Assinatura de hospedagem", quem: "PORKBUN LLC", escopo: "EMPRESA" },
      { d: "CREDIT", t: "TRANSFER_IN", v: "1200.00", desc: "Transferência recebida", quem: "CLINICA HORIZONTE LTDA", escopo: "EMPRESA" },
    ];
    for (const [i, m] of movimentos.entries()) {
      await prisma.bankTransaction.create({
        data: {
          accountId: conta.id,
          externalId: `exemplo-mov-${i}`,
          direction: m.d,
          transactionType: m.t,
          amount: m.v,
          description: m.desc,
          counterpartyName: m.quem,
          occurredAt: haDias(i),
          rawHash: `exemplo-mov-${i}`,
          scope: m.escopo,
        },
      });
    }
  }

  if ((await prisma.studioPiece.count()) === 0) {
    const pecas = [
      { title: "Cartão de chamada", templateId: "cartao-chamada", format: "4:5", kind: "image", status: "DONE", w: 1080, h: 1350 },
      { title: "Receita da semana (vídeo)", templateId: "cena-personagem", format: "9:16", kind: "video", status: "RUNNING", w: 1080, h: 1920 },
      { title: "Frase do dia", templateId: "post-frase", format: "1:1", kind: "image", status: "FAILED", w: 1080, h: 1080 },
      { title: "Anúncio de serviço", templateId: "anuncio-servico", format: "9:16", kind: null, status: null, w: 0, h: 0 },
    ];
    for (const [i, p] of pecas.entries()) {
      const peca = await prisma.studioPiece.create({ data: { title: p.title, templateId: p.templateId, format: p.format, values: {}, createdAt: haDias(i), updatedAt: haDias(i) } });
      if (p.kind && p.status) {
        await prisma.studioRender.create({ data: { pieceId: peca.id, kind: p.kind, status: p.status, width: p.w, height: p.h, snapshot: {}, createdAt: haDias(i) } });
      }
    }
  }
}

main()
  .then(() => console.log("Dados fictícios prontos."))
  .finally(() => prisma.$disconnect());

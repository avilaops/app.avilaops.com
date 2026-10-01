/**
 * Semente só para a conferência visual do Financeiro: as mesmas nove contas
 * que existem em produção (nomes, moedas e provedores), com movimentações
 * inventadas no formato de cada uma. Os valores e contrapartes são de
 * mentira de propósito: os prints vão para o PR e não podem carregar o
 * extrato de verdade.
 *
 * Roda contra o Postgres descartável do scratchpad, nunca contra produção.
 */
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Pseudoaleatório com semente: os prints de antes e depois precisam mostrar
// os mesmos números, senão a comparação não prova nada.
let semente = 20260930;
function aleatorio() {
  semente = (semente * 1103515245 + 12345) % 2147483648;
  return semente / 2147483648;
}
const escolher = (lista) => lista[Math.floor(aleatorio() * lista.length)];
const valor = (min, max) => Math.round((min + aleatorio() * (max - min)) * 100) / 100;

const CONTAS = [
  { id: "efi-production", provider: "efi", externalId: "primary", displayName: "Conta Efí Produção", currency: "BRL" },
  { id: "wise-brl", provider: "wise", externalId: "brl", displayName: "Wise · BRL", currency: "BRL" },
  { id: "wise-eur", provider: "wise", externalId: "eur", displayName: "Wise · EUR", currency: "EUR" },
  { id: "wise-usd", provider: "wise", externalId: "usd", displayName: "Wise · USD", currency: "USD" },
  { id: "wise-aud", provider: "wise", externalId: "aud", displayName: "Wise · AUD", currency: "AUD" },
  { id: "mercadopago-production", provider: "mercadopago", externalId: "primary", displayName: "Mercado Pago", currency: "BRL" },
  { id: "mercadopago-cnpj", provider: "mercadopago", externalId: "NB20251024005122", displayName: "Mercado Pago · CNPJ 67.954.417", currency: "BRL" },
  { id: "cartao-bb", provider: "cartao", externalId: "bb-nicolas", displayName: "Cartao Banco do Brasil", currency: "BRL" },
  { id: "cartao-assai", provider: "cartao", externalId: "assai-nicolas", displayName: "Cartao Assai", currency: "BRL" },
];

const PAGADORES = ["Loja Exemplo Ltda", "Cliente Demonstração ME", "Padaria Fictícia", "Oficina Modelo", null, null];
const FORNECEDORES = [
  ["Hetzner Online GmbH", "EMPRESA", "Infraestrutura"],
  ["Porkbun LLC", "EMPRESA", "Domínios"],
  ["Anthropic", "EMPRESA", "IA"],
  ["Contabilidade Exemplo", "EMPRESA", "Contabilidade"],
  ["Supermercado Demonstração", "PESSOAL", "Mercado"],
  ["Uber", "PESSOAL", "Transporte"],
  ["Farmácia Modelo", "PESSOAL", "Saúde"],
  ["Estabelecimento com nome muito comprido para testar o corte da descrição na tabela", "INDEFINIDO", null],
  ["Fornecedor sem cadastro", "INDEFINIDO", null],
];
const ESTADOS = ["PENDING", "PENDING", "PENDING", "REVIEW", "MATCHED", "MATCHED", "MATCHED", "IGNORED"];

async function main() {
  const senhaHash = await bcrypt.hash("visual123", 10);
  await prisma.adminIdentity.upsert({
    where: { id: "admin-visual" },
    update: { senhaHash, ativo: true, senhaProvisoria: false, role: "OWNER" },
    create: {
      id: "admin-visual",
      nome: "Nicolas",
      email: "nicolas@avilaops.com",
      senhaHash,
      senhaProvisoria: false,
      role: "OWNER",
      ativo: true,
    },
  });

  // Recomeça do zero a cada rodada: a semente é a verdade desta conferência.
  await prisma.reconciliation.deleteMany({});
  await prisma.bankTransaction.deleteMany({});
  await prisma.balanceSnapshot.deleteMany({});
  await prisma.bankSyncRun.deleteMany({});
  await prisma.bankAccount.deleteMany({});
  await prisma.ledgerEntry.deleteMany({});

  const agora = Date.now();
  const dia = 24 * 60 * 60 * 1000;

  for (const conta of CONTAS) {
    await prisma.bankAccount.create({
      data: {
        ...conta,
        environment: "production",
        lastSyncAt: conta.provider === "efi" || conta.provider === "mercadopago" ? new Date(agora - 2 * 60 * 60 * 1000) : new Date(agora - 30 * dia),
      },
    });
  }

  await prisma.balanceSnapshot.create({
    data: { accountId: "efi-production", availableBalance: "18432.57", capturedAt: new Date(agora - 2 * 60 * 60 * 1000) },
  });
  await prisma.bankSyncRun.create({
    data: {
      accountId: "efi-production",
      status: "SUCCESS",
      scopeDays: 90,
      receivedCount: 13,
      sentCount: 40,
      balanceCaptured: true,
      startedAt: new Date(agora - 2 * 60 * 60 * 1000),
      finishedAt: new Date(agora - 2 * 60 * 60 * 1000 + 8000),
    },
  });

  let n = 0;
  async function mov(accountId, currency, dias, direction, transactionType, amount, contraparte, scope, category, estado) {
    n += 1;
    const occurredAt = new Date(agora - dias * dia - Math.floor(aleatorio() * 10) * 60 * 60 * 1000);
    const t = await prisma.bankTransaction.create({
      data: {
        accountId,
        externalId: `visual-${n}`,
        endToEndId: accountId === "efi-production" ? `E00000000202609${String(n).padStart(6, "0")}VISUAL` : null,
        direction,
        transactionType,
        amount: String(amount),
        currency,
        description: contraparte ?? (direction === "CREDIT" ? "Pix recebido" : "Pix enviado"),
        counterpartyName: contraparte,
        occurredAt,
        rawHash: `visual-${n}`,
        scope,
        scopeSource: scope === "INDEFINIDO" ? null : "REGRA",
        category,
      },
    });
    await prisma.reconciliation.create({
      data: {
        transactionId: t.id,
        status: estado,
        referenceType: estado === "MATCHED" ? escolher(["LEDGER", "COMPROVANTE", "INVOICE"]) : null,
        referenceId: estado === "MATCHED" ? String(100 + n) : null,
      },
    });
  }

  // Éfi: entradas de clientes e saídas para fornecedores, com dias vazios no meio.
  for (let i = 0; i < 53; i += 1) {
    const dias = Math.floor(aleatorio() * 85);
    if (i % 4 === 0) {
      await mov("efi-production", "BRL", dias, "CREDIT", "PIX_RECEIVED", valor(150, 4200), escolher(PAGADORES), "EMPRESA", "Receita de cliente", escolher(ESTADOS));
    } else {
      const [nome, escopo, categoria] = escolher(FORNECEDORES);
      await mov("efi-production", "BRL", dias, "DEBIT", "PIX_SENT", valor(12, 900), nome, escopo, categoria, escolher(ESTADOS));
    }
  }
  // Uma transferência para a Wise, que é entre contas.
  await mov("efi-production", "BRL", 12, "DEBIT", "PIX_SENT", 2500, "Nicolas Rosa Avila Barros", "INTERNO", "Transferência entre contas", "MATCHED");

  // Wise: cartão, conversões e transferências nas quatro moedas.
  const tiposWise = [
    ["DEBIT", "CARD_PURCHASE"],
    ["DEBIT", "CARD_PURCHASE"],
    ["DEBIT", "CARD_PURCHASE"],
    ["CREDIT", "TRANSFER_RECEIVED"],
    ["DEBIT", "TRANSFER_SENT"],
    ["DEBIT", "CONVERSION_OUT"],
    ["CREDIT", "CONVERSION_IN"],
    ["CREDIT", "CARD_REFUND"],
    ["CREDIT", "CASHBACK"],
  ];
  for (const [accountId, currency, quantidade] of [["wise-brl", "BRL", 120], ["wise-eur", "EUR", 40], ["wise-usd", "USD", 18], ["wise-aud", "AUD", 2]]) {
    for (let i = 0; i < quantidade; i += 1) {
      const [direction, tipo] = escolher(tiposWise);
      const [nome, escopo, categoria] = tipo.startsWith("CONVERSION") ? ["Wise", "INTERNO", "Conversão de saldo"] : escolher(FORNECEDORES);
      await mov(accountId, currency, Math.floor(aleatorio() * 360), direction, tipo, valor(3, currency === "BRL" ? 600 : 120), nome, escopo, categoria, escolher(ESTADOS));
    }
  }

  await mov("mercadopago-production", "BRL", 340, "DEBIT", "bank_transfer", 49.9, "Mercado Pago", "EMPRESA", "Tarifa", "PENDING");
  for (let i = 0; i < 12; i += 1) {
    await mov("cartao-bb", "BRL", 20 + i * 3, "DEBIT", i % 3 === 0 ? "iof" : "compra", valor(6, 560), escolher(FORNECEDORES)[0], "EMPRESA", "IA", "PENDING");
  }
  for (let i = 0; i < 3; i += 1) {
    await mov("cartao-assai", "BRL", 40 + i * 30, "DEBIT", "compra", valor(50, 140), "Loja de roupas", "PESSOAL", "Vestuário", "PENDING");
  }

  // Contas a pagar e receber: uma vencida, algumas no prazo, uma paga.
  const lancamentos = [
    ["PAYABLE", "OPEN", "Servidor dedicado", "Hetzner Online GmbH", 389.9, -3, "Infraestrutura"],
    ["PAYABLE", "OPEN", "Renovação de domínios", "Porkbun LLC", 212.4, 4, "Domínios"],
    ["PAYABLE", "OPEN", "Honorários contábeis", "Contabilidade Exemplo", 650, 9, "Contabilidade"],
    ["RECEIVABLE", "OPEN", "Mensalidade de manutenção", "Cliente Demonstração ME", 1200, 2, "Receita de cliente"],
    ["RECEIVABLE", "OPEN", "Projeto de site", "Loja Exemplo Ltda", 4800, 15, "Receita de cliente"],
    ["RECEIVABLE", "PAID", "Mensalidade de agosto", "Padaria Fictícia", 890, -20, "Receita de cliente"],
  ];
  for (const [direction, status, description, counterparty, amount, emDias, category] of lancamentos) {
    await prisma.ledgerEntry.create({
      data: {
        direction,
        status,
        description,
        counterparty,
        amount: String(amount),
        scope: "EMPRESA",
        dueDate: new Date(agora + emDias * dia),
        paidAt: status === "PAID" ? new Date(agora + emDias * dia) : null,
        category,
        createdBy: "admin-visual",
      },
    });
  }

  console.log(`${n} movimentações em ${CONTAS.length} contas.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

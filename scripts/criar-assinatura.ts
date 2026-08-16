import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { garantirFatura } from "@/lib/assinaturas";

/**
 * Cadastra (ou atualiza) a mensalidade de um cliente e, se pedido, a fatura de
 * implantação.
 *
 * Existe porque a tela de assinatura no painel ainda não foi feita, e o
 * primeiro cliente não pode esperar por ela. É idempotente: rodar duas vezes
 * com os mesmos valores não cria assinatura duplicada nem fatura repetida.
 *
 *   ORG_SLUG=minas-espetinhos ORG_NOME="Minas Espetinhos" \
 *   PRODUTO=minas PRODUTO_TENANT=<uuid do tenant> \
 *   VALOR=250 DIA=10 IMPLANTACAO=650 \
 *   npx tsx scripts/criar-assinatura.ts
 *
 * `IMPLANTACAO` é opcional — sem ela, só a mensalidade é cadastrada.
 */

function exigir(nome: string): string {
  const valor = process.env[nome]?.trim();
  if (!valor) {
    console.error(`Falta ${nome}.`);
    process.exit(1);
  }
  return valor;
}

function competenciaDeHoje(): string {
  const agora = new Date();
  return `${agora.getUTCFullYear()}-${String(agora.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function main() {
  const slug = exigir("ORG_SLUG");
  const produto = exigir("PRODUTO");
  const produtoTenant = exigir("PRODUTO_TENANT");
  const valor = Number(exigir("VALOR"));
  const dia = Number(exigir("DIA"));
  const implantacao = process.env.IMPLANTACAO ? Number(process.env.IMPLANTACAO) : null;

  if (!Number.isFinite(valor) || valor <= 0) {
    console.error("VALOR precisa ser um número maior que zero.");
    process.exit(1);
  }

  // O banco também recusa, com CHECK. A checagem aqui é para a mensagem ser
  // legível em vez de erro de constraint.
  if (!Number.isInteger(dia) || dia < 1 || dia > 28) {
    console.error("DIA precisa estar entre 1 e 28 — 29, 30 e 31 não existem em todo mês.");
    process.exit(1);
  }

  const organizacao = await prisma.organization.upsert({
    where: { slug },
    update: {},
    create: {
      slug,
      name: process.env.ORG_NOME?.trim() || slug,
      legalName: process.env.ORG_RAZAO_SOCIAL?.trim() || null,
      cpfCnpj: process.env.ORG_CNPJ?.replace(/\D/g, "") || null,
    },
  });

  const existente = await prisma.subscription.findUnique({
    where: {
      productKey_productTenantId: { productKey: produto, productTenantId: produtoTenant },
    },
  });

  const assinatura = existente
    ? await prisma.subscription.update({
        where: { id: existente.id },
        data: { amount: valor, billingDay: dia, status: "ACTIVE" },
      })
    : await prisma.subscription.create({
        data: {
          organizationId: organizacao.id,
          description: process.env.DESCRICAO?.trim() || "Plataforma Avila Ops",
          amount: valor,
          billingDay: dia,
          startedAt: new Date(),
          productKey: produto,
          productTenantId: produtoTenant,
        },
      });

  console.log(`organização: ${organizacao.name} (${organizacao.slug})`);
  console.log(`assinatura:  R$ ${valor.toFixed(2)}/mês, vence dia ${dia} — ${assinatura.status}`);
  console.log(`produto:     ${produto} · tenant ${produtoTenant}`);

  if (implantacao) {
    const fatura = await garantirFatura({
      subscriptionId: assinatura.id,
      competencia: competenciaDeHoje(),
      tipo: "SETUP",
      valorCents: Math.round(implantacao * 100),
      // Implantação vence em 7 dias, não no dia da mensalidade: é cobrança de
      // entrada, e amarrá-la ao ciclo mensal daria vencimento no passado
      // quando o contrato fecha depois do dia 10.
      vencimento: new Date(Date.now() + 7 * 86_400_000),
    });

    console.log(
      `implantação: R$ ${implantacao.toFixed(2)} — fatura ${fatura?.id}, vence ${fatura?.dueDate
        .toISOString()
        .slice(0, 10)}`,
    );
  }

  console.log("\nA fatura da mensalidade é gerada pelo job mensal (ou por garantirFatura).");
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

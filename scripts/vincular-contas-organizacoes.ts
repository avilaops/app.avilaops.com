/**
 * Liga as contas CLIENT já existentes à empresa que elas representam.
 *
 * Roda sem argumento em modo seco (só mostra o que faria); `--aplicar` grava.
 * O casamento é, nesta ordem: e-mail do contato da organização, CPF/CNPJ e
 * domínio do e-mail contra o slug da organização (vários slugs são o próprio
 * domínio do cliente). Conta sem candidato único fica de fora e aparece na
 * lista — vincular no chute é pior do que não vincular: daria a um cliente a
 * empresa de outro.
 *
 *   npx tsx scripts/vincular-contas-organizacoes.ts
 *   npx tsx scripts/vincular-contas-organizacoes.ts --aplicar
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const aplicar = process.argv.includes("--aplicar");

type Conta = { id: string; nome: string; email: string; cpf: string | null; organization_id: string | null };

async function main() {
  const contas = await prisma.$queryRaw<Conta[]>`
    select id, nome, email, cpf, organization_id
      from public.portal_clients
     where role = 'CLIENT' and organization_id is null
     order by email
  `;

  if (!contas.length) {
    console.log("Nenhuma conta CLIENT sem vínculo.");
    return;
  }

  const vinculadas: string[] = [];
  const semCandidato: string[] = [];
  const ambiguas: string[] = [];

  for (const conta of contas) {
    const email = conta.email.trim().toLowerCase();
    const documento = conta.cpf?.replace(/\D/g, "") || null;

    const porEmail = await prisma.organization.findMany({
      where: { contacts: { some: { email: { equals: email, mode: "insensitive" } } } },
      select: { id: true, name: true },
      take: 3,
    });
    let candidatos = porEmail;
    if (!candidatos.length && documento) {
      candidatos = await prisma.organization.findMany({ where: { cpfCnpj: documento }, select: { id: true, name: true }, take: 3 });
    }
    // Domínio do e-mail x slug da organização: metade da carteira tem o próprio
    // domínio como slug (brilhax.com, tuitecnologia.com.br). Provedor genérico
    // fica de fora — gmail.com casaria com qualquer um.
    const dominio = email.split("@")[1] ?? "";
    const GENERICOS = ["gmail.com", "hotmail.com", "outlook.com", "yahoo.com", "icloud.com", "bol.com.br", "uol.com.br", "terra.com.br", "exemplo.com"];
    if (!candidatos.length && dominio && !GENERICOS.includes(dominio)) {
      candidatos = await prisma.organization.findMany({
        where: { OR: [{ slug: dominio }, { slug: dominio.replace(/^www\./, "") }] },
        select: { id: true, name: true },
        take: 3,
      });
    }

    if (candidatos.length === 0) {
      semCandidato.push(`${conta.email} (${conta.nome})`);
      continue;
    }
    if (candidatos.length > 1) {
      ambiguas.push(`${conta.email} → ${candidatos.map((c) => c.name).join(" | ")}`);
      continue;
    }

    const alvo = candidatos[0];
    vinculadas.push(`${conta.email} → ${alvo.name}`);
    if (aplicar) {
      await prisma.$executeRaw`
        update public.portal_clients set organization_id = ${alvo.id}
         where id = ${conta.id} and organization_id is null
      `;
    }
  }

  console.log(`${aplicar ? "Vinculadas" : "Vincularia"}: ${vinculadas.length}`);
  vinculadas.forEach((l) => console.log("  ✓", l));
  if (ambiguas.length) {
    console.log(`\nAmbíguas (mais de uma empresa, decidir à mão): ${ambiguas.length}`);
    ambiguas.forEach((l) => console.log("  ?", l));
  }
  if (semCandidato.length) {
    console.log(`\nSem empresa correspondente: ${semCandidato.length}`);
    semCandidato.forEach((l) => console.log("  -", l));
  }
  if (!aplicar) console.log("\nModo seco. Rode com --aplicar para gravar.");
}

main().finally(() => prisma.$disconnect());

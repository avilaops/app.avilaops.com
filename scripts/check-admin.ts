import { prisma } from "../src/lib/prisma";

async function main() {
  const admins = await prisma.adminIdentity.findMany({
    select: {
      id: true,
      nome: true,
      email: true,
      cpf: true,
      role: true,
      senhaProvisoria: true,
    },
  });
  console.log("=== ADMINS NO BANCO DE DADOS DE DESENVOLVIMENTO ===");
  console.log(JSON.stringify(admins, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());

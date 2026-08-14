import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";

async function main() {
  // A validação do login exige senha com no mínimo 6 caracteres!
  const password6Char = "admin123";
  const hash = await bcrypt.hash(password6Char, 10);

  await prisma.adminIdentity.updateMany({
    where: { role: "ADMIN" },
    data: {
      senhaHash: hash,
      senhaProvisoria: false,
    },
  });

  console.log("=========================================");
  console.log("SENHAS DE ADMIN ATUALIZADAS COM SUCESSO!");
  console.log(`Senha definida (>=6 caracteres): ${password6Char}`);
  console.log("Logins válidos:");
  console.log("1. nicolas@avilaops.com");
  console.log("2. nicolasrosaab@gmail.com");
  console.log("=========================================");
}

main().catch(console.error).finally(() => prisma.$disconnect());

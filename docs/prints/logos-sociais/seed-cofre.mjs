/**
 * Semente só para a conferência visual do cofre: um admin para entrar e uma
 * chave por categoria, para os grupos aparecerem com o logotipo do provedor.
 * Roda contra o Postgres descartável do scratchpad, nunca contra produção.
 */
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const CHAVES = [
  ["META_APP_ID", "meta", "1289… (id do app)", "ATIVO", false],
  ["META_APP_SECRET", "meta", "97ad…ead7", "ATIVO", true],
  ["WHATSAPP_PHONE_NUMBER_ID", "whatsapp", "5511… (número)", "ATIVO", false],
  ["WHATSAPP_TOKEN", "whatsapp", "EAAG…9fQZ", "ATIVO", true],
  ["INSTAGRAM_CLIENT_ID", "instagram", "7781… (client id)", "ATIVO", false],
  ["THREADS_APP_SECRET", "threads", "sem valor", "PENDENTE", true],
  ["GOOGLE_CLIENT_ID", "google", "4471…apps.googleusercontent.com", "ATIVO", false],
  ["GOOGLE_MAPS_ID", "google", "8c3f… (mapa)", "ATIVO", false],
  ["X_CONSUMER_KEY", "x", "Rt4k…9sQe", "ATIVO", true],
  ["MERCADO_PAGO_PUBLIC_KEY", "mercadopago", "APP_USR-…-b71f", "ATIVO", false],
  ["ML_CLIENT_SECRET", "mercadolivre", "sem valor", "PENDENTE", true],
  ["SENTRY_DSN", "outros", "https://…@o4507.ingest", "APOSENTADA", false],
];

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

  for (const [chave, categoria, mascara, status, segredo] of CHAVES) {
    await prisma.platformCredential.upsert({
      where: { chave },
      update: { categoria, mascara, status, segredo },
      create: { chave, categoria, mascara, status, segredo },
    });
  }

  console.log(`admin-visual e ${CHAVES.length} chaves prontos`);
}

main().finally(() => prisma.$disconnect());

/**
 * Registra o projeto da OpenAI na conexão de integração da organização.
 *
 *   npx tsx scripts/sync-openai-project.ts
 *
 * Por que isso importa: a chave da OpenAI é escopada por projeto. Guardar só o
 * ciphertext responde "com o que autenticamos", mas não "de qual projeto essa
 * chave é" — o que atrapalha na hora de conferir consumo no painel da OpenAI,
 * revogar a chave certa, ou provar de onde veio um gasto.
 *
 * Não toca na credencial: se já houver `tokenCiphertext`, ele é preservado.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const ORG = "avila-ops-internal";
const PROVIDER = "openai";
const PROJECT_ID = "proj_79rYtQCdJoU7Wcv3cKimgkCN";
const PROJECT_NAME = "Default project";

async function main() {
  const org = await prisma.organization.findUnique({
    where: { id: ORG },
    select: { id: true, name: true },
  });
  if (!org) throw new Error(`organização ${ORG} não existe neste banco`);

  const antes = await prisma.organizationIntegrationConnection.findUnique({
    where: { organizationId_provider: { organizationId: ORG, provider: PROVIDER } },
    select: { externalId: true, accountName: true, tokenCiphertext: true },
  });

  const conexao = await prisma.organizationIntegrationConnection.upsert({
    where: { organizationId_provider: { organizationId: ORG, provider: PROVIDER } },
    update: {
      externalId: PROJECT_ID,
      accountName: PROJECT_NAME,
      lastSyncedAt: new Date(),
      lastSyncStatus: "OK",
      lastSyncError: null,
      metadata: {
        projectId: PROJECT_ID,
        projectName: PROJECT_NAME,
        // Registrado porque muda o tratamento permitido do dado: com o
        // compartilhamento ligado, tráfego desta chave é usado para treino.
        dataSharing: "ENABLED_ALL_PROJECTS",
        freeTierDaily: "250k tokens (modelos grandes) / 2.5M (mini)",
        anotadoEm: "2026-08-14",
      },
    },
    create: {
      organizationId: ORG,
      provider: PROVIDER,
      externalId: PROJECT_ID,
      accountName: PROJECT_NAME,
      status: "ACTIVE",
      lastSyncedAt: new Date(),
      lastSyncStatus: "OK",
      metadata: { projectId: PROJECT_ID, projectName: PROJECT_NAME, anotadoEm: "2026-08-14" },
    },
    select: {
      externalId: true,
      accountName: true,
      status: true,
      lastSyncedAt: true,
      tokenCiphertext: true,
    },
  });

  console.log(`organização: ${org.name} (${org.id})`);
  console.log(`  externalId : ${antes?.externalId ?? "—"} -> ${conexao.externalId}`);
  console.log(`  accountName: ${antes?.accountName ?? "—"} -> ${conexao.accountName}`);
  console.log(`  status     : ${conexao.status}`);
  console.log(`  sincronizado em: ${conexao.lastSyncedAt?.toISOString()}`);
  console.log(
    `  credencial : ${conexao.tokenCiphertext ? `preservada (${conexao.tokenCiphertext.length} chars de ciphertext)` : "ausente"}`,
  );
}

main()
  .catch((error) => {
    console.error(String(error).slice(0, 300));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

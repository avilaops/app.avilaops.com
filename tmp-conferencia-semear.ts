// Arquivo temporário da conferência visual. Não entra no commit.
import bcrypt from "bcryptjs";
import { prisma } from "./src/lib/prisma";
import { salvarCredencial } from "./src/lib/credenciais";

const url = process.env.DATABASE_URL ?? "";
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url) || !url.includes("_test")) {
  throw new Error("só banco local descartável");
}

const ID = "prints-owner";

async function main() {
  const senhaHash = await bcrypt.hash("senha-de-teste-123", 10);
  await prisma.adminIdentity.upsert({
    where: { id: ID },
    update: { senhaHash, role: "OWNER", ativo: true },
    create: {
      id: ID,
      nome: "Pessoa Dona Exemplo",
      email: "dono@avilaops.example",
      senhaHash,
      senhaProvisoria: false,
      role: "OWNER",
    },
  });

  await salvarCredencial({ chave: "MP_ACCESS_TOKEN", valor: "APP_USR-0000111122223333-exemplo-ficticio" }, ID);
  await salvarCredencial({ chave: "META_APP_SECRET", valor: "segredo-ficticio-de-exemplo-0001" }, ID);

  const eventos = [
    ["DADOS_FISCAIS_DA_CASA_ATUALIZADOS", "IdentidadeDaCasa", "casa", { cnpj: "11222333000181", campos: ["cnpj"] }],
    ["CERTIFICADO_DA_CASA_ENVIADO", "IdentidadeDaCasa", "casa", { titular: "EMPRESA EXEMPLO LTDA", cnpj: "11222333000181", validoAte: "2027-03-15T12:00:00.000Z" }],
    ["CREDENCIAL_FINANCEIRA_ATUALIZADA", "PlatformCredential", "mercado-pago", { financeira: "Mercado Pago", chaves: ["MP_ACCESS_TOKEN", "MP_PUBLIC_KEY"] }],
    ["API_KEY_CREATED", "ChaveDeApi", "k1", { nome: "Automação de exemplo", prefixo: "avk_exemplo" }],
    ["IDENTIDADE_DA_CASA_RENOMEADA", "IdentidadeDaCasa", "casa", { nome: "Empresa Exemplo" }],
  ] as const;
  for (const [action, entityType, entityId, metadata] of eventos) {
    await prisma.operationsAuditEvent.create({
      data: { actorId: ID, action, entityType, entityId, metadata: metadata as object },
    });
  }
  console.log("semeado");
}

main().finally(() => prisma.$disconnect());

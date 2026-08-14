import { encryptSecret, decryptSecret } from "@avila-ops/ai-core";
import type { KeyProvider, TenantContext } from "@avila-ops/ai-core";
import { prisma } from "@/lib/prisma";

const PROVIDER = "openai";

function encryptionSecret(): string {
  const secret = process.env.AI_CORE_TOKEN_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error("AI_CORE_TOKEN_ENCRYPTION_KEY não configurado");
  }
  return secret;
}

/**
 * Resolve a chave OpenAI por organização, reaproveitando
 * OrganizationIntegrationConnection (mesmo modelo já usado para a conexão
 * Meta) com provider="openai". A credencial fica só como ciphertext no
 * banco e nunca é logada ou devolvida em resposta de API.
 */
export class PrismaKeyProvider implements KeyProvider {
  async getApiKey(tenant: TenantContext): Promise<string> {
    const connection = await prisma.organizationIntegrationConnection.findUnique({
      where: {
        organizationId_provider: {
          organizationId: tenant.organizationId,
          provider: PROVIDER,
        },
      },
    });

    if (!connection || connection.status !== "ACTIVE" || !connection.tokenCiphertext) {
      throw new AiCoreKeyNotConfiguredError(tenant.organizationId);
    }

    return decryptSecret(connection.tokenCiphertext, encryptionSecret());
  }
}

export class AiCoreKeyNotConfiguredError extends Error {
  constructor(organizationId: string) {
    super(`Nenhuma credencial OpenAI configurada para a organização ${organizationId}`);
    this.name = "AiCoreKeyNotConfiguredError";
  }
}

/**
 * Usado apenas por rotinas administrativas para gravar/rotacionar a chave.
 * Nunca expor via rota pública — só chamado a partir de scripts ou de uma
 * rota estritamente admin-only que não devolve o valor de volta.
 */
export async function storeOpenAiKey(organizationId: string, apiKey: string): Promise<void> {
  const ciphertext = encryptSecret(apiKey, encryptionSecret());
  await prisma.organizationIntegrationConnection.upsert({
    where: {
      organizationId_provider: { organizationId, provider: PROVIDER },
    },
    update: { status: "ACTIVE", tokenCiphertext: ciphertext },
    create: {
      organizationId,
      provider: PROVIDER,
      status: "ACTIVE",
      tokenCiphertext: ciphertext,
    },
  });
}

import { decryptSecret, encryptSecret } from "@avila-ops/ai-core";
import { prisma } from "@/lib/prisma";

/**
 * Cofre de credenciais por cliente (`OrganizationIntegrationConnection`).
 *
 * O segredo entra uma vez, vira ciphertext (AES-256-GCM, mesmo formato que o
 * núcleo de IA usa para a chave da OpenAI — assim `provider = "openai"` gravado
 * aqui é lido pelo `ai-core/key-provider` sem conversão) e nunca mais volta
 * para a tela. Quem precisa do valor chama `lerSegredo` no servidor.
 *
 * A chave de cifra é `AI_CORE_TOKEN_ENCRYPTION_KEY`. Trocá-la invalida tudo
 * que está guardado — não existe rotação automática; é decisão, não acidente.
 */
function chave(): string {
  const valor = process.env.AI_CORE_TOKEN_ENCRYPTION_KEY?.trim();
  if (!valor) throw new Error("AI_CORE_TOKEN_ENCRYPTION_KEY não configurado - o cofre está fechado.");
  return valor;
}

export function cofreDisponivel() {
  return Boolean(process.env.AI_CORE_TOKEN_ENCRYPTION_KEY?.trim());
}

export type CredencialResumo = {
  id: string;
  provider: string;
  accountName: string | null;
  externalId: string | null;
  status: string;
  tokenExpiresAt: string | null;
  temSegredo: boolean;
  nota: string | null;
  updatedAt: string;
};

export function resumirCredencial(c: {
  id: string;
  provider: string;
  accountName: string | null;
  externalId: string | null;
  status: string;
  tokenExpiresAt: Date | null;
  tokenCiphertext: string | null;
  metadata: unknown;
  updatedAt: Date;
}): CredencialResumo {
  const meta = c.metadata && typeof c.metadata === "object" ? (c.metadata as Record<string, unknown>) : {};
  return {
    id: c.id,
    provider: c.provider,
    accountName: c.accountName,
    externalId: c.externalId,
    status: c.status,
    tokenExpiresAt: c.tokenExpiresAt?.toISOString() ?? null,
    temSegredo: Boolean(c.tokenCiphertext),
    nota: typeof meta.nota === "string" ? meta.nota : null,
    updatedAt: c.updatedAt.toISOString(),
  };
}

export async function guardarCredencial(params: {
  organizationId: string;
  provider: string;
  segredo: string | null;
  accountName?: string | null;
  externalId?: string | null;
  tokenExpiresAt?: Date | null;
  nota?: string | null;
}) {
  const ciphertext = params.segredo ? encryptSecret(params.segredo, chave()) : undefined;
  const metadata = params.nota ? { nota: params.nota } : undefined;

  return prisma.organizationIntegrationConnection.upsert({
    where: { organizationId_provider: { organizationId: params.organizationId, provider: params.provider } },
    create: {
      organizationId: params.organizationId,
      provider: params.provider,
      accountName: params.accountName ?? null,
      externalId: params.externalId ?? null,
      tokenExpiresAt: params.tokenExpiresAt ?? null,
      tokenType: ciphertext ? "secret" : null,
      tokenCiphertext: ciphertext ?? null,
      status: "ACTIVE",
      metadata,
    },
    update: {
      accountName: params.accountName ?? null,
      externalId: params.externalId ?? null,
      tokenExpiresAt: params.tokenExpiresAt ?? null,
      ...(ciphertext ? { tokenCiphertext: ciphertext, tokenType: "secret" } : {}),
      status: "ACTIVE",
      ...(metadata ? { metadata } : {}),
    },
  });
}

/** Só no servidor. Devolve `null` quando não há credencial ou segredo. */
export async function lerSegredo(organizationId: string, provider: string): Promise<string | null> {
  const c = await prisma.organizationIntegrationConnection.findUnique({
    where: { organizationId_provider: { organizationId, provider } },
    select: { tokenCiphertext: true, status: true },
  });
  if (!c?.tokenCiphertext || c.status !== "ACTIVE") return null;
  return decryptSecret(c.tokenCiphertext, chave());
}

import { NextResponse } from "next/server";
import { AiCoreClient } from "@avila-ops/ai-core";
import { getAdmin } from "@/lib/auth";
import { checkRateLimit } from "@/lib/ai-core/rate-limit";
import { AiCoreKeyNotConfiguredError, PrismaKeyProvider } from "@/lib/ai-core/key-provider";
import { PrismaTelemetrySink } from "@/lib/ai-core/telemetry-sink";
import { PrismaSpendGuard } from "@/lib/ai-core/spend-guard";
import { assertAiCoreAvailable, AiCoreDisabledError } from "@/lib/ai-core/feature-flag";

const INTERNAL_ORGANIZATION_ID = "avila-ops-internal";
const INTERNAL_PROJECT_ID = "ai-core-validation";
const VALIDATION_MODEL = "gpt-4o-mini";

/**
 * Rota administrativa para validar que o Ávila AI Core está corretamente
 * configurado e consegue completar uma chamada real à OpenAI de ponta a
 * ponta (cliente, telemetria, spend guard). Nunca aceita nem devolve
 * credencial — o tenant é sempre a organização interna, determinado pelo
 * servidor, nunca pelo corpo da requisição.
 *
 * Protegida por AI_CORE_ENABLED + kill switch global: enquanto qualquer um
 * dos dois estiver desativado, esta rota sempre responde NOT_CONFIGURED sem
 * tentar nenhuma chamada.
 */
export async function POST() {
  const admin = await getAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  try {
    assertAiCoreAvailable();
  } catch (error) {
    if (error instanceof AiCoreDisabledError) {
      return NextResponse.json({ status: "NOT_CONFIGURED" }, { status: 200 });
    }
    throw error;
  }

  const rateLimit = checkRateLimit(`ai-core-validate:${admin.id}`, 5, 60_000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Muitas tentativas. Aguarde antes de tentar novamente." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rateLimit.retryAfterMs / 1000)) } },
    );
  }

  const tenant = {
    organizationId: INTERNAL_ORGANIZATION_ID,
    projectId: INTERNAL_PROJECT_ID,
    agentId: "ai-core-self-check",
    actorId: admin.id,
  };

  const client = new AiCoreClient({
    keyProvider: new PrismaKeyProvider(),
    telemetrySink: new PrismaTelemetrySink(),
    spendGuard: new PrismaSpendGuard(),
    timeoutMs: 15_000,
  });

  try {
    const result = await client.complete({
      tenant,
      model: VALIDATION_MODEL,
      instructions: "Responda apenas com a palavra: ok",
      input: "Confirme que a integração está funcionando.",
    });

    return NextResponse.json({
      status: "SUCCESS",
      requestId: result.requestId,
      model: result.model,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      estimatedCostUsd: result.estimatedCostUsd,
      latencyMs: result.latencyMs,
    });
  } catch (error) {
    if (error instanceof AiCoreKeyNotConfiguredError) {
      return NextResponse.json({ status: "NOT_CONFIGURED" }, { status: 200 });
    }

    const message = error instanceof Error ? error.message : "Falha desconhecida";
    return NextResponse.json({ status: "ERROR", error: message }, { status: 502 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { SpendLimitExceededError, StructuredOutputValidationError } from "@avila-ops/ai-core";
import { getAdmin } from "@/lib/auth";
import { sameOrigin } from "@/lib/http";
import { AiCoreDisabledError, assertAiCoreAvailable } from "@/lib/ai-core/feature-flag";
import { AiCoreKeyNotConfiguredError } from "@/lib/ai-core/key-provider";
import { checkRateLimit } from "@/lib/ai-core/rate-limit";
import {
  OrganizacaoNaoEncontradaError,
  gerarPelaIa,
  gerarPelaReceita,
  gerarPelaSefaz,
  montarPainel,
} from "@/lib/cadastro-ia/assistente";

/**
 * Assistente de cadastro de um cliente.
 *
 * GET devolve a análise de completude e as sugestões esperando decisão. Não
 * depende da IA estar ligada: a análise é cálculo sobre o que já está no
 * banco, e é a parte da tela que sempre funciona.
 *
 * POST gera propostas novas. `origem=RECEITA_FEDERAL` lê a consulta de CNPJ
 * guardada e `origem=SEFAZ` lê o bloco do destinatário que a sincronização
 * fiscal gravou — nenhuma das duas faz chamada externa. `origem=IA` passa pelo
 * Ávila AI Core e só roda com AI_CORE_ENABLED=true, credencial configurada e
 * orçamento disponível.
 *
 * Nenhuma das três escreve na ficha: todas só enfileiram proposta para
 * revisão humana em /decidir.
 */

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  }

  const { id } = await params;

  try {
    return NextResponse.json(await montarPainel(id));
  } catch (error) {
    if (error instanceof OrganizacaoNaoEncontradaError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    throw error;
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  }
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });
  }

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { origem?: unknown } | null;
  const origem =
    body?.origem === "IA" || body?.origem === "SEFAZ" ? body.origem : "RECEITA_FEDERAL";

  try {
    // As duas origens documentais não tocam a rede nem a IA: leem o que outra
    // rotina já gravou no cadastro.
    if (origem === "RECEITA_FEDERAL") {
      const resumo = await gerarPelaReceita(id, admin.id);
      return NextResponse.json({ status: "SUCCESS", ...resumo, painel: await montarPainel(id) });
    }

    if (origem === "SEFAZ") {
      const resumo = await gerarPelaSefaz(id, admin.id);
      return NextResponse.json({ status: "SUCCESS", ...resumo, painel: await montarPainel(id) });
    }

    // Só a partir daqui existe chamada externa — e ela é barrada antes de
    // sair se o Core estiver desligado ou o kill switch acionado.
    assertAiCoreAvailable();

    // O limite é por admin e por cliente: gerar de novo para o mesmo cadastro
    // em sequência é quase sempre engano de clique, e cada rodada custa.
    const limite = checkRateLimit(`cadastro-ia:${admin.id}:${id}`, 3, 60_000);
    if (!limite.allowed) {
      return NextResponse.json(
        { error: "Muitas gerações seguidas para este cliente. Aguarde um instante." },
        {
          status: 429,
          headers: { "Retry-After": String(Math.ceil(limite.retryAfterMs / 1000)) },
        },
      );
    }

    const resumo = await gerarPelaIa(id, admin.id);
    return NextResponse.json({ status: "SUCCESS", ...resumo, painel: await montarPainel(id) });
  } catch (error) {
    if (error instanceof OrganizacaoNaoEncontradaError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof AiCoreDisabledError || error instanceof AiCoreKeyNotConfiguredError) {
      return NextResponse.json({ status: "NOT_CONFIGURED" }, { status: 200 });
    }
    if (error instanceof SpendLimitExceededError) {
      return NextResponse.json(
        { status: "SPEND_LIMIT", error: "Orçamento de IA do período esgotado." },
        { status: 200 },
      );
    }
    if (error instanceof StructuredOutputValidationError) {
      return NextResponse.json(
        { status: "ERROR", error: "O modelo respondeu fora do formato esperado. Tente de novo." },
        { status: 502 },
      );
    }

    const mensagem = error instanceof Error ? error.message : "Falha desconhecida";
    return NextResponse.json({ status: "ERROR", error: mensagem }, { status: 502 });
  }
}

/**
 * O que as três rotas de ação das telas têm em comum.
 *
 * Elas são finas de propósito: quem decide se um comando pode sair é o agente
 * (janela silenciosa, allowlist de origem, TTL de 60 s), e repetir essas
 * regras aqui criaria uma segunda verdade que um dia discorda da primeira.
 * O que é desta camada: quem é o operador, se o pedido veio da própria tela,
 * se o pedido está bem formado e deixar rastro do que foi feito.
 */
import { NextRequest, NextResponse } from "next/server";
import { ehDono, getAdmin, type AdminAtual } from "@/lib/auth";
import { AgenteIndisponivel, agenteConfigurado } from "@/lib/avila-tv";
import { sameOrigin } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

/**
 * Comandos que este painel oferece.
 *
 * A lista é curta de propósito e **não** é a lista do protocolo: `exibir` fica
 * de fora porque trocar o que uma tela mostra é decisão de conteúdo, tem
 * allowlist por dispositivo e nasce no n8n ou no painel do agente. Daqui saem
 * os comandos de operação, os que alguém usa olhando para uma tela que está
 * com problema, e só os que a página tem botão para mandar: `reiniciar`,
 * `dormir` e `acordar` apagam ou acendem a sala do cliente, e porta aberta sem
 * botão é porta que ninguém vigia.
 */
export const COMANDOS_DO_PAINEL: ReadonlySet<string> = new Set([
  "recarregar", "mensagem",
  // Só o cliente do tipo `agente` responde este: é uma leitura do inventário
  // da LAN. `dispositivo` (executar ação num aparelho) continua de fora: é
  // operação de outro assunto, e vai nascer onde esse assunto morar.
  "dispositivos",
]);

/** O aviso é um recado para quem está na frente da tela, não um cartaz. */
export const LIMITE_AVISO = 140;
/** O mesmo teto do campo de nome no formulário de vincular. */
export const LIMITE_NOME = 60;
/** Allowlist própria é exceção; mais que isto é configuração de agente, não de tela. */
export const LIMITE_ORIGENS = 20;
const LIMITE_ORIGEM = 300;

/**
 * Nega antes de qualquer trabalho; devolve o operador quando pode seguir.
 *
 * `somenteDono` é para o que não tem volta. Revogar apaga o token e o
 * histórico da tela passa a ser de um dispositivo morto: é irreversível, e o
 * irreversível fica atrás de `ehDono()` (regra de `src/lib/auth.ts`). O sócio
 * recarrega, avisa e vincula; não revoga.
 */
export async function operadorOuRecusa(
  request: NextRequest,
  { somenteDono = false }: { somenteDono?: boolean } = {},
): Promise<AdminAtual | NextResponse> {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  if (!sameOrigin(request)) return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });
  if (somenteDono && !ehDono(admin.role)) {
    return NextResponse.json({ error: "Só o dono da conta pode isto." }, { status: 403 });
  }
  if (!agenteConfigurado()) {
    return NextResponse.json({ error: "AVILA_TV_API_KEY não configurada neste ambiente." }, { status: 503 });
  }
  return admin;
}

export function ehResposta(v: AdminAtual | NextResponse): v is NextResponse {
  return v instanceof NextResponse;
}

/**
 * O texto do aviso, ou o motivo de recusá-lo.
 *
 * Passou do limite, recusa: cortar em silêncio faria a tela mostrar uma frase
 * pela metade que ninguém escreveu. O formulário já trava em 140; quem chega
 * aqui com mais veio por fora dele.
 */
export function lerAviso(bruto: unknown): { texto: string } | { erro: string } {
  const texto = typeof bruto === "string" ? bruto.trim() : "";
  if (!texto) return { erro: "Escreva o aviso que vai aparecer na tela." };
  if (texto.length > LIMITE_AVISO) return { erro: `O aviso passa de ${LIMITE_AVISO} caracteres (${texto.length}).` };
  return { texto };
}

/**
 * A allowlist própria pedida no vínculo, ou o motivo de recusá-la.
 *
 * O agente ignora em silêncio a entrada que não é URL: ela não casa com nada.
 * Só que uma allowlist própria, mesmo inútil, deixa de herdar a do agente, e
 * a tela passa a recusar todo `exibir` sem que ninguém entenda por quê. Por
 * isso a entrada torta é recusada aqui, na frente de quem digitou.
 */
export function lerOrigens(bruto: unknown): { origens: string[] } | { erro: string } {
  if (bruto === undefined || bruto === null) return { origens: [] };
  if (!Array.isArray(bruto)) return { erro: "As origens vêm como lista." };
  const origens = bruto.map((o) => (typeof o === "string" ? o.trim() : "")).filter(Boolean);
  if (origens.length > LIMITE_ORIGENS) return { erro: `No máximo ${LIMITE_ORIGENS} endereços na allowlist da tela.` };
  for (const origem of origens) {
    let url: URL;
    try {
      url = new URL(origem);
    } catch {
      return { erro: `Endereço inválido na allowlist: ${origem.slice(0, 80)}.` };
    }
    if ((url.protocol !== "https:" && url.protocol !== "http:") || origem.length > LIMITE_ORIGEM) {
      return { erro: `Endereço inválido na allowlist: ${origem.slice(0, 80)}.` };
    }
  }
  return { origens };
}

/**
 * Traduz a falha para quem está olhando a tela.
 *
 * O agente fora do ar é 503 e não 500: é o estado normal de um agente que
 * mora num PC de casa, e quem chamou precisa saber que o problema não é o
 * pedido dele. O código do protocolo (`janela_silenciosa_22h_07h`,
 * `origem_nao_autorizada`) volta em `erro` para a tela poder explicar.
 */
export function falha(erro: unknown): NextResponse {
  if (erro instanceof AgenteIndisponivel) {
    return NextResponse.json({ error: erro.message }, { status: 503 });
  }
  const e = erro instanceof Error ? erro : new Error(String(erro));
  return NextResponse.json({ error: e.message, erro: e.name !== "Error" ? e.name : undefined }, { status: 409 });
}

/**
 * Registra o que foi feito com uma tela.
 *
 * O agente já loga o comando no PC; isto é o outro lado da mesma história:
 * *quem* mandou, a partir deste painel. Sem isso, "quem revogou a tela da
 * cozinha?" não tem resposta depois que o log do agente rotaciona.
 *
 * Roda depois que o agente confirmou, e a falha dele não desfaz nada: o token
 * já foi apagado, a tela já recarregou. Devolver erro nessa hora faria o
 * operador repetir uma ação que deu certo (e revogar duas vezes devolve
 * `nao_pareado`). Então a resposta segue com `auditoria: false`, e o erro vai
 * para o log do servidor, que é onde alguém vai procurar.
 */
export async function anotar(
  admin: AdminAtual,
  action: string,
  entityId: string,
  metadata: Record<string, unknown>,
): Promise<boolean> {
  try {
    await prisma.operationsAuditEvent.create({
      data: { action, entityType: "AvilaTvScreen", entityId, actorId: admin.id, metadata: metadata as Prisma.InputJsonValue },
    });
    return true;
  } catch (erro) {
    console.error("[telas] a ação foi feita mas a auditoria falhou", { action, entityId, actorId: admin.id, erro });
    return false;
  }
}

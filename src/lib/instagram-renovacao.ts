import { prisma } from "@/lib/prisma";
import {
  INSTAGRAM_PROVIDER,
  renovarTokenInstagram,
} from "@/lib/instagram";

/**
 * Renovação automática do token do login próprio do Instagram.
 *
 * Por que existe: o token do Instagram vale 60 dias e a Meta **não renova
 * token vencido**. Passou da data, o único caminho é o cliente autorizar tudo
 * de novo — e quem descobre é o cliente, quando o painel para de mostrar o
 * Instagram dele. Sem esta rotina, toda conexão que der certo hoje quebra
 * sozinha daqui a dois meses.
 *
 * O caminho pelo Facebook (`lib/meta.ts`) não entra aqui: lá o token de Página
 * de longa duração não vence, e a renovação é outro endpoint, com outras
 * regras. Misturar os dois numa rotina só esconderia qual dos dois falhou.
 *
 * Quem chama: `POST /api/integrations/instagram/renovar`, uma vez por dia, com
 * a chave de serviço. Rodar mais de uma vez no dia não faz mal — quem está em
 * dia é pulado, e o retorno diz por quê.
 */

const DIA_MS = 24 * 60 * 60 * 1_000;

/**
 * Renova quando falta isto ou menos para vencer.
 *
 * Dez dias, e não um ou dois: a rotina roda diariamente, mas o servidor cai, o
 * agendador falha, e a Meta recusa renovação de token com menos de 24 h de
 * vida. Dez dias é a folga que permite falhar nove vezes seguidas sem ninguém
 * perder a conexão. Renovar mais cedo não custa nada — o token novo também
 * vale 60 dias contados do momento da renovação.
 */
export const JANELA_RENOVACAO_DIAS = 10;

/**
 * A Meta recusa renovar token com menos de 24 h. Na prática um token dentro da
 * janela já tem ~50 dias, mas conexão gravada sem validade conhecida pode ser
 * recém-nascida, e aí a recusa é esperada e não é defeito.
 */
export const IDADE_MINIMA_HORAS = 24;

export type SituacaoDoToken =
  /** Vencido: renovação é impossível, só reconectando. */
  | "VENCIDO"
  /** Dentro da janela e ainda válido: renovar agora. */
  | "RENOVAR"
  /** Validade confortável: não mexer. */
  | "EM_DIA"
  /** Conexão sem `token_expires_at` gravado: tentar, para descobrir a validade. */
  | "SEM_VALIDADE"
  /** Conexão sem token cifrado: não há o que renovar. */
  | "SEM_TOKEN";

export type ConexaoParaClassificar = {
  tokenCiphertext: string | null;
  tokenExpiresAt: Date | null;
};

/**
 * Decide o que fazer com uma conexão, sem tocar em rede nem em banco.
 *
 * Separada da rotina de propósito: é a regra que decide se um cliente perde ou
 * não o Instagram, e regra dessas se testa sozinha, sem subir Postgres.
 */
export function classificarToken(
  conexao: ConexaoParaClassificar,
  agora: Date = new Date(),
  janelaDias: number = JANELA_RENOVACAO_DIAS,
): SituacaoDoToken {
  if (!conexao.tokenCiphertext) return "SEM_TOKEN";
  if (!conexao.tokenExpiresAt) return "SEM_VALIDADE";

  const restanteMs = conexao.tokenExpiresAt.getTime() - agora.getTime();
  if (Number.isNaN(restanteMs)) return "SEM_VALIDADE";
  if (restanteMs <= 0) return "VENCIDO";
  return restanteMs <= janelaDias * DIA_MS ? "RENOVAR" : "EM_DIA";
}

export type ResultadoDaConexao = {
  organizationId: string;
  conexaoId: string;
  conta: string | null;
  situacao: SituacaoDoToken;
  /** O que a rotina fez: renovou, marcou como vencido, falhou ou não mexeu. */
  desfecho: "RENOVADO" | "VENCIDO" | "FALHOU" | "SEM_ACAO";
  /** Validade antes da rodada, em ISO — a evidência de por que agiu ou não. */
  expiravaEm: string | null;
  /** Validade depois, quando renovou. */
  expiraEm: string | null;
  erro?: string;
};

export type RelatorioDeRenovacao = {
  rodadaEm: string;
  janelaDias: number;
  avaliadas: number;
  renovadas: number;
  vencidas: number;
  falhas: number;
  semAcao: number;
  conexoes: ResultadoDaConexao[];
};

/**
 * Passa por todas as conexões do login próprio e renova as que estão na janela.
 *
 * Uma conexão que falha não derruba a rodada: são clientes diferentes, e o
 * cliente B não perde a renovação dele porque o token do cliente A foi
 * revogado. O erro de cada um fica gravado na própria conexão e volta no
 * relatório.
 */
export async function renovarTokensDoInstagram(opcoes?: {
  /** Limita a um cliente. Sem isto, roda em todos. */
  organizationId?: string;
  /** Quem pediu; nulo quando é o agendador e não uma pessoa. */
  actorId?: string | null;
  agora?: Date;
  janelaDias?: number;
}): Promise<RelatorioDeRenovacao> {
  const agora = opcoes?.agora ?? new Date();
  const janelaDias = opcoes?.janelaDias ?? JANELA_RENOVACAO_DIAS;
  const actorId = opcoes?.actorId ?? null;

  const conexoes = await prisma.organizationIntegrationConnection.findMany({
    where: {
      provider: INSTAGRAM_PROVIDER,
      ...(opcoes?.organizationId ? { organizationId: opcoes.organizationId } : {}),
    },
    select: {
      id: true,
      organizationId: true,
      accountName: true,
      status: true,
      tokenCiphertext: true,
      tokenExpiresAt: true,
    },
    orderBy: { tokenExpiresAt: "asc" },
  });

  const resultados: ResultadoDaConexao[] = [];

  for (const conexao of conexoes) {
    const situacao = classificarToken(conexao, agora, janelaDias);
    const base = {
      organizationId: conexao.organizationId,
      conexaoId: conexao.id,
      conta: conexao.accountName,
      situacao,
      expiravaEm: conexao.tokenExpiresAt?.toISOString() ?? null,
      expiraEm: null as string | null,
    };

    if (situacao === "EM_DIA" || situacao === "SEM_TOKEN") {
      resultados.push({ ...base, desfecho: "SEM_ACAO" });
      continue;
    }

    if (situacao === "VENCIDO") {
      // Não adianta chamar a Meta: token vencido não renova. O que resta é a
      // tela dizer a verdade, para alguém pedir a reconexão ao cliente em vez
      // de descobrir pelo Instagram sumido do painel.
      if (conexao.status !== "EXPIRED") {
        await prisma.organizationIntegrationConnection.update({
          where: { id: conexao.id },
          data: {
            status: "EXPIRED",
            lastSyncStatus: "TOKEN_EXPIRED",
            lastSyncError:
              "Token do Instagram vencido. A Meta não renova token vencido: o cliente precisa autorizar de novo em Conectar Instagram.",
          },
        });
        await registrarAuditoria({
          actorId,
          organizationId: conexao.organizationId,
          action: "INSTAGRAM_TOKEN_EXPIRED",
          entityId: conexao.id,
          metadata: { conta: conexao.accountName, expirouEm: base.expiravaEm },
        });
      }
      resultados.push({ ...base, desfecho: "VENCIDO" });
      continue;
    }

    try {
      const { tokenExpiresAt } = await renovarTokenInstagram(conexao.organizationId);
      const expiraEm = tokenExpiresAt?.toISOString() ?? null;
      await registrarAuditoria({
        actorId,
        organizationId: conexao.organizationId,
        action: "INSTAGRAM_TOKEN_RENEWED",
        entityId: conexao.id,
        metadata: { conta: conexao.accountName, expiravaEm: base.expiravaEm, expiraEm },
      });
      resultados.push({ ...base, desfecho: "RENOVADO", expiraEm });
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      await prisma.organizationIntegrationConnection.update({
        where: { id: conexao.id },
        data: { lastSyncStatus: "REFRESH_FAILED", lastSyncError: mensagem },
      });
      await registrarAuditoria({
        actorId,
        organizationId: conexao.organizationId,
        action: "INSTAGRAM_TOKEN_RENEWAL_FAILED",
        entityId: conexao.id,
        metadata: { conta: conexao.accountName, expiravaEm: base.expiravaEm, erro: mensagem },
      });
      resultados.push({ ...base, desfecho: "FALHOU", erro: mensagem });
    }
  }

  return {
    rodadaEm: agora.toISOString(),
    janelaDias,
    avaliadas: resultados.length,
    renovadas: resultados.filter((r) => r.desfecho === "RENOVADO").length,
    vencidas: resultados.filter((r) => r.desfecho === "VENCIDO").length,
    falhas: resultados.filter((r) => r.desfecho === "FALHOU").length,
    semAcao: resultados.filter((r) => r.desfecho === "SEM_ACAO").length,
    conexoes: resultados,
  };
}

async function registrarAuditoria(entrada: {
  actorId: string | null;
  organizationId: string;
  action: string;
  entityId: string;
  metadata: Record<string, unknown>;
}) {
  await prisma.operationsAuditEvent.create({
    data: {
      actorId: entrada.actorId,
      organizationId: entrada.organizationId,
      action: entrada.action,
      entityType: "OrganizationIntegrationConnection",
      entityId: entrada.entityId,
      metadata: entrada.metadata as object,
    },
  });
}

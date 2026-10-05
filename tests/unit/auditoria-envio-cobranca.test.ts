import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A lista das intenções de envio que ficaram sem desfecho — o "pode ter saído
 * e não sei" que `responderEnvio` deixa quando o banco cai entre o envio e o
 * segundo registro. Até aqui nada lia esses eventos.
 */

type Evento = {
  id: bigint;
  actorId: string | null;
  organizationId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: unknown;
  createdAt: Date;
};

const { banco } = vi.hoisted(() => ({ banco: { eventos: [] as unknown[], consultas: 0 } }));

type Filtro = {
  action?: string | { in: string[] };
  organizationId?: string;
  createdAt?: { gte?: Date; lte?: Date };
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    operationsAuditEvent: {
      // O filtro que o Prisma aplicaria, para a função não passar por acaso.
      findMany: async ({ where, orderBy }: { where: Filtro; orderBy?: { createdAt: "desc" } }) => {
        banco.consultas += 1;
        const achados = (banco.eventos as Evento[]).filter((e) => {
          const acao = where.action;
          if (typeof acao === "string" && e.action !== acao) return false;
          if (acao && typeof acao === "object" && !acao.in.includes(e.action)) return false;
          if (where.organizationId && e.organizationId !== where.organizationId) return false;
          if (where.createdAt?.gte && e.createdAt < where.createdAt.gte) return false;
          if (where.createdAt?.lte && e.createdAt > where.createdAt.lte) return false;
          return true;
        });
        return orderBy ? [...achados].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()) : achados;
      },
    },
  },
}));

const { listarEnviosSemDesfecho } = await import("@/lib/auditoria-envio-cobranca");

const AGORA = new Date("2026-10-05T12:00:00Z");
const haMinutos = (minutos: number) => new Date(AGORA.getTime() - minutos * 60_000);

let proximoId = BigInt(100);
function intencao(extra: Partial<Evento> = {}): Evento {
  const evento: Evento = {
    id: proximoId++,
    actorId: "admin-1",
    organizationId: "org-1",
    action: "COBRANCA_ENVIO_INICIADO",
    entityType: "SubscriptionInvoice",
    entityId: "fatura-1",
    metadata: { canal: "email", conteudo: "cobranca", teste: false },
    createdAt: haMinutos(30),
    ...extra,
  };
  banco.eventos.push(evento);
  return evento;
}
function desfecho(da: Evento, action: string, extra: Partial<Evento> = {}) {
  banco.eventos.push({
    id: proximoId++,
    actorId: da.actorId,
    organizationId: da.organizationId,
    action,
    entityType: da.entityType,
    entityId: da.entityId,
    metadata: { canal: "email", tentativaId: String(da.id) },
    createdAt: new Date(da.createdAt.getTime() + 2_000),
    ...extra,
  });
}

beforeEach(() => {
  banco.eventos = [];
  banco.consultas = 0;
  proximoId = BigInt(100);
});

describe("listarEnviosSemDesfecho", () => {
  it("devolve só a intenção que nenhum desfecho fechou", async () => {
    const enviada = intencao({ createdAt: haMinutos(50) });
    desfecho(enviada, "COBRANCA_ENVIADA");
    const orfa = intencao({ createdAt: haMinutos(40), entityId: "fatura-2" });

    expect(await listarEnviosSemDesfecho({ agora: AGORA })).toEqual([
      {
        tentativaId: String(orfa.id),
        iniciadoEm: haMinutos(40),
        actorId: "admin-1",
        organizationId: "org-1",
        entityType: "SubscriptionInvoice",
        entityId: "fatura-2",
        pedido: { canal: "email", conteudo: "cobranca", teste: false },
      },
    ]);
  });

  it("qualquer um dos quatro desfechos fecha a intenção", async () => {
    for (const action of ["COBRANCA_ENVIADA", "COBRANCA_ENVIO_FALHOU", "COBRANCA_ENVIO_RECUSADO", "COBRANCA_ENVIO_ERRO"]) {
      desfecho(intencao(), action);
    }

    expect(await listarEnviosSemDesfecho({ agora: AGORA })).toEqual([]);
  });

  it("o desfecho fecha pela tentativa, não pela fatura: outro envio da mesma fatura continua aberto", async () => {
    const primeira = intencao({ createdAt: haMinutos(50) });
    const segunda = intencao({ createdAt: haMinutos(20) });
    desfecho(segunda, "COBRANCA_ENVIADA");

    const pendentes = await listarEnviosSemDesfecho({ agora: AGORA });

    expect(pendentes.map((p) => p.tentativaId)).toEqual([String(primeira.id)]);
  });

  it("desfecho gravado em outra entidade ou sem cliente fecha do mesmo jeito", async () => {
    // O "enviado" aponta para a cobrança; recusado e erro antigos saíam sem cliente.
    const a = intencao();
    desfecho(a, "COBRANCA_ENVIADA", { entityType: "SubscriptionCharge", entityId: "cobranca-1" });
    const b = intencao();
    desfecho(b, "COBRANCA_ENVIO_RECUSADO", { organizationId: null });

    expect(await listarEnviosSemDesfecho({ organizationId: "org-1", agora: AGORA })).toEqual([]);
  });

  it("filtra pelo cliente quando pedido", async () => {
    intencao({ organizationId: "org-1" });
    const doOutro = intencao({ organizationId: "org-2" });
    intencao({ organizationId: null });

    const pendentes = await listarEnviosSemDesfecho({ organizationId: "org-2", agora: AGORA });

    expect(pendentes.map((p) => p.tentativaId)).toEqual([String(doOutro.id)]);
    expect(await listarEnviosSemDesfecho({ agora: AGORA })).toHaveLength(3);
  });

  it("envio que acabou de começar ainda não é pendência: respeita a carência", async () => {
    const emCurso = intencao({ createdAt: new Date(AGORA.getTime() - 5_000) });

    expect(await listarEnviosSemDesfecho({ agora: AGORA })).toEqual([]);
    const semCarencia = await listarEnviosSemDesfecho({ agora: AGORA, carenciaMs: 0 });
    expect(semCarencia.map((p) => p.tentativaId)).toEqual([String(emCurso.id)]);
  });

  it("olha 30 dias para trás por padrão, ou desde quando for pedido; as mais recentes primeiro", async () => {
    const velha = intencao({ createdAt: haMinutos(60 * 24 * 45) });
    const antiga = intencao({ createdAt: haMinutos(60 * 24 * 10) });
    const recente = intencao({ createdAt: haMinutos(60) });

    expect((await listarEnviosSemDesfecho({ agora: AGORA })).map((p) => p.tentativaId)).toEqual([
      String(recente.id),
      String(antiga.id),
    ]);
    const tudo = await listarEnviosSemDesfecho({ agora: AGORA, desde: haMinutos(60 * 24 * 60) });
    expect(tudo.map((p) => p.tentativaId)).toEqual([String(recente.id), String(antiga.id), String(velha.id)]);
  });

  it("sem intenção na janela, não consulta os desfechos", async () => {
    expect(await listarEnviosSemDesfecho({ agora: AGORA })).toEqual([]);
    expect(banco.consultas).toBe(1);
  });
});

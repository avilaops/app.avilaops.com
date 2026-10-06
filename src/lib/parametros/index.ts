import { prisma } from "@/lib/prisma";
import { definicaoDe, type Camada, type EstadoParametro } from "@/lib/parametros/catalogo";
import { dataDoEvento, ESCOPO_GLOBAL, resolver, type Resolucao, type VersaoParametro } from "@/lib/parametros/resolver";
import { validarNovaVersao, type EntradaVersao } from "@/lib/parametros/validacao";

/**
 * A camada de políticas e parâmetros: todo prazo, limite ou lista que decide
 * algo sobre domínio sai daqui, com a versão que o decidiu. Quem lê grava o
 * `versao.id` na auditoria do que fez — é a prova de qual regra valia.
 */

export { dataDoEvento, escoposDoDominio } from "@/lib/parametros/resolver";
export type { Resolucao, VersaoParametro } from "@/lib/parametros/resolver";

type Linha = Awaited<ReturnType<typeof prisma.policyParameterVersion.findMany>>[number];

function daLinha(l: Linha): VersaoParametro {
  return {
    id: l.id,
    chave: l.key,
    camada: l.layer as Camada,
    escopo: l.scope,
    valor: l.value,
    estado: l.state as EstadoParametro,
    fontes: l.sources,
    vigenteDesde: l.effectiveFrom.toISOString().slice(0, 10),
    revisarEm: l.reviewAt ? l.reviewAt.toISOString().slice(0, 10) : null,
    dono: l.owner,
    nota: l.note,
    registradaEm: l.createdAt.toISOString(),
    quem: l.actorId,
  };
}

export async function carregarVersoes(chaves?: string[]): Promise<VersaoParametro[]> {
  const linhas = await prisma.policyParameterVersion.findMany({
    where: chaves ? { key: { in: chaves } } : undefined,
    orderBy: [{ key: "asc" }, { scope: "asc" }, { effectiveFrom: "asc" }, { createdAt: "asc" }],
  });
  return linhas.map(daLinha);
}

/**
 * O valor de uma chave para um evento. `em` é o instante do evento (troca de
 * titular, vencimento); sem ele, agora.
 */
export async function lerParametro(
  chave: string,
  { escopos = [ESCOPO_GLOBAL], em = new Date() }: { escopos?: string[]; em?: Date } = {},
): Promise<Resolucao> {
  if (!definicaoDe(chave)) throw new Error(`Parâmetro fora do catálogo: ${chave}`);
  return resolver(await carregarVersoes([chave]), chave, { escopos, data: dataDoEvento(em) });
}

export class ErroDeParametro extends Error {
  constructor(public problemas: string[]) {
    super(problemas.join(" "));
  }
}

/**
 * Grava uma versão nova. Nunca altera nem apaga a anterior: a linha antiga
 * continua decidindo os eventos da época dela. Deixa evento de auditoria com o
 * valor de antes e o de depois.
 */
export async function registrarVersaoDeParametro(entrada: EntradaVersao, atorId: string) {
  const definicao = definicaoDe(entrada.chave);
  const versoes = await carregarVersoes();
  const hoje = dataDoEvento(new Date());
  const problemas = validarNovaVersao(entrada, versoes, hoje);
  if (!definicao || problemas.length) throw new ErroDeParametro(problemas);

  const escopo = entrada.escopo ?? ESCOPO_GLOBAL;
  const anterior = resolver(versoes, entrada.chave, { escopos: [escopo], data: entrada.vigenteDesde });
  const fontes = entrada.fontes.map((f) => f.trim()).filter(Boolean);

  const criada = await prisma.policyParameterVersion.create({
    data: {
      key: entrada.chave,
      layer: definicao.camada,
      scope: escopo,
      value: entrada.valor as never,
      state: entrada.estado,
      sources: fontes,
      effectiveFrom: new Date(`${entrada.vigenteDesde}T00:00:00Z`),
      reviewAt: entrada.revisarEm ? new Date(`${entrada.revisarEm}T00:00:00Z`) : null,
      owner: entrada.dono.trim(),
      note: entrada.nota?.trim() || null,
      actorId: atorId,
    },
  });

  await prisma.operationsAuditEvent.create({
    data: {
      actorId: atorId,
      action: "PARAMETRO_VERSAO_REGISTRADA",
      entityType: "PolicyParameterVersion",
      entityId: criada.id,
      metadata: {
        chave: entrada.chave,
        escopo,
        camada: definicao.camada,
        depois: { valor: entrada.valor, estado: entrada.estado, vigenteDesde: entrada.vigenteDesde, fontes },
        antes:
          anterior.tipo === "ausente"
            ? null
            : {
                id: anterior.versao.id,
                valor: anterior.versao.valor,
                estado: anterior.versao.estado,
                vigenteDesde: anterior.versao.vigenteDesde,
              },
      } as never,
    },
  });
  return daLinha(criada);
}

import { prisma } from "@/lib/prisma";

/**
 * O histórico da configuração da casa: quem mexeu no quê, e quando.
 *
 * Os eventos já eram gravados por cada rota — dados fiscais, certificado,
 * cofre, chaves de API. Faltava a tela: para saber quem revelou um token era
 * preciso consultar o banco. Aqui eles viram frase.
 *
 * Só entra evento desta lista. A tabela de auditoria é do painel inteiro
 * (cobrança, conciliação, cadastro), e o que a aba mostra é a empresa.
 */

type Metadados = Record<string, unknown>;

type Descricao = {
  titulo: string;
  /** O que foi afetado, em palavras de quem lê. Nunca um valor de segredo. */
  detalhe: (entityId: string | null, metadados: Metadados) => string | null;
  /** Ato que merece o olho: segredo visto em claro, tentativa recusada. */
  atencao?: boolean;
};

const texto = (valor: unknown) => (typeof valor === "string" && valor.trim() ? valor.trim() : null);

function dataCurta(valor: unknown) {
  const bruto = texto(valor);
  if (!bruto) return null;
  const data = new Date(bruto);
  if (Number.isNaN(data.getTime())) return null;
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Sao_Paulo" }).format(data);
}

const juntar = (...partes: Array<string | null>) => partes.filter(Boolean).join(" · ") || null;

export const ACOES_DA_CASA: Record<string, Descricao> = {
  DADOS_FISCAIS_DA_CASA_ATUALIZADOS: {
    titulo: "Dados fiscais atualizados",
    detalhe: (_id, m) => (texto(m.cnpj) ? `CNPJ ${texto(m.cnpj)}` : null),
  },
  IDENTIDADE_DA_CASA_RENOMEADA: {
    titulo: "Nome da empresa alterado",
    detalhe: (_id, m) => texto(m.nome),
  },
  ICONE_DA_CASA_TROCADO: { titulo: "Ícone da empresa trocado", detalhe: () => null },
  ICONE_DA_CASA_REMOVIDO: { titulo: "Ícone da empresa removido", detalhe: () => null },
  CERTIFICADO_DA_CASA_ENVIADO: {
    titulo: "Certificado digital enviado",
    detalhe: (_id, m) => {
      const validade = dataCurta(m.validoAte);
      return juntar(texto(m.titular), validade ? `válido até ${validade}` : null);
    },
  },
  CERTIFICADO_DA_CASA_REMOVIDO: { titulo: "Certificado digital removido", detalhe: () => null },
  PLATFORM_CREDENTIAL_SET: { titulo: "Credencial gravada", detalhe: (id) => id },
  PLATFORM_CREDENTIAL_REVEALED: { titulo: "Credencial revelada", detalhe: (id) => id, atencao: true },
  PLATFORM_CREDENTIAL_DELETED: { titulo: "Credencial removida", detalhe: (id) => id },
  CREDENCIAL_FINANCEIRA_ATUALIZADA: {
    titulo: "Chaves de banco atualizadas",
    detalhe: (id, m) => {
      const chaves = Array.isArray(m.chaves) ? m.chaves.filter((c): c is string => typeof c === "string") : [];
      return juntar(texto(m.financeira) ?? id, chaves.length ? chaves.join(", ") : null);
    },
  },
  CREDENCIAL_BANCO_LIVRE_GUARDADA: {
    titulo: "Campo de banco guardado",
    detalhe: (id, m) => juntar(texto(m.instituicao), texto(m.rotulo)) ?? id,
  },
  CREDENCIAL_BANCO_LIVRE_REMOVIDA: { titulo: "Campo de banco removido", detalhe: (id) => id },
  API_KEY_CREATED: {
    titulo: "Chave de API criada",
    detalhe: (_id, m) => juntar(texto(m.nome), texto(m.prefixo)),
  },
  API_KEY_REVOKED: { titulo: "Chave de API revogada", detalhe: (_id, m) => texto(m.prefixo) },
  CONFIRMACAO_DE_SENHA_RECUSADA: {
    titulo: "Senha de confirmação recusada",
    detalhe: () => "Alguém errou a senha ao tentar um ato protegido",
    atencao: true,
  },
};

export type EventoDaCasa = {
  id: string;
  titulo: string;
  detalhe: string | null;
  atencao: boolean;
  autor: string;
  quando: string;
};

/** Evento cru em frase. Devolve nulo para ação que não é da casa. */
export function descreverEvento(evento: {
  action: string;
  entityId: string | null;
  metadata: unknown;
}): Pick<EventoDaCasa, "titulo" | "detalhe" | "atencao"> | null {
  const descricao = ACOES_DA_CASA[evento.action];
  if (!descricao) return null;

  const metadados =
    evento.metadata && typeof evento.metadata === "object" && !Array.isArray(evento.metadata)
      ? (evento.metadata as Metadados)
      : {};

  return {
    titulo: descricao.titulo,
    detalhe: descricao.detalhe(evento.entityId, metadados),
    atencao: Boolean(descricao.atencao),
  };
}

export const LIMITE_DO_HISTORICO = 100;

export async function historicoDaCasa(limite = LIMITE_DO_HISTORICO): Promise<EventoDaCasa[]> {
  const eventos = await prisma.operationsAuditEvent.findMany({
    where: { action: { in: Object.keys(ACOES_DA_CASA) } },
    orderBy: { createdAt: "desc" },
    take: limite,
    select: { id: true, actorId: true, action: true, entityId: true, metadata: true, createdAt: true },
  });

  const idsDeAutor = [...new Set(eventos.map((e) => e.actorId).filter((id): id is string => Boolean(id)))];
  const autores = idsDeAutor.length
    ? await prisma.adminIdentity.findMany({
        where: { id: { in: idsDeAutor } },
        select: { id: true, nome: true },
      })
    : [];
  const nomePorId = new Map(autores.map((a) => [a.id, a.nome]));

  return eventos.flatMap((evento) => {
    const descricao = descreverEvento(evento);
    if (!descricao) return [];
    return [
      {
        id: evento.id.toString(),
        ...descricao,
        // Sem nome não se inventa um: o registro diz que o autor não é mais
        // uma conta conhecida, que é o que o banco sabe.
        autor: evento.actorId
          ? (nomePorId.get(evento.actorId) ?? "conta que não existe mais")
          : "sistema",
        quando: evento.createdAt.toISOString(),
      },
    ];
  });
}

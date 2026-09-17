import type { Evidencia } from "@/lib/evidencia";

/**
 * Apoio de auditoria das sub-rotas da Meta (Ativos, Campanhas, Leads).
 * Fica em components/meta porque só estas telas o usam; não é regra de
 * negócio.
 */

const CHAVE_SENSIVEL = /token|secret|segredo|password|senha|encrypted|cipher/i;

/**
 * Registro do Prisma → dado bruto seguro para a FolhaEvidencia:
 * - passa por JSON (Decimal vira string, Date vira ISO), o que também o torna
 *   serializável para o client component;
 * - remove qualquer chave com cara de token/segredo, em qualquer profundidade.
 */
export function brutoSeguro(registro: unknown): unknown {
  let copia: unknown;
  try {
    copia = JSON.parse(JSON.stringify(registro ?? null));
  } catch {
    return null;
  }
  return limpar(copia);
}

function limpar(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(limpar);
  if (valor && typeof valor === "object") {
    return Object.fromEntries(
      Object.entries(valor as Record<string, unknown>)
        .filter(([chave]) => !CHAVE_SENSIVEL.test(chave))
        .map(([chave, item]) => [chave, limpar(item)]),
    );
  }
  return valor;
}

function iso(data: Date | null | undefined): string | null {
  return data ? data.toISOString() : null;
}

/** Evidência de uma linha de tabela: um registro de uma tabela do Postgres. */
export function evidenciaDeRegistro({
  rotulo,
  modelo,
  id,
  gravadoEm,
  campoGravadoEm,
  lidoEm,
  registro,
  funcao,
}: {
  rotulo: string;
  modelo: string;
  id: string;
  gravadoEm: Date | null | undefined;
  campoGravadoEm: string;
  lidoEm: string;
  registro: unknown;
  funcao?: string;
}): Evidencia {
  return {
    rotulo,
    origem: `${modelo} (Postgres)`,
    funcao,
    formula: "registro importado da Graph API da Meta e gravado no Postgres",
    referencia: id,
    lidoEm,
    gravadoEm: iso(gravadoEm),
    observacao: gravadoEm ? `Gravado em = ${campoGravadoEm}.` : `${campoGravadoEm} vazio neste registro.`,
    bruto: brutoSeguro(registro),
  };
}

/**
 * A Marketing API devolve `account_status` numérico e `syncMetaBusiness()` grava
 * como string ("1", "2"…). Traduz para o nome do enum da Meta, em minúsculas,
 * para o BadgeStatus: "1" → "active" já tem rótulo; os demais aparecem
 * humanizados até entrarem em src/lib/status-rotulos.ts.
 * Fonte: https://developers.facebook.com/docs/marketing-api/reference/ad-account/ (account_status).
 */
const STATUS_CONTA_ANUNCIO: Record<string, string> = {
  "1": "active",
  "2": "disabled",
  "3": "unsettled",
  "7": "pending_risk_review",
  "8": "pending_settlement",
  "9": "in_grace_period",
  "100": "pending_closure",
  "101": "closed",
  "201": "any_active",
  "202": "any_closed",
};

export function statusContaAnuncio(accountStatus: string | null, status: string): string {
  if (!accountStatus) return status;
  return STATUS_CONTA_ANUNCIO[accountStatus.trim()] ?? accountStatus;
}

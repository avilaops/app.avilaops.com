import { prisma } from "@/lib/prisma";

/**
 * Score de crédito do CPF e do CNPJ.
 *
 * Não existe API de score para pessoa física (Serasa, Boa Vista, Quod e SPC
 * só mostram no app deles), e o score de empresa é contrato B2B. O que a casa
 * consegue é guardar cada leitura com data e olhar a série: subiu, caiu, há
 * quanto tempo ninguém confere. A tela nunca desenha um número que não veio
 * de uma leitura registrada.
 */

export const SUBJECT_KINDS = ["CPF", "CNPJ"] as const;
export type SubjectKind = (typeof SUBJECT_KINDS)[number];

export const SUBJECT_LABELS: Record<SubjectKind, string> = {
  CPF: "Pessoa física (CPF)",
  CNPJ: "Empresa (CNPJ)",
};

export const BUREAUS = ["SERASA", "BOA_VISTA", "QUOD", "SPC", "BANCO"] as const;
export type Bureau = (typeof BUREAUS)[number];

export const BUREAU_LABELS: Record<Bureau, string> = {
  SERASA: "Serasa",
  BOA_VISTA: "Boa Vista",
  QUOD: "Quod",
  SPC: "SPC Brasil",
  BANCO: "App do banco",
};

export function isSubjectKind(value: string): value is SubjectKind {
  return (SUBJECT_KINDS as readonly string[]).includes(value);
}

export function isBureau(value: string): value is Bureau {
  return (BUREAUS as readonly string[]).includes(value);
}

export type Faixa = {
  rotulo: "Baixo" | "Regular" | "Bom" | "Excelente";
  classe: "faixa-baixa" | "faixa-regular" | "faixa-boa" | "faixa-excelente";
};

/**
 * Faixas do Serasa (0–300 baixo, 301–500 regular, 501–700 bom, 701–1000
 * excelente), em proporção da escala, para valer também em escala de 100.
 */
export function faixaDoScore(score: number, maxScore = 1000): Faixa {
  const proporcao = maxScore > 0 ? score / maxScore : 0;
  if (proporcao <= 0.3) return { rotulo: "Baixo", classe: "faixa-baixa" };
  if (proporcao <= 0.5) return { rotulo: "Regular", classe: "faixa-regular" };
  if (proporcao <= 0.7) return { rotulo: "Bom", classe: "faixa-boa" };
  return { rotulo: "Excelente", classe: "faixa-excelente" };
}

export type LeituraScore = {
  id: string;
  subjectKind: SubjectKind;
  bureau: Bureau;
  score: number;
  maxScore: number;
  readAt: Date;
  source: string;
  note: string | null;
};

export type ResumoScore = {
  subjectKind: SubjectKind;
  /** Da mais recente para a mais antiga. */
  leituras: LeituraScore[];
  atual: LeituraScore | null;
  /** Leitura anterior do mesmo birô: score de birôs diferentes não se compara. */
  anterior: LeituraScore | null;
  variacao: number | null;
  /** Dias desde a última leitura, ou null sem leitura. */
  diasSemConferir: number | null;
};

function diasEntre(de: Date, ate: Date): number {
  return Math.max(0, Math.floor((ate.getTime() - de.getTime()) / 86_400_000));
}

/** Pura, para teste: recebe as leituras já ordenadas da mais nova para a mais velha. */
export function montarResumo(
  subjectKind: SubjectKind,
  leituras: LeituraScore[],
  hoje = new Date(),
): ResumoScore {
  const atual = leituras[0] ?? null;
  const anterior = atual
    ? (leituras.slice(1).find((leitura) => leitura.bureau === atual.bureau) ?? null)
    : null;
  return {
    subjectKind,
    leituras,
    atual,
    anterior,
    variacao: atual && anterior ? atual.score - anterior.score : null,
    diasSemConferir: atual ? diasEntre(atual.readAt, hoje) : null,
  };
}

export async function resumoDeCredito(): Promise<ResumoScore[]> {
  const registros = await prisma.creditScoreReading.findMany({
    orderBy: [{ readAt: "desc" }, { id: "desc" }],
    take: 200,
  });
  const leituras: LeituraScore[] = registros
    .filter((r) => isSubjectKind(r.subjectKind) && isBureau(r.bureau))
    .map((r) => ({
      id: r.id.toString(),
      subjectKind: r.subjectKind as SubjectKind,
      bureau: r.bureau as Bureau,
      score: r.score,
      maxScore: r.maxScore,
      readAt: r.readAt,
      source: r.source,
      note: r.note,
    }));
  return SUBJECT_KINDS.map((kind) =>
    montarResumo(
      kind,
      leituras.filter((leitura) => leitura.subjectKind === kind),
    ),
  );
}

/**
 * Evidência de um número na tela: responde "qual evidência produziu este
 * valor?". Todo campo é opcional de propósito — o que a fonte não informou
 * fica ausente e a folha mostra "sem evidência registrada", nunca um valor
 * plausível.
 */
export type Evidencia = {
  /** O que está sendo explicado, ex.: "Avaliações pendentes" */
  rotulo: string;
  /** De onde o valor veio: tabela, API ou função. Ex.: "integrationWebhookEvent (Postgres)" ou "Google Business Profile API" */
  origem?: string;
  /** Função/rota que calculou, ex.: "listBusinessLocations() em src/lib/google-mybusiness.ts" */
  funcao?: string;
  /** Como o valor foi derivado, em uma frase. Ex.: "soma de pendingReviews de todos os locais" */
  formula?: string;
  /** ISO 8601 de quando o dado foi lido da fonte */
  lidoEm?: string | null;
  /** ISO 8601 de quando foi gravado no banco (se houver persistência) */
  gravadoEm?: string | null;
  /** Identificador rastreável: id da linha, x-request-id, chave de idempotência */
  referencia?: string | null;
  /** Dado bruto que alimentou o valor; será mostrado como JSON */
  bruto?: unknown;
  /** Observação livre para o auditor */
  observacao?: string;
};

export type TomFrescor = "bom" | "atencao" | "ruim" | "neutro";

export type Frescor = { texto: string; tom: TomFrescor };

const SEGUNDO = 1_000;
const MINUTO = 60 * SEGUNDO;
const HORA = 60 * MINUTO;
const DIA = 24 * HORA;

const LIMITE_BOM = 5 * MINUTO;
const LIMITE_ATENCAO = 24 * HORA;

/**
 * Idade de uma leitura em linguagem de gente ("há 3 min") com um tom para a
 * cor. Recebe `agora` para ser testável sem relógio escondido.
 */
export function frescor(iso: string | null | undefined, agora: Date = new Date()): Frescor {
  if (!iso) return { texto: "sem leitura registrada", tom: "neutro" };

  const instante = new Date(iso).getTime();
  if (Number.isNaN(instante)) return { texto: "sem leitura registrada", tom: "neutro" };

  const idade = Math.max(0, agora.getTime() - instante);
  const tom: TomFrescor = idade <= LIMITE_BOM ? "bom" : idade <= LIMITE_ATENCAO ? "atencao" : "ruim";

  let texto: string;
  if (idade < MINUTO) texto = `há ${Math.floor(idade / SEGUNDO)} s`;
  else if (idade < HORA) texto = `há ${Math.floor(idade / MINUTO)} min`;
  else if (idade < DIA) texto = `há ${Math.floor(idade / HORA)} h`;
  else texto = `há ${Math.floor(idade / DIA)} d`;

  return { texto, tom };
}

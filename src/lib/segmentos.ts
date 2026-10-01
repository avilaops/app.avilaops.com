/**
 * Segmentos de cliente.
 *
 * A lista padrão é a de sempre; segmento novo nasce no próprio cadastro do
 * cliente e passa a aparecer para os próximos, porque a lista oferecida é a
 * padrão somada aos segmentos que já estão em uso. Sem tabela própria: um
 * segmento só existe enquanto algum cliente o usa, e não sobra opção morta.
 */

export const SEGMENTOS_PADRAO = [
  "Serviços profissionais",
  "Comércio e e-commerce",
  "Indústria e manutenção",
  "Logística e transporte",
  "Alimentação e bem-estar",
  "Tecnologia",
  "Construção e obras",
  "Outro",
] as const;

/** Padrão primeiro (na ordem de sempre), depois os criados, em ordem alfabética, sem repetir. */
export function listaDeSegmentos(emUso: ReadonlyArray<string | null>): string[] {
  const chave = (s: string) =>
    s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
  const vistos = new Set<string>(SEGMENTOS_PADRAO.map(chave));
  const extras: string[] = [];
  for (const bruto of emUso) {
    const s = bruto?.trim();
    if (!s || vistos.has(chave(s))) continue;
    vistos.add(chave(s));
    extras.push(s);
  }
  extras.sort((a, b) => a.localeCompare(b, "pt-BR"));
  const padrao = SEGMENTOS_PADRAO.filter((s) => s !== "Outro");
  return [...padrao, ...extras, "Outro"];
}

/**
 * Palpite de segmento pela divisão do CNAE principal (os dois primeiros
 * dígitos). É só sugestão para o select vir preenchido — quem cadastra troca.
 * Divisão que não se encaixa devolve nulo, em vez de chutar "Outro".
 */
export function segmentoPeloCnae(cnae: string | number | null | undefined): string | null {
  const divisao = Number(String(cnae ?? "").replace(/\D/g, "").padStart(7, "0").slice(0, 2));
  if (!divisao) return null;
  if (divisao >= 10 && divisao <= 33) return "Indústria e manutenção";
  if (divisao >= 41 && divisao <= 43) return "Construção e obras";
  if (divisao >= 45 && divisao <= 47) return "Comércio e e-commerce";
  if (divisao >= 49 && divisao <= 53) return "Logística e transporte";
  if (divisao === 55 || divisao === 56 || divisao === 86 || divisao === 93 || divisao === 96) {
    return "Alimentação e bem-estar";
  }
  if (divisao >= 58 && divisao <= 63) return "Tecnologia";
  if (divisao >= 69 && divisao <= 75) return "Serviços profissionais";
  return null;
}

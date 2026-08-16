/**
 * Parcelamento com juros repassados ao pagador.
 *
 * A EFI cobra da loja uma taxa maior quanto mais parcelas o comprador escolhe.
 * Absorver isso significa receber menos por vender a mesma mensalidade — e
 * quem escolhe o número de parcelas é o cliente, não a Avila Ops. Então o juros
 * vai para quem decide.
 *
 * **À vista é sem juros**, sempre: quem paga em 1x não deve nada pelo crédito
 * de ninguém, e cobrar acréscimo em 1x é o tipo de linha que o cliente lê como
 * má-fé.
 *
 * O cálculo é Tabela Price — a mesma de qualquer financiamento, e a que o
 * cliente encontra se conferir numa calculadora online:
 *
 *     parcela = valor × i / (1 − (1 + i)^−n)
 *
 * Feito por nós e não delegado ao painel da EFI de propósito: assim o valor
 * que aparece na tela é o mesmo que é cobrado, calculado pelo mesmo código, e
 * não depende de uma configuração remota que ninguém lembra de conferir.
 */

/** 3,99% ao mês, decidido em 16/08/2026. Cobre a taxa da EFI com margem. */
export const TAXA_MENSAL = 0.0399;

export const PARCELAS_MAXIMAS = 12;

/** Até aqui não há acréscimo. Uma parcela é à vista. */
export const PARCELAS_SEM_JUROS = 1;

export type OpcaoParcelamento = {
  parcelas: number;
  /** Quanto sai por mês, em centavos. */
  valorParcelaCents: number;
  /** O que o cliente paga no fim, em centavos. */
  totalCents: number;
  /** Quanto disso é juros. Zero na parcela única. */
  jurosCents: number;
};

/**
 * Uma opção por número de parcelas, da à vista até o teto.
 *
 * O arredondamento é da PARCELA, e o total é a parcela vezes n — nunca o
 * contrário. Arredondar o total e dividir produziria "12x de R$ 31,63" com
 * total R$ 379,50, e o cliente que multiplica encontra R$ 379,56. Diferença de
 * seis centavos numa tela de cobrança é o suficiente para gerar uma conversa
 * que ninguém quer ter.
 */
export function simularParcelamento(
  valorCents: number,
  opcoes: { taxaMensal?: number; parcelasMaximas?: number } = {},
): OpcaoParcelamento[] {
  const taxa = opcoes.taxaMensal ?? TAXA_MENSAL;
  const maximo = opcoes.parcelasMaximas ?? PARCELAS_MAXIMAS;

  const resultado: OpcaoParcelamento[] = [];

  for (let n = 1; n <= maximo; n += 1) {
    if (n <= PARCELAS_SEM_JUROS || taxa <= 0) {
      const valorParcelaCents = Math.round(valorCents / n);
      resultado.push({
        parcelas: n,
        valorParcelaCents,
        totalCents: valorCents,
        jurosCents: 0,
      });
      continue;
    }

    const fator = taxa / (1 - Math.pow(1 + taxa, -n));
    const valorParcelaCents = Math.round(valorCents * fator);
    const totalCents = valorParcelaCents * n;

    resultado.push({
      parcelas: n,
      valorParcelaCents,
      totalCents,
      jurosCents: totalCents - valorCents,
    });
  }

  return resultado;
}

/**
 * A opção escolhida, conferida.
 *
 * Existe porque o número de parcelas chega do navegador: recalcular no
 * servidor é o que impede alguém de mandar "12 parcelas" e o valor da à vista.
 */
export function opcaoParcelamento(
  valorCents: number,
  parcelas: number,
  opcoes: { taxaMensal?: number; parcelasMaximas?: number } = {},
): OpcaoParcelamento | null {
  return (
    simularParcelamento(valorCents, opcoes).find(
      (opcao) => opcao.parcelas === parcelas,
    ) ?? null
  );
}

import { CAMPOS_CADASTRO, type CampoCadastro, type OrigemCampo } from "./campos";

/**
 * Análise de completude do cadastro. É função pura sobre um retrato do
 * cliente: não consulta banco, não chama rede e não depende da IA estar
 * ligada. Com o Core desligado esta continua sendo a parte útil da tela —
 * ela responde "o que falta neste cadastro e quem consegue preencher".
 */

export type RetratoCadastro = {
  organization: Record<string, unknown>;
  profile: Record<string, unknown> | null;
  webPresence: Record<string, unknown> | null;
};

export type Lacuna = {
  chave: string;
  rotulo: string;
  grupo: string;
  /** Quem pode preencher, na ordem de preferência declarada no registro. */
  origens: OrigemCampo[];
  porque?: string;
};

export type AnaliseCadastro = {
  totalCampos: number;
  preenchidos: number;
  /** Percentual inteiro de 0 a 100, só dos campos que o registro conhece. */
  completude: number;
  lacunas: Lacuna[];
  /** Lacunas que a consulta de CNPJ já guardada consegue resolver. */
  preenchiveisPelaReceita: number;
  /** Lacunas que a IA pode redigir. */
  preenchiveisPelaIa: number;
  /** Lacunas que só o cliente responde — viram pergunta, não automação. */
  somenteComOCliente: number;
  /**
   * Se a contagem acima já considera a consulta de CNPJ. Quando falso, os
   * campos oficiais aparecem como "só o cliente responde" porque não há
   * consulta guardada — e a tela precisa dizer isso, senão a lista parece
   * arbitrária.
   */
  temConsultaDeCnpj: boolean;
};

/** Valor atual de um campo no retrato, normalizado para string ou null. */
export function valorAtual(retrato: RetratoCadastro, campo: CampoCadastro): string | null {
  const fonte =
    campo.destino === "organization"
      ? retrato.organization
      : campo.destino === "profile"
        ? retrato.profile
        : retrato.webPresence;

  const bruto = fonte?.[campo.coluna];
  if (typeof bruto !== "string") return null;
  const texto = bruto.trim();
  return texto.length > 0 ? texto : null;
}

/**
 * Se este cliente tem a consulta de CNPJ guardada. Sem ela a Receita não
 * resolve campo nenhum, por mais que o registro a liste como origem
 * possível — e é a mesma pergunta que decide o botão da tela, o filtro das
 * sugestões e a contagem da análise, então mora num lugar só.
 */
export function temConsultaDeCnpj(retrato: RetratoCadastro): boolean {
  const dados = retrato.organization.cnpjData;
  return Boolean(dados && typeof dados === "object" && !Array.isArray(dados));
}

/**
 * Quem consegue preencher este campo NESTE cliente, que não é o mesmo que o
 * registro permite em tese. Sem consulta de CNPJ guardada, "a Receita
 * resolve" é falso: o dado tem de vir da consulta ou da boca do cliente, e
 * dizer o contrário faz a tela prometer um clique que não preenche nada.
 */
function origensEfetivas(campo: CampoCadastro, temCnpj: boolean): OrigemCampo[] {
  if (temCnpj) return [...campo.origens];
  const restantes = campo.origens.filter((origem) => origem !== "RECEITA_FEDERAL");
  return restantes.length > 0 ? restantes : ["CLIENTE"];
}

export function analisarCadastro(retrato: RetratoCadastro): AnaliseCadastro {
  const lacunas: Lacuna[] = [];
  const temCnpj = temConsultaDeCnpj(retrato);

  for (const campo of CAMPOS_CADASTRO) {
    if (valorAtual(retrato, campo)) continue;
    lacunas.push({
      chave: campo.chave,
      rotulo: campo.rotulo,
      grupo: campo.grupo,
      origens: origensEfetivas(campo, temCnpj),
      porque: campo.porque,
    });
  }

  const totalCampos = CAMPOS_CADASTRO.length;
  const preenchidos = totalCampos - lacunas.length;

  return {
    totalCampos,
    preenchidos,
    completude: totalCampos === 0 ? 100 : Math.round((preenchidos / totalCampos) * 100),
    lacunas,
    preenchiveisPelaReceita: lacunas.filter((l) => l.origens.includes("RECEITA_FEDERAL")).length,
    preenchiveisPelaIa: lacunas.filter((l) => l.origens.includes("IA")).length,
    // "Só com o cliente" é o que nenhuma das duas automações alcança — é a
    // lista que vira pauta de conversa, não fila de processamento.
    somenteComOCliente: lacunas.filter(
      (l) => !l.origens.includes("RECEITA_FEDERAL") && !l.origens.includes("IA"),
    ).length,
    temConsultaDeCnpj: temCnpj,
  };
}

/** Só as lacunas que uma dada origem tem permissão de preencher. */
export function lacunasDaOrigem(analise: AnaliseCadastro, origem: OrigemCampo): Lacuna[] {
  return analise.lacunas.filter((lacuna) => lacuna.origens.includes(origem));
}

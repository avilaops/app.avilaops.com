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

export function analisarCadastro(retrato: RetratoCadastro): AnaliseCadastro {
  const lacunas: Lacuna[] = [];

  for (const campo of CAMPOS_CADASTRO) {
    if (valorAtual(retrato, campo)) continue;
    lacunas.push({
      chave: campo.chave,
      rotulo: campo.rotulo,
      grupo: campo.grupo,
      origens: [...campo.origens],
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
  };
}

/** Só as lacunas que uma dada origem tem permissão de preencher. */
export function lacunasDaOrigem(analise: AnaliseCadastro, origem: OrigemCampo): Lacuna[] {
  return analise.lacunas.filter((lacuna) => lacuna.origens.includes(origem));
}

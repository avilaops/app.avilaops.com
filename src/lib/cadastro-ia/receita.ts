import { campoPorChave } from "./campos";
import { valorAtual, type RetratoCadastro } from "./lacunas";
import type { SugestaoProposta } from "./sugestoes";

/**
 * Preenchimento a partir da consulta de CNPJ que já está guardada em
 * `organizations.cnpj_data` (BrasilAPI / Receita Federal, gravada quando o
 * cliente foi cadastrado). Não chama rede: lê o que o sistema já tem.
 *
 * Isto não é IA e não deveria ser — razão social e endereço têm fonte
 * oficial, e consultar essa fonte é sempre melhor do que pedir a um modelo
 * que deduza. A feature usa a mesma fila de revisão das sugestões da IA só
 * porque quem confere é a mesma pessoa, na mesma tela, com o mesmo cuidado.
 */

type DadosCnpj = Record<string, unknown>;

function texto(dados: DadosCnpj, chave: string): string | null {
  const bruto = dados[chave];
  if (typeof bruto !== "string") return null;
  const limpo = bruto.trim();
  return limpo.length > 0 ? limpo : null;
}

/**
 * O DDD e o telefone vêm colados em `ddd_telefone_1` ("1133334444"). Fica
 * legível antes de virar sugestão — ninguém confere um número sem separador.
 */
function formatarTelefone(valor: string): string {
  const digitos = valor.replace(/\D/g, "");
  if (digitos.length === 10) return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 6)}-${digitos.slice(6)}`;
  if (digitos.length === 11) return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 7)}-${digitos.slice(7)}`;
  return valor;
}

function formatarCep(valor: string): string {
  const digitos = valor.replace(/\D/g, "");
  return digitos.length === 8 ? `${digitos.slice(0, 5)}-${digitos.slice(5)}` : valor;
}

/**
 * O logradouro da Receita vem sem o tipo em alguns registros e com ele em
 * outros; `descricao_tipo_de_logradouro` existe quando veio separado.
 */
function logradouro(dados: DadosCnpj): string | null {
  const rua = texto(dados, "logradouro");
  if (!rua) return null;
  const tipo = texto(dados, "descricao_tipo_de_logradouro");
  if (!tipo) return rua;
  return rua.toUpperCase().startsWith(tipo.toUpperCase()) ? rua : `${tipo} ${rua}`;
}

/**
 * Monta as sugestões que a consulta de CNPJ resolve, ignorando os campos que
 * já têm valor — o assistente completa cadastro, nunca reescreve o que a
 * equipe digitou.
 */
export function sugestoesDaReceita(retrato: RetratoCadastro): SugestaoProposta[] {
  const dados = retrato.organization.cnpjData;
  if (!dados || typeof dados !== "object" || Array.isArray(dados)) return [];

  const cnpj = dados as DadosCnpj;

  const candidatos: Array<[string, string | null]> = [
    ["legalName", texto(cnpj, "razao_social")],
    ["segment", texto(cnpj, "cnae_fiscal_descricao")],
    ["email", texto(cnpj, "email")?.toLowerCase() ?? null],
    ["postalCode", texto(cnpj, "cep") ? formatarCep(texto(cnpj, "cep")!) : null],
    ["street", logradouro(cnpj)],
    ["number", texto(cnpj, "numero")],
    ["district", texto(cnpj, "bairro")],
    ["city", texto(cnpj, "municipio")],
    ["state", texto(cnpj, "uf")],
    [
      "phone",
      texto(cnpj, "ddd_telefone_1") ? formatarTelefone(texto(cnpj, "ddd_telefone_1")!) : null,
    ],
  ];

  const sugestoes: SugestaoProposta[] = [];

  for (const [chave, valor] of candidatos) {
    if (!valor) continue;
    const campo = campoPorChave(chave);
    if (!campo || !campo.origens.includes("RECEITA_FEDERAL")) continue;
    if (valorAtual(retrato, campo)) continue;

    sugestoes.push({
      campo: chave,
      valor: valor.slice(0, campo.tamanhoMaximo),
      origem: "RECEITA_FEDERAL",
      // Fato consultado na fonte oficial, não estimativa — mas a decisão de
      // gravar continua sendo de uma pessoa.
      confianca: "ALTA",
      justificativa: "Consulta de CNPJ guardada no cadastro (Receita Federal).",
    });
  }

  return sugestoes;
}

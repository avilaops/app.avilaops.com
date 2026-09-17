import { campoPorChave, cortarNoTamanho } from "./campos";
import { temRetratoDaSefaz, valorAtual, type RetratoCadastro } from "./lacunas";
import type { SugestaoProposta } from "./sugestoes";

/**
 * Preenchimento a partir do retrato do destinatário guardado pela
 * sincronização da SEFAZ (`organizations.sefaz_data`). Não chama rede: lê o
 * que a sincronização fiscal já gravou.
 *
 * Duas coisas separam esta origem da Receita Federal, e as duas aparecem na
 * tela:
 *
 * 1. Confiança MEDIA, não ALTA. O bloco `<dest>` foi escrito por um
 *    fornecedor, não pelo cliente nem pelo órgão. Endereço de entrega e dado
 *    desatualizado são casos comuns, não exceções.
 * 2. A justificativa nomeia a nota e a data. Quem revisa precisa poder
 *    perguntar "de quando é isto?" sem sair da tela — um endereço de uma nota
 *    de três anos atrás merece outra dose de desconfiança.
 *
 * O que esta origem desbloqueia e nenhuma outra alcança: a inscrição
 * estadual. Ela não vem na consulta de CNPJ e a IA nunca poderia inventá-la —
 * até aqui só restava perguntar ao cliente.
 */

type RetratoSefaz = Record<string, unknown>;

function texto(dados: RetratoSefaz, chave: string): string | null {
  const bruto = dados[chave];
  if (typeof bruto !== "string") return null;
  const limpo = bruto.trim();
  return limpo.length > 0 ? limpo : null;
}

/** Mesma formatação da origem Receita: número sem separador não se confere. */
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
 * A data de emissão em português, para a justificativa. Data inválida some da
 * frase em vez de virar "Invalid Date" na tela de quem revisa.
 */
function dataLegivel(valor: string | null): string | null {
  if (!valor) return null;
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return null;
  return data.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

export function sugestoesDaSefaz(retrato: RetratoCadastro): SugestaoProposta[] {
  if (!temRetratoDaSefaz(retrato)) return [];

  const dados = retrato.organization.sefazData as RetratoSefaz;

  const chave = texto(dados, "chaveAcesso");
  const emitida = dataLegivel(texto(dados, "dataEmissao"));
  const justificativa = [
    "Registrado por um fornecedor na NF-e",
    emitida ? `emitida em ${emitida}` : null,
    chave ? `(chave ${chave})` : null,
  ]
    .filter(Boolean)
    .join(" ")
    .concat(".");

  const cep = texto(dados, "cep");
  const telefone = texto(dados, "telefone");

  const candidatos: Array<[string, string | null]> = [
    ["legalName", texto(dados, "razaoSocial")],
    ["stateRegistration", texto(dados, "ie")],
    ["postalCode", cep ? formatarCep(cep) : null],
    ["street", texto(dados, "logradouro")],
    ["number", texto(dados, "numero")],
    ["district", texto(dados, "bairro")],
    ["city", texto(dados, "municipio")],
    ["state", texto(dados, "uf")],
    ["phone", telefone ? formatarTelefone(telefone) : null],
    ["email", texto(dados, "email")?.toLowerCase() ?? null],
  ];

  const sugestoes: SugestaoProposta[] = [];

  for (const [chaveCampo, valor] of candidatos) {
    if (!valor) continue;
    const campo = campoPorChave(chaveCampo);
    if (!campo || !campo.origens.includes("SEFAZ")) continue;
    if (valorAtual(retrato, campo)) continue;

    sugestoes.push({
      campo: chaveCampo,
      valor: cortarNoTamanho(valor, campo.tamanhoMaximo),
      origem: "SEFAZ",
      // Documento, mas escrito por terceiro: merece conferência, não fé.
      confianca: "MEDIA",
      justificativa,
    });
  }

  return sugestoes;
}

import { Prisma } from "@prisma/client";
import { isValidCnpj, onlyDigits } from "@/lib/cpf-cnpj";
import { cifrar, decifrar } from "@/lib/credenciais";
import { inspecionarCertificadoA1 } from "@/lib/fiscal/certificado";
import type { CertificadoA1Info } from "@/lib/fiscal/types";
import { prisma } from "@/lib/prisma";

/**
 * Os dados cadastrais e fiscais da própria Ávila Ops, e o certificado A1 dela.
 *
 * Moram na mesma linha única de `IdentidadeDaCasa` (id "casa"): nome, logo,
 * CNPJ e certificado são a mesma empresa, e separar em tabelas abriria a
 * pergunta "qual linha é a casa" que o singleton existe para não ter.
 *
 * É o que a emissão de nota de serviço vai ler. Até aqui o CNPJ da casa só
 * existia em documento e em conversa — nenhum código sabia qual era.
 */

const ID = "casa";

export const REGIMES_TRIBUTARIOS = [
  { valor: "SIMPLES_NACIONAL", rotulo: "Simples Nacional" },
  { valor: "MEI", rotulo: "MEI" },
  { valor: "LUCRO_PRESUMIDO", rotulo: "Lucro Presumido" },
  { valor: "LUCRO_REAL", rotulo: "Lucro Real" },
] as const;

export const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA",
  "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const;

export type DadosFiscaisDaCasa = {
  razaoSocial: string;
  cnpj: string;
  inscricaoMunicipal: string;
  inscricaoEstadual: string;
  regimeTributario: string;
  cnae: string;
  codigoServico: string;
  codigoTributacaoMunicipal: string;
  /** Texto, como a tela digita: "2,00". Vazio = não informado. */
  aliquotaIss: string;
  emailFiscal: string;
  telefone: string;
  site: string;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  municipio: string;
  uf: string;
  codigoMunicipioIbge: string;
};

export const CAMPOS_FISCAIS = [
  "razaoSocial", "cnpj", "inscricaoMunicipal", "inscricaoEstadual", "regimeTributario",
  "cnae", "codigoServico", "codigoTributacaoMunicipal", "aliquotaIss", "emailFiscal",
  "telefone", "site", "cep", "logradouro", "numero", "complemento", "bairro", "municipio",
  "uf", "codigoMunicipioIbge",
] as const satisfies ReadonlyArray<keyof DadosFiscaisDaCasa>;

export const DADOS_VAZIOS: DadosFiscaisDaCasa = Object.fromEntries(
  CAMPOS_FISCAIS.map((campo) => [campo, ""]),
) as DadosFiscaisDaCasa;

/** O que a nota de serviço não sai sem. A tela marca o que falta. */
export const CAMPOS_OBRIGATORIOS_NOTA: ReadonlyArray<keyof DadosFiscaisDaCasa> = [
  "razaoSocial", "cnpj", "inscricaoMunicipal", "regimeTributario", "codigoServico",
  "aliquotaIss", "cep", "logradouro", "numero", "bairro", "municipio", "uf",
  "codigoMunicipioIbge",
];

export class DadosInvalidos extends Error {}

/**
 * Valida e normaliza o que veio da tela. Pura, para o teste não precisar de
 * banco: documento vira só dígitos, UF vira maiúscula, alíquota vira número.
 *
 * Campo vazio é aceito — o cadastro se preenche aos poucos. O que não se aceita
 * é valor ERRADO: um CNPJ com dígito verificador inválido guardado aqui iria
 * parar no cabeçalho de toda nota emitida.
 */
export function normalizarDadosFiscais(entrada: Record<string, unknown>): {
  dados: Omit<DadosFiscaisDaCasa, "aliquotaIss"> & { aliquotaIss: number | null };
  erros: string[];
} {
  const texto = (campo: keyof DadosFiscaisDaCasa) => {
    const bruto = entrada[campo];
    return typeof bruto === "string" ? bruto.trim().slice(0, 200) : "";
  };
  const erros: string[] = [];

  const cnpj = onlyDigits(texto("cnpj"));
  if (cnpj && !isValidCnpj(cnpj)) erros.push("CNPJ inválido: confira os dígitos.");

  const regimeTributario = texto("regimeTributario");
  if (regimeTributario && !REGIMES_TRIBUTARIOS.some((r) => r.valor === regimeTributario)) {
    erros.push("Regime tributário desconhecido.");
  }

  const uf = texto("uf").toUpperCase();
  if (uf && !(UFS as readonly string[]).includes(uf)) erros.push("UF inválida.");

  const cep = onlyDigits(texto("cep"));
  if (cep && cep.length !== 8) erros.push("CEP precisa ter 8 dígitos.");

  const codigoMunicipioIbge = onlyDigits(texto("codigoMunicipioIbge"));
  if (codigoMunicipioIbge && codigoMunicipioIbge.length !== 7) {
    erros.push("Código IBGE do município precisa ter 7 dígitos.");
  }

  const cnae = onlyDigits(texto("cnae"));
  if (cnae && cnae.length !== 7) erros.push("CNAE precisa ter 7 dígitos.");

  const aliquotaTexto = texto("aliquotaIss").replace("%", "").replace(",", ".").trim();
  let aliquotaIss: number | null = null;
  if (aliquotaTexto) {
    const numero = Number(aliquotaTexto);
    // ISS vai de 2% a 5% pela LC 116; aceitar 0–10 deixa margem para regime
    // especial sem deixar passar um "200" digitado no lugar de "2,00".
    if (!Number.isFinite(numero) || numero < 0 || numero > 10) {
      erros.push("Alíquota do ISS precisa estar entre 0 e 10%.");
    } else {
      aliquotaIss = Math.round(numero * 100) / 100;
    }
  }

  const emailFiscal = texto("emailFiscal").toLowerCase();
  if (emailFiscal && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailFiscal)) {
    erros.push("E-mail fiscal inválido.");
  }

  return {
    dados: {
      razaoSocial: texto("razaoSocial"),
      cnpj,
      inscricaoMunicipal: texto("inscricaoMunicipal"),
      inscricaoEstadual: texto("inscricaoEstadual"),
      regimeTributario,
      cnae,
      codigoServico: texto("codigoServico"),
      codigoTributacaoMunicipal: texto("codigoTributacaoMunicipal"),
      aliquotaIss,
      emailFiscal,
      telefone: texto("telefone"),
      site: texto("site"),
      cep,
      logradouro: texto("logradouro"),
      numero: texto("numero"),
      complemento: texto("complemento"),
      bairro: texto("bairro"),
      municipio: texto("municipio"),
      uf,
      codigoMunicipioIbge,
    },
    erros,
  };
}

/** Os campos obrigatórios da nota que ainda estão vazios. */
export function faltandoParaNota(dados: DadosFiscaisDaCasa): Array<keyof DadosFiscaisDaCasa> {
  return CAMPOS_OBRIGATORIOS_NOTA.filter((campo) => !dados[campo]);
}

export async function dadosFiscaisDaCasa(): Promise<DadosFiscaisDaCasa> {
  const linha = await prisma.identidadeDaCasa.findUnique({ where: { id: ID } });
  if (!linha) return { ...DADOS_VAZIOS };

  const dados = { ...DADOS_VAZIOS };
  for (const campo of CAMPOS_FISCAIS) {
    const valor = linha[campo];
    if (valor === null || valor === undefined) continue;
    dados[campo] =
      campo === "aliquotaIss" ? Number(valor).toFixed(2).replace(".", ",") : String(valor);
  }
  return dados;
}

export async function salvarDadosFiscais(entrada: Record<string, unknown>, atorId: string) {
  const { dados, erros } = normalizarDadosFiscais(entrada);
  if (erros.length) throw new DadosInvalidos(erros.join(" "));

  // String vazia vira nulo no banco: "não informado" tem um jeito só de ser
  // escrito, e quem consulta não precisa testar as duas formas.
  const colunas = Object.fromEntries(
    Object.entries(dados).map(([campo, valor]) => [campo, valor === "" ? null : valor]),
  );

  await prisma.identidadeDaCasa.upsert({
    where: { id: ID },
    update: { ...colunas, atualizadoPor: atorId },
    create: { id: ID, ...colunas, atualizadoPor: atorId },
  });

  // Dado que vai para nota fiscal deixa rastro de quem trocou e o quê.
  await prisma.operationsAuditEvent.create({
    data: {
      actorId: atorId,
      action: "DADOS_FISCAIS_DA_CASA_ATUALIZADOS",
      entityType: "IdentidadeDaCasa",
      entityId: ID,
      metadata: { cnpj: dados.cnpj || null, campos: Object.keys(colunas) },
    },
  });

  return dados;
}

// ---------------------------------------------------------------------------
// Certificado digital A1 da casa
// ---------------------------------------------------------------------------

export type CertificadoDaCasa = CertificadoA1Info & { enviadoEm: string | null };

/**
 * O que a tela mostra do certificado. Recalcula os dias para vencer na hora:
 * o número guardado é o do dia do envio, e um certificado "a 300 dias" enviado
 * há um ano já venceu.
 */
export async function certificadoDaCasa(): Promise<CertificadoDaCasa | null> {
  const linha = await prisma.identidadeDaCasa.findUnique({
    where: { id: ID },
    select: { certificadoCipher: true, certificadoInfo: true },
  });
  if (!linha?.certificadoCipher || !linha.certificadoInfo) return null;

  const info = linha.certificadoInfo as CertificadoA1Info & { enviadoEm?: string };
  return { ...info, ...situacaoNaData(info.validoAte), enviadoEm: info.enviadoEm ?? null };
}

export function situacaoNaData(validoAte: string, agora = new Date()) {
  const diasParaVencer = Math.floor(
    (new Date(validoAte).getTime() - agora.getTime()) / (1000 * 60 * 60 * 24),
  );
  const expirado = diasParaVencer < 0;
  const status: CertificadoA1Info["status"] = expirado
    ? "EXPIRADO"
    : diasParaVencer <= 30
      ? "EXPIRANDO"
      : "ATIVO";
  return { diasParaVencer, expirado, status };
}

export async function salvarCertificadoDaCasa(params: {
  pfx: Buffer;
  senha: string;
  atorId: string;
}) {
  // Lê o certificado ANTES de guardar: senha errada ou arquivo trocado sai
  // como erro na tela, e não como um cofre cheio de algo que não abre.
  const info = inspecionarCertificadoA1(params.pfx, params.senha);
  if (info.expirado) {
    throw new DadosInvalidos(`Este certificado venceu em ${new Date(info.validoAte).toLocaleDateString("pt-BR")}.`);
  }

  const cipher = cifrar(
    JSON.stringify({ pfxBase64: params.pfx.toString("base64"), senha: params.senha }),
  );
  const guardado = { ...info, enviadoEm: new Date().toISOString() };

  await prisma.identidadeDaCasa.upsert({
    where: { id: ID },
    update: { certificadoCipher: cipher, certificadoInfo: guardado, atualizadoPor: params.atorId },
    create: { id: ID, certificadoCipher: cipher, certificadoInfo: guardado, atualizadoPor: params.atorId },
  });

  await prisma.operationsAuditEvent.create({
    data: {
      actorId: params.atorId,
      action: "CERTIFICADO_DA_CASA_ENVIADO",
      entityType: "IdentidadeDaCasa",
      entityId: ID,
      metadata: { titular: info.razaoSocial, cnpj: info.cnpj, validoAte: info.validoAte },
    },
  });

  return guardado;
}

export async function removerCertificadoDaCasa(atorId: string) {
  await prisma.identidadeDaCasa.upsert({
    where: { id: ID },
    update: { certificadoCipher: null, certificadoInfo: Prisma.DbNull, atualizadoPor: atorId },
    create: { id: ID, atualizadoPor: atorId },
  });

  await prisma.operationsAuditEvent.create({
    data: {
      actorId: atorId,
      action: "CERTIFICADO_DA_CASA_REMOVIDO",
      entityType: "IdentidadeDaCasa",
      entityId: ID,
    },
  });
}

/** O .pfx e a senha em claro, para quem for assinar nota. Nunca para a tela. */
export async function certificadoDaCasaDecifrado(): Promise<{ pfx: Buffer; senha: string } | null> {
  const linha = await prisma.identidadeDaCasa.findUnique({
    where: { id: ID },
    select: { certificadoCipher: true },
  });
  if (!linha?.certificadoCipher) return null;

  const { pfxBase64, senha } = JSON.parse(decifrar(linha.certificadoCipher)) as {
    pfxBase64: string;
    senha: string;
  };
  return { pfx: Buffer.from(pfxBase64, "base64"), senha };
}

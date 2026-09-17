import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { DocumentoDFe, NFeCompleta } from "./types";

/**
 * Retrato do cliente conforme um fornecedor o registrou na NF-e.
 *
 * A sincronização da SEFAZ busca as notas, avança o ponteiro NSU e devolve os
 * documentos em memória — nada é persistido. Este módulo guarda de cada
 * sincronização a única parte que interessa ao cadastro: o bloco `<dest>`, que
 * é o próprio cliente. Fornecedor, itens, valores e XML não entram.
 *
 * A escolha é deliberada e não é só de escopo. Item de nota é dado fiscal de
 * terceiro, com sigilo e retenção próprios; o bloco do destinatário é dado do
 * cliente sobre o cliente, da mesma natureza do `cnpj_data` que o cadastro já
 * guarda desde a consulta de CNPJ. Guardar um não implica guardar o outro.
 *
 * O que sai daqui vale MENOS que a Receita Federal e o assistente marca isso:
 * quem escreveu este endereço foi um fornecedor, não o cliente nem o órgão —
 * pode ser endereço de entrega, pode estar desatualizado.
 */

export type RetratoDestinatario = {
  cnpj: string;
  razaoSocial: string;
  ie?: string;
  uf: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  municipio?: string;
  cep?: string;
  telefone?: string;
  email?: string;
  /** Chave da nota de onde este retrato saiu — a trilha até o documento. */
  chaveAcesso: string;
  /** Emissão da nota, para saber se o dado é recente ou de anos atrás. */
  dataEmissao: string;
  /** Quando a sincronização gravou este retrato. */
  capturadoEm: string;
};

function ehCompleta(documento: DocumentoDFe): documento is NFeCompleta {
  return documento.tipo === "COMPLETA";
}

/**
 * A nota completa mais recente da leva. Resumo não serve: ele traz o emitente
 * e a chave, não o bloco do destinatário.
 */
export function escolherNotaMaisRecente(documentos: DocumentoDFe[]): NFeCompleta | null {
  const completas = documentos.filter(ehCompleta);
  if (completas.length === 0) return null;

  return completas.reduce((maisRecente, atual) =>
    // Data de emissão da NF-e é ISO 8601 com fuso: comparar como string
    // funciona para o mesmo fuso, mas não entre fusos diferentes.
    new Date(atual.dataEmissao).getTime() > new Date(maisRecente.dataEmissao).getTime()
      ? atual
      : maisRecente,
  );
}

/** Descarta chave vazia para o retrato não guardar campo em branco. */
function limpo(valor: string | undefined): string | undefined {
  const texto = valor?.trim();
  return texto && texto.length > 0 ? texto : undefined;
}

export function montarRetrato(nota: NFeCompleta, agora = new Date()): RetratoDestinatario {
  const dest = nota.destinatario;
  return {
    cnpj: dest.cnpj,
    razaoSocial: dest.razaoSocial,
    ie: limpo(dest.ie),
    uf: dest.uf,
    logradouro: limpo(dest.logradouro),
    numero: limpo(dest.numero),
    complemento: limpo(dest.complemento),
    bairro: limpo(dest.bairro),
    municipio: limpo(dest.municipio),
    cep: limpo(dest.cep),
    telefone: limpo(dest.telefone),
    email: limpo(dest.email)?.toLowerCase(),
    chaveAcesso: nota.chaveAcesso,
    dataEmissao: nota.dataEmissao,
    capturadoEm: agora.toISOString(),
  };
}

/**
 * Grava o retrato se a leva trouxe nota completa, e só quando ela é mais
 * recente que a já guardada — uma sincronização que volta com nota antiga não
 * deve envelhecer o cadastro.
 */
export async function guardarRetratoDoDestinatario(
  organizationId: string,
  documentos: DocumentoDFe[],
): Promise<RetratoDestinatario | null> {
  const nota = escolherNotaMaisRecente(documentos);
  if (!nota) return null;

  const retrato = montarRetrato(nota);

  const atual = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { sefazData: true },
  });

  const guardado = atual?.sefazData as RetratoDestinatario | null;
  if (guardado?.dataEmissao) {
    const jaTemMaisNovo =
      new Date(guardado.dataEmissao).getTime() >= new Date(retrato.dataEmissao).getTime();
    if (jaTemMaisNovo) return guardado;
  }

  await prisma.organization.update({
    where: { id: organizationId },
    data: { sefazData: retrato as unknown as Prisma.InputJsonValue },
  });

  return retrato;
}

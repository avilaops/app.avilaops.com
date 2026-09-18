import { classifyCpfCnpj } from "@/lib/cpf-cnpj";

/**
 * Identificação do pagador de um Pix recebido a partir do comprovante.
 *
 * O Éfi não devolve quem pagou num Pix recebido fora de cobrança — a resposta
 * de `/v2/pix` traz valor, chave e `endToEndId`, e nada mais. Por isso a
 * movimentação nasce com "Não informado" no lugar da contraparte e fica assim
 * para sempre: não existe outra chamada que preencha esse campo depois.
 *
 * Quem sabe o nome é o pagador, e ele manda o comprovante. O problema é que
 * comprovante é imagem: digitar o nome a partir dele seria só palavra de quem
 * digitou, e a regra da casa é que número na tela abre a evidência.
 *
 * O que fecha a procedência é o **identificador ponta a ponta**. Ele está
 * impresso no comprovante e já foi gravado pela sincronização em
 * `bank_transactions.end_to_end_id`, vindo direto do Éfi. Se os dois baterem,
 * o comprovante é comprovadamente desta movimentação — não de outra
 * transferência de valor parecido. Se não baterem, a identificação é recusada:
 * é exatamente o caso em que aceitar seria inventar dado para preencher tela.
 */

/**
 * `E` + 8 dígitos de ISPB + 12 de data/hora (AAAAMMDDHHMM, em UTC) + 11
 * alfanuméricos livres. São 32 caracteres, definidos pelo Banco Central.
 */
const FORMATO_E2E = /^E\d{8}\d{12}[A-Za-z0-9]{11}$/;

/** Tira espaço e quebra de linha: comprovante copiado vem picotado. */
export function normalizarIdentificador(valor: string): string {
  return valor.replace(/\s+/g, "").toUpperCase();
}

export function ehIdentificadorPix(valor: string): boolean {
  return FORMATO_E2E.test(normalizarIdentificador(valor));
}

/**
 * Instante que o próprio identificador carrega, em UTC.
 *
 * Serve para a folha de evidência mostrar de onde veio o horário sem depender
 * do que a tela formatou: o comprovante do dia 18/09/2026 às 18:37 em Brasília
 * traz `202609182137` — as 21:37 em UTC. Não vale como prova (a prova é o
 * identificador bater), mas explica a diferença de três horas para quem audita.
 */
export function instanteDoIdentificador(valor: string): Date | null {
  const identificador = normalizarIdentificador(valor);
  if (!FORMATO_E2E.test(identificador)) return null;

  const carimbo = identificador.slice(9, 21);
  const ano = Number(carimbo.slice(0, 4));
  const mes = Number(carimbo.slice(4, 6));
  const dia = Number(carimbo.slice(6, 8));
  const hora = Number(carimbo.slice(8, 10));
  const minuto = Number(carimbo.slice(10, 12));
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31 || hora > 23 || minuto > 59) {
    return null;
  }

  const instante = new Date(Date.UTC(ano, mes - 1, dia, hora, minuto));
  return Number.isNaN(instante.getTime()) ? null : instante;
}

export type ComprovanteInformado = {
  identificador: string;
  pagador: string;
  documento?: string | null;
};

export type ComprovanteConferido = {
  identificador: string;
  pagador: string;
  /** Só dígitos, ou `null` quando o comprovante não trouxe documento. */
  documento: string | null;
  /** CPF ou CNPJ, quando há documento — é o que distingue pessoa de empresa. */
  tipoDocumento: "CPF" | "CNPJ" | null;
  instante: Date | null;
};

export type ConferenciaComprovante =
  | { ok: true; comprovante: ComprovanteConferido }
  | { ok: false; erro: string };

/**
 * Confere o comprovante contra a movimentação e devolve o que pode ser gravado.
 *
 * `endToEndId` nulo recusa de propósito: sem o identificador do lado do banco
 * não há o que conferir, e gravar mesmo assim transformaria "digitado por
 * alguém" em "conciliado" — que é a mentira que esta tela existe para evitar.
 */
export function conferirComprovante(
  informado: ComprovanteInformado,
  movimentacao: { endToEndId: string | null; direction: string },
): ConferenciaComprovante {
  const identificador = normalizarIdentificador(informado.identificador ?? "");
  if (!identificador) {
    return { ok: false, erro: "Informe o identificador do comprovante." };
  }
  if (!FORMATO_E2E.test(identificador)) {
    return {
      ok: false,
      erro: "Identificador fora do formato do Pix (E + 31 caracteres).",
    };
  }

  if (!movimentacao.endToEndId) {
    return {
      ok: false,
      erro:
        "Esta movimentação não tem identificador ponta a ponta, então não há como provar que o comprovante é dela.",
    };
  }
  if (normalizarIdentificador(movimentacao.endToEndId) !== identificador) {
    return {
      ok: false,
      erro:
        "O identificador do comprovante é de outra transferência — confira se o comprovante é desta movimentação.",
    };
  }

  const pagador = (informado.pagador ?? "").trim().replace(/\s+/g, " ");
  if (pagador.length < 3) {
    return {
      ok: false,
      erro: "Informe o nome que está no comprovante.",
    };
  }

  const bruto = (informado.documento ?? "").trim();
  let documento: string | null = null;
  let tipoDocumento: "CPF" | "CNPJ" | null = null;
  if (bruto) {
    const classificado = classifyCpfCnpj(bruto);
    if (!classificado || !classificado.valid) {
      return { ok: false, erro: "CPF/CNPJ do comprovante é inválido." };
    }
    documento = classificado.digits;
    tipoDocumento = classificado.kind;
  }

  return {
    ok: true,
    comprovante: {
      identificador,
      pagador: pagador.slice(0, 160),
      documento,
      tipoDocumento,
      instante: instanteDoIdentificador(identificador),
    },
  };
}

/**
 * Nota gravada na conciliação. É o texto que a linha mostra depois, então diz
 * o que sustenta a decisão — não só que ela foi tomada.
 */
export function notaDoComprovante(comprovante: ComprovanteConferido): string {
  const partes = [`Comprovante Pix de ${comprovante.pagador}`];
  if (comprovante.documento && comprovante.tipoDocumento) {
    partes.push(`${comprovante.tipoDocumento} ${comprovante.documento}`);
  }
  partes.push("identificador confere com o do extrato");
  return `${partes.join(", ")}.`.slice(0, 300);
}

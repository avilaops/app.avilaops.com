import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { CODIGO_CONFIRMACAO_NECESSARIA } from "@/lib/confirmacao-codigo";
import { prisma } from "@/lib/prisma";

/**
 * Confirmação recente de senha: o segundo "sou eu mesmo" antes de um ato que
 * não se delega.
 *
 * Estar logado prova que alguém entrou há até oito horas. Não prova que quem
 * está no teclado agora é o dono: um computador destravado na mesa basta para
 * revelar o token do banco ou trocar o certificado que assina nota. Estes atos
 * pedem a senha de novo, e a resposta vale por poucos minutos.
 *
 * A prova mora num cookie próprio, assinado e com audiência própria. Não é a
 * sessão e não vira sessão: o cookie de sessão não tem esta audiência, e este
 * não tem papel — nenhum dos dois passa na conferência do outro.
 */

const COOKIE = "avila_ops_confirmacao";
const AUDIENCIA = "confirmacao-de-senha";
export const VALIDADE_DA_CONFIRMACAO_SEGUNDOS = 5 * 60;

const MAXIMO_DE_FALHAS = 5;
const JANELA_DE_BLOQUEIO_MS = 15 * 60 * 1000;

function segredo(): string {
  const valor = process.env.APP_JWT_SECRET;
  if (!valor) throw new Error("APP_JWT_SECRET não configurado");
  return valor;
}

type Tentativas = { falhas: number; bloqueadoAte: number };

/**
 * Contador de senha errada, por conta.
 *
 * Em memória do processo: o painel roda num container só, e um contador que
 * zera no deploy ainda transforma "tentar dez mil senhas" em "tentar cinco a
 * cada quinze minutos". Persistir isso em tabela seria migração para proteger
 * uma porta que já exige sessão de dono.
 */
const tentativas = new Map<string, Tentativas>();

/** Segundos que faltam para a conta poder tentar de novo; zero se pode. */
export function esperaPorFalhas(adminId: string, agora = Date.now()): number {
  const registro = tentativas.get(adminId);
  if (!registro || registro.bloqueadoAte <= agora) return 0;
  return Math.ceil((registro.bloqueadoAte - agora) / 1000);
}

export function registrarFalha(adminId: string, agora = Date.now()) {
  const anterior = tentativas.get(adminId);
  // Bloqueio vencido recomeça a contagem: quem errou ontem não entra hoje já
  // com quatro strikes.
  const falhas = anterior && anterior.bloqueadoAte > 0 && anterior.bloqueadoAte <= agora
    ? 1
    : (anterior?.falhas ?? 0) + 1;
  tentativas.set(adminId, {
    falhas,
    bloqueadoAte: falhas >= MAXIMO_DE_FALHAS ? agora + JANELA_DE_BLOQUEIO_MS : 0,
  });
}

export function limparFalhas(adminId: string) {
  tentativas.delete(adminId);
}

/** A senha é a deste painel, a mesma do login por CPF ou e-mail. */
export async function senhaConfere(adminId: string, senha: string): Promise<boolean> {
  const conta = await prisma.adminIdentity.findFirst({
    where: { id: adminId, ativo: true },
    select: { senhaHash: true },
  });
  if (!conta?.senhaHash) return false;
  return bcrypt.compare(senha, conta.senhaHash);
}

export function assinarConfirmacao(adminId: string): string {
  return jwt.sign({ sub: adminId }, segredo(), {
    audience: AUDIENCIA,
    expiresIn: VALIDADE_DA_CONFIRMACAO_SEGUNDOS,
  });
}

/** Vale só para a conta que confirmou: prova de um não serve para outro. */
export function confirmacaoValida(token: string | undefined, adminId: string): boolean {
  if (!token) return false;
  try {
    const carga = jwt.verify(token, segredo(), { audience: AUDIENCIA });
    return typeof carga === "object" && carga.sub === adminId;
  } catch {
    return false;
  }
}

export async function registrarConfirmacao(adminId: string) {
  (await cookies()).set(COOKIE, assinarConfirmacao(adminId), {
    httpOnly: true,
    // `strict`: este cookie só interessa a pedido que saiu da nossa própria
    // tela. Nem navegação vinda de outro site precisa carregá-lo.
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: VALIDADE_DA_CONFIRMACAO_SEGUNDOS,
  });
}

export async function temConfirmacaoRecente(adminId: string): Promise<boolean> {
  return confirmacaoValida((await cookies()).get(COOKIE)?.value, adminId);
}

/**
 * Resposta de "confirme a senha antes". Leva o recado nas duas grafias porque
 * as rotas do cofre respondem `error` e as da empresa, `erro`.
 */
export function pedirConfirmacao() {
  const recado = "Confirme sua senha para continuar.";
  return NextResponse.json(
    { erro: recado, error: recado, codigo: CODIGO_CONFIRMACAO_NECESSARIA },
    { status: 403 },
  );
}

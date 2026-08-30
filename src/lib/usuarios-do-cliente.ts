import bcrypt from "bcryptjs";
import { randomInt, randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";

/**
 * Usuários de uma empresa cliente.
 *
 * Quem manda aqui é o **dono do negócio** (`ADMIN`): ele cadastra a equipe
 * dele (`CLIENT`) e desliga quem saiu. Toda consulta e toda escrita passam
 * pelo `organizationId` de quem está pedindo, nunca por um id vindo da tela:
 * é a única coisa que impede o dono de um restaurante mexer na equipe de
 * outro.
 *
 * A tabela é a mesma da casa inteira (`public.portal_clients`), e o formato da
 * senha é o do auth: bcrypt(10) com `senha_provisoria = true` na criação. SQL
 * cru porque `cpf` aceita nulo na tabela e o Prisma exige o campo.
 */

export type UsuarioDaEmpresa = {
  id: string;
  nome: string;
  email: string;
  telefone: string | null;
  papel: "ADMIN" | "CLIENT";
  ativo: boolean;
  senhaProvisoria: boolean;
  criadoEm: Date;
  ultimoAcessoEm: Date | null;
};

type Linha = {
  id: string;
  nome: string;
  email: string;
  telefone: string | null;
  role: string;
  ativo: boolean;
  senha_provisoria: boolean;
  criado_em: Date;
  ultimo_acesso_em: Date | null;
};

function daLinha(l: Linha): UsuarioDaEmpresa {
  return {
    id: l.id,
    nome: l.nome,
    email: l.email,
    telefone: l.telefone,
    papel: l.role === "ADMIN" ? "ADMIN" : "CLIENT",
    ativo: l.ativo,
    senhaProvisoria: l.senha_provisoria,
    criadoEm: l.criado_em,
    ultimoAcessoEm: l.ultimo_acesso_em,
  };
}

/** Mesmo alfabeto do auth: sem 0/O/1/I/L, para ditar por telefone. */
export function gerarSenhaProvisoria(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 12 }, () => chars[randomInt(chars.length)]).join("");
}

export class UsuarioInvalido extends Error {}

export async function listarUsuariosDaEmpresa(organizationId: string): Promise<UsuarioDaEmpresa[]> {
  return (
    await prisma.$queryRaw<Linha[]>`
      select id, nome, email, telefone, role, ativo, senha_provisoria, criado_em, ultimo_acesso_em
        from public.portal_clients
       where organization_id = ${organizationId}
       order by case role when 'ADMIN' then 0 else 1 end, lower(nome)
       limit 200
    `
  ).map(daLinha);
}

/** Confere que o usuário é mesmo daquela empresa antes de qualquer escrita. */
async function daMesmaEmpresa(id: string, organizationId: string): Promise<Linha | null> {
  const linhas = await prisma.$queryRaw<Linha[]>`
    select id, nome, email, telefone, role, ativo, senha_provisoria, criado_em, ultimo_acesso_em
      from public.portal_clients
     where id = ${id} and organization_id = ${organizationId}
     limit 1
  `;
  return linhas[0] ?? null;
}

export async function criarUsuarioDaEmpresa(
  organizationId: string,
  dados: { nome: string; email: string; telefone?: string | null; papel?: "ADMIN" | "CLIENT" },
): Promise<{ usuario: UsuarioDaEmpresa; senha: string }> {
  const nome = dados.nome.trim();
  const email = dados.email.trim().toLowerCase();
  if (nome.length < 2) throw new UsuarioInvalido("Informe o nome de quem vai usar.");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email)) throw new UsuarioInvalido("E-mail inválido.");

  const jaExiste = await prisma.$queryRaw<{ organization_id: string | null }[]>`
    select organization_id from public.portal_clients where lower(email) = ${email} limit 1
  `;
  if (jaExiste.length) {
    // Não dizemos de qual empresa é: quem cadastra não precisa saber que aquele
    // e-mail já é cliente de outro negócio.
    throw new UsuarioInvalido("Este e-mail já tem acesso. Fale com a Avila Ops para ligá-lo à sua empresa.");
  }

  const senha = gerarSenhaProvisoria();
  const id = randomUUID();
  const hash = await bcrypt.hash(senha, 10);
  await prisma.$executeRaw`
    insert into public.portal_clients (id, nome, email, cpf, telefone, role, senha_hash, senha_provisoria, organization_id, ativo)
    values (${id}, ${nome}, ${email}, null, ${dados.telefone?.trim() || null}, ${dados.papel ?? "CLIENT"}, ${hash}, true, ${organizationId}, true)
  `;

  const criado = await daMesmaEmpresa(id, organizationId);
  if (!criado) throw new UsuarioInvalido("Não foi possível criar o acesso.");
  return { usuario: daLinha(criado), senha };
}

/**
 * Liga ou desliga alguém da equipe.
 *
 * O dono não pode se desligar sozinho: a empresa ficaria sem ninguém para
 * religar, e sobraria para o suporte.
 */
export async function definirAtivoNaEmpresa(
  organizationId: string,
  id: string,
  ativo: boolean,
  quemPede: string,
): Promise<UsuarioDaEmpresa> {
  if (id === quemPede) throw new UsuarioInvalido("Você não pode desligar o seu próprio acesso.");
  const alvo = await daMesmaEmpresa(id, organizationId);
  if (!alvo) throw new UsuarioInvalido("Usuário não encontrado nesta empresa.");
  await prisma.$executeRaw`
    update public.portal_clients set ativo = ${ativo}, atualizado_em = now()
     where id = ${id} and organization_id = ${organizationId}
  `;
  return { ...daLinha(alvo), ativo };
}

/** Nova senha provisória, devolvida em claro uma vez só. */
export async function redefinirSenhaNaEmpresa(organizationId: string, id: string): Promise<string> {
  const alvo = await daMesmaEmpresa(id, organizationId);
  if (!alvo) throw new UsuarioInvalido("Usuário não encontrado nesta empresa.");
  const senha = gerarSenhaProvisoria();
  const hash = await bcrypt.hash(senha, 10);
  await prisma.$executeRaw`
    update public.portal_clients set senha_hash = ${hash}, senha_provisoria = true, atualizado_em = now()
     where id = ${id} and organization_id = ${organizationId}
  `;
  return senha;
}

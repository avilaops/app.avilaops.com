import bcrypt from "bcryptjs";
import { randomInt, randomUUID } from "crypto";
import { validarEmailRecuperacao } from "@/lib/email-recuperacao";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/slug";

/**
 * Conta de acesso do cliente ao SSO (auth.avilaops.com).
 *
 * As contas vivem em `public.portal_clients`, o mesmo banco deste app — por
 * isso o painel cria a conta direto, com o MESMO formato do auth: bcrypt(10),
 * `senha_provisoria = true`, `role = 'CLIENT'`. Se o auth mudar o hash, este
 * arquivo muda junto (já aconteceu com o mail: bcrypt → scrypt).
 *
 * O SQL é cru porque o modelo `AdminIdentity` declara `cpf` obrigatório e a
 * tabela aceita nulo — cliente PJ entra com CNPJ, cliente sem documento entra
 * sem nada.
 */

/** Mesmo alfabeto do auth: sem 0/O/1/I/L, para ditar por telefone. */
export function gerarSenhaProvisoria(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 12 }, () => chars[randomInt(chars.length)]).join("");
}

type NovaContaCliente = {
  nome: string;
  email: string;
  cpfCnpj?: string | null;
  telefone?: string | null;
  /**
   * Endereço pessoal, fora dos domínios que hospedamos. Obrigatório em conta
   * nova: sem ele, quem perde a senha do e-mail profissional não tem por onde
   * voltar — o link de recuperação chega na caixa trancada.
   */
  emailRecuperacao: string;
};

export type ResultadoAcesso = {
  id: string;
  email: string;
  /** `true` quando a conta nasceu agora; `false` quando já existia. */
  criado: boolean;
  /** Senha provisória em claro — só existe quando foi gerada nesta chamada. */
  senha: string | null;
};

export async function buscarContaPorEmail(email: string) {
  const linhas = await prisma.$queryRaw<{ id: string; nome: string; role: string }[]>`
    select id, nome, role from public.portal_clients where lower(email) = ${email.trim().toLowerCase()} limit 1
  `;
  return linhas[0] ?? null;
}

/** Cria a conta se não existir. Idempotente por e-mail. */
export async function garantirAcessoCliente(dados: NovaContaCliente): Promise<ResultadoAcesso> {
  const email = dados.email.trim().toLowerCase();
  const existente = await buscarContaPorEmail(email);
  if (existente) return { id: existente.id, email, criado: false, senha: null };

  // Antes de criar: conta sem endereço de recuperação nasce trancada no dia
  // em que a senha se perder. Lança e a tela mostra o motivo.
  const recuperacao = await validarEmailRecuperacao(dados.emailRecuperacao, email);

  const senha = gerarSenhaProvisoria();
  const id = randomUUID();
  const documento = dados.cpfCnpj?.replace(/\D/g, "") || null;
  const telefone = dados.telefone?.trim() || null;
  const hash = await bcrypt.hash(senha, 10);

  await prisma.$executeRaw`
    insert into public.portal_clients (id, nome, email, cpf, telefone, role, senha_hash, senha_provisoria, email_recuperacao)
    values (${id}, ${dados.nome.trim()}, ${email}, ${documento}, ${telefone}, 'CLIENT', ${hash}, true, ${recuperacao})
  `;

  return { id, email, criado: true, senha };
}

/**
 * Liga a conta à empresa que ela representa.
 *
 * É o que faz a área do cliente saber o que é dele: sem o vínculo, `CLIENT` é
 * só um papel solto. Idempotente e nunca sobrescreve um vínculo existente —
 * mudar de empresa é ação de admin, não efeito colateral de aprovação.
 */
export async function vincularContaAOrganizacao(contaId: string, organizationId: string): Promise<boolean> {
  const afetadas = await prisma.$executeRaw`
    update public.portal_clients
       set organization_id = ${organizationId}
     where id = ${contaId} and organization_id is null
  `;
  return afetadas > 0;
}

/** Gera uma provisória nova (para reenviar o acesso). */
export async function redefinirSenhaProvisoria(id: string): Promise<string> {
  const senha = gerarSenhaProvisoria();
  const hash = await bcrypt.hash(senha, 10);
  await prisma.$executeRaw`
    update public.portal_clients set senha_hash = ${hash}, senha_provisoria = true where id = ${id}
  `;
  return senha;
}

/** Slug de organização que não colide com os existentes. */
export async function slugLivreDeOrganizacao(nome: string): Promise<string> {
  const base = slugify(nome, 60) || "cliente";
  const parecidos = await prisma.organization.findMany({
    where: { slug: { startsWith: base } },
    select: { slug: true },
  });
  const usados = new Set(parecidos.map((item) => item.slug));
  let slug = base;
  let sufixo = 2;
  while (usados.has(slug)) {
    slug = `${base.slice(0, 56)}-${sufixo}`;
    sufixo += 1;
  }
  return slug;
}

export function urlDeLogin() {
  return (process.env.SSO_BASE_URL ?? "https://auth.avilaops.com").replace(/\/+$/, "") + "/entrar";
}

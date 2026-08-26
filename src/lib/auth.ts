import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { lerSessaoCliente, lerSessaoSSO } from "@/lib/sso";

const SESSION_COOKIE = "avila_ops_session";
const SESSION_TTL_SECONDS = 8 * 60 * 60;
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

export type PapelPortal = "ADMIN" | "CLIENT";

type AdminToken = {
  sub: string;
  role: PapelPortal;
};

function sessionSecret(): string {
  const secret = process.env.APP_JWT_SECRET;
  if (!secret) {
    throw new Error("APP_JWT_SECRET não configurado");
  }
  return secret;
}

/**
 * Autentica contra `portal_clients` **sem filtrar papel**.
 *
 * A tabela guarda equipe (`role = 'ADMIN'`) e cliente (`role = 'CLIENT'`) lado
 * a lado, e é isso que permite uma porta só: o papel não decide *se* entra,
 * decide *para onde vai*. Quem chama é responsável por rotear — e as áreas
 * administrativas continuam protegidas por `getAdmin()`, que exige ADMIN.
 */
export async function autenticarPortal(login: string, password: string) {
  const normalizedLogin = login.trim().toLowerCase();
  const cpf = normalizedLogin.replace(/\D/g, "");

  const identity = await prisma.adminIdentity.findFirst({
    where: {
      OR: [
        { email: { equals: normalizedLogin, mode: "insensitive" } },
        ...(cpf.length === 11 ? [{ cpf }] : []),
      ],
    },
  });

  if (!identity || !(await bcrypt.compare(password, identity.senhaHash))) {
    return null;
  }

  if (identity.senhaProvisoria) {
    throw new Error("PROVISIONAL_PASSWORD");
  }

  return identity;
}

/**
 * @deprecated Use `autenticarPortal`. Mantido porque restringir a ADMIN ainda
 * é o comportamento certo em qualquer chamada que exista fora do login.
 */
export async function authenticateAdmin(login: string, password: string) {
  const identity = await autenticarPortal(login, password);
  return identity?.role === "ADMIN" ? identity : null;
}

export async function createAdminSession(adminId: string, role: PapelPortal = "ADMIN") {
  const token = jwt.sign(
    { sub: adminId, role } satisfies AdminToken,
    sessionSecret(),
    { expiresIn: SESSION_TTL_SECONDS },
  );

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function clearAdminSession() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export type AdminAtual = {
  id: string;
  nome: string;
  email: string;
  role: string;
};

/**
 * Administrador da requisição corrente, vindo de uma de duas origens:
 *
 * 1. sessão local (CPF/senha, cookie `avila_ops_session`) — o acesso histórico;
 * 2. sessão do SSO (cookie `avila_sso` de `.avilaops.com`).
 *
 * As 70+ rotas que já chamam esta função passam a aceitar SSO sem nenhuma
 * alteração, e o login local segue funcionando enquanto houver admin sem conta
 * Workspace.
 */
export async function getAdmin(): Promise<AdminAtual | null> {
  const local = await getAdminLocal();
  if (local) return local;
  return getAdminSSO();
}

/**
 * Sessão de quem está logado, **seja equipe ou cliente**.
 *
 * Existe separada de `getAdmin()` de propósito. `getAdmin()` é chamada em mais
 * de 70 rotas administrativas e precisa continuar recusando cliente — afrouxar
 * ali daria acesso ao painel inteiro a qualquer pessoa cadastrada. Quem quiser
 * atender os dois papéis usa esta função e decide o que mostrar.
 */
export async function getSessaoPortal(): Promise<AdminAtual | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;

  if (token) {
    try {
      const payload = jwt.verify(token, sessionSecret()) as AdminToken;
      if (payload.sub) {
        const identidade = await prisma.adminIdentity.findFirst({
          where: { id: payload.sub },
          select: { id: true, nome: true, email: true, role: true },
        });
        // O papel vem do banco, não do token: se alguém deixar de ser ADMIN,
        // o cookie antigo não pode continuar valendo como tal.
        if (identidade) return identidade;
      }
    } catch {
      /* token inválido cai para o SSO abaixo */
    }
  }

  // Cliente que entrou pelo Google chega com o cookie de `.avilaops.com`.
  const sso = await lerSessaoCliente();
  if (sso) {
    return { id: `sso:${sso.sub}`, nome: sso.nome, email: sso.email, role: "CLIENT" };
  }

  return getAdminSSO();
}

/**
 * Para onde mandar cada papel depois do login.
 *
 * A área do cliente ainda vive em `cliente.avilaops.com` — por isso o destino
 * dele é absoluto. Funciona porque a sessão está num cookie de `.avilaops.com`,
 * que atravessa os subdomínios: a pessoa chega lá já autenticada.
 *
 * Quando as páginas do portal forem migradas para cá, basta apontar
 * `PORTAL_CLIENTE_URL` para vazio e trocar por `/dashboard` — nenhum outro
 * ponto do código precisa mudar.
 *
 * O padrão é o destino do **cliente**, não o da equipe: qualquer papel que não
 * seja exatamente ADMIN cai na área restrita, nunca no painel administrativo.
 */
export function destinoPorPapel(role: string): string {
  if (role === "ADMIN") return "/operacao";
  // O portal do cliente (cliente.avilaops.com) ainda vai ser construído; até lá
  // o cliente fica na raiz deste app.
  const portal = process.env.PORTAL_CLIENTE_URL;
  return portal ? `${portal.replace(/\/$/, "")}/dashboard` : "/";
}

async function getAdminLocal(): Promise<AdminAtual | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  try {
    const payload = jwt.verify(token, sessionSecret()) as AdminToken;
    if (payload.role !== "ADMIN" || !payload.sub) return null;

    return prisma.adminIdentity.findFirst({
      where: { id: payload.sub, role: "ADMIN" },
      select: { id: true, nome: true, email: true, role: true },
    });
  } catch {
    return null;
  }
}

async function getAdminSSO(): Promise<AdminAtual | null> {
  const sessao = await lerSessaoSSO();
  if (!sessao) return null;

  // O cookie do SSO vale para TODOS os subdomínios: tê-lo só significa que a
  // pessoa logou em algum sistema Avila Ops. Este app é restrito, então o papel
  // é conferido aqui também — não basta o bloqueio feito no auth server.
  if (sessao.papel !== "ADMIN") return null;

  return {
    // Prefixo `sso:` para a auditoria distinguir a origem e nunca colidir com um
    // id real de `portal_clients`. `actorId`/`createdBy` são colunas de texto
    // sem FK, então um id sintético aqui não quebra integridade referencial.
    id: `sso:${sessao.sub}`,
    nome: sessao.nome,
    email: sessao.email,
    role: "ADMIN",
  };
}

function hashResetToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

/**
 * Gera um token de redefinição para o e-mail informado, se houver um admin
 * correspondente. Retorna sempre `null` quando não há match, para o chamador
 * responder de forma genérica e não permitir enumeração de e-mails.
 */
export async function requestPasswordReset(email: string): Promise<string | null> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return null;

  const identity = await prisma.adminIdentity.findFirst({
    where: { role: "ADMIN", email: { equals: normalizedEmail, mode: "insensitive" } },
  });
  if (!identity) return null;

  const rawToken = crypto.randomBytes(32).toString("hex");

  await prisma.adminIdentity.update({
    where: { id: identity.id },
    data: {
      resetTokenHash: hashResetToken(rawToken),
      resetTokenExpiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
    },
  });

  return rawToken;
}

export async function resetPasswordWithToken(rawToken: string, newPassword: string): Promise<boolean> {
  const tokenHash = hashResetToken(rawToken);

  const identity = await prisma.adminIdentity.findFirst({
    where: {
      role: "ADMIN",
      resetTokenHash: tokenHash,
      resetTokenExpiresAt: { gt: new Date() },
    },
  });
  if (!identity) return false;

  const senhaHash = await bcrypt.hash(newPassword, 10);

  await prisma.adminIdentity.update({
    where: { id: identity.id },
    data: {
      senhaHash,
      senhaProvisoria: false,
      resetTokenHash: null,
      resetTokenExpiresAt: null,
    },
  });

  return true;
}

export const ADMIN_SESSION_COOKIE = SESSION_COOKIE;

import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

const SESSION_COOKIE = "avila_ops_session";
const SESSION_TTL_SECONDS = 8 * 60 * 60;
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

type AdminToken = {
  sub: string;
  role: "ADMIN";
};

function sessionSecret(): string {
  const secret = process.env.APP_JWT_SECRET;
  if (!secret) {
    throw new Error("APP_JWT_SECRET não configurado");
  }
  return secret;
}

export async function authenticateAdmin(login: string, password: string) {
  const normalizedLogin = login.trim().toLowerCase();
  const cpf = normalizedLogin.replace(/\D/g, "");

  const identity = await prisma.adminIdentity.findFirst({
    where: {
      role: "ADMIN",
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

export async function createAdminSession(adminId: string) {
  const token = jwt.sign(
    { sub: adminId, role: "ADMIN" } satisfies AdminToken,
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

export async function getAdmin() {
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

import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { lerSessaoSSO } from "@/lib/sso";

const SESSION_COOKIE = "avila_ops_session";
const SESSION_TTL_SECONDS = 8 * 60 * 60;
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

/**
 * Quatro pessoas diferentes, não quatro níveis da mesma:
 *
 * - `OWNER`  → a **plataforma** (Avila Ops). Uma conta. Este app inteiro é dela.
 * - `SOCIO`  → quem toca a operação junto com o dono, sem mexer no caixa.
 *   Entra no painel e opera tudo, menos o que `ehDono()` guarda.
 * - `ADMIN`  → o **dono do negócio** que contrata: restaurante, loja, oficina.
 *   Manda na própria empresa e na equipe dela, em mais nada.
 * - `CLIENT` → a **equipe** desse dono. Usa o produto; não administra.
 *
 * `app.avilaops.com` é o painel da plataforma, então quem entra aqui é OWNER
 * ou SOCIO. ADMIN e CLIENT vivem em `/portal` (a empresa deles) e no painel do
 * produto que assinam.
 */
export type PapelPortal = "OWNER" | "SOCIO" | "ADMIN" | "CLIENT";

const PAPEIS_DA_CASA: readonly string[] = ["OWNER", "SOCIO"];

/**
 * Gente da casa: a plataforma. É o que este painel exige em toda página e rota.
 *
 * Passar aqui abre o painel, **não** o caixa: dinheiro, cofre e concessão de
 * acesso continuam atrás de `ehDono()`. Quem for acrescentar papel novo aqui
 * precisa conferir se cada rota sensível usa `ehDono()` e não só `getAdmin()`.
 */
export function ehDaCasa(role: string | null | undefined): boolean {
  return typeof role === "string" && PAPEIS_DA_CASA.includes(role);
}

/** Dono do negócio cliente: manda na própria empresa. */
export function ehDonoDoNegocio(role: string | null | undefined): boolean {
  return role === "ADMIN";
}

/**
 * Só o dono. Nem o sócio passa aqui.
 *
 * O que fica atrás disto é o que não se delega: dinheiro (conta, extrato,
 * conciliação, cobrança, preço), segredo (cofre de credenciais), acesso (quem
 * vira cliente, quem recebe senha) e o que é irreversível. A equipe — inclusive
 * as contas de automação — opera todo o resto sem pedir licença.
 *
 * É esta função, e não `ehDaCasa()`, que separa SOCIO de OWNER. Rota nova que
 * mexa em dinheiro tem que chamar esta aqui: só `getAdmin()` deixa o sócio
 * entrar.
 */
export function ehDono(role: string | null | undefined): boolean {
  return role === "OWNER";
}

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
  /** Empresa que a conta representa. Preenchido para CLIENT; nulo na equipe. */
  organizationId?: string | null;
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
          select: { id: true, nome: true, email: true, role: true, organizationId: true },
        });
        // O papel vem do banco, não do token: se alguém deixar de ser ADMIN,
        // o cookie antigo não pode continuar valendo como tal.
        if (identidade) return identidade;
      }
    } catch {
      /* token inválido cai para o SSO abaixo */
    }
  }

  return getAdminSSO();
}

/**
 * Para onde mandar cada papel depois do login.
 *
 * A área do cliente vive neste mesmo app, em `/portal`, desde que o
 * cliente.avilaops.com foi desligado.
 *
 * O padrão é o destino do **cliente**: qualquer papel que não seja da casa cai
 * na área restrita, nunca no painel administrativo.
 */
export function destinoPorPapel(role: string): string {
  if (ehDaCasa(role)) return "/operacao";
  return "/portal";
}

/** Papel legível, para tela e auditoria. */
export function rotuloDoPapel(role: string): string {
  if (role === "OWNER") return "Plataforma";
  if (role === "SOCIO") return "Sócio";
  if (role === "ADMIN") return "Dono do negócio";
  return "Equipe do cliente";
}

async function getAdminLocal(): Promise<AdminAtual | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  try {
    const payload = jwt.verify(token, sessionSecret()) as AdminToken;
    if (!ehDaCasa(payload.role) || !payload.sub) return null;

    // O papel vem do banco, não do token: quem deixou de ser da casa perde o
    // acesso mesmo com o cookie antigo na mão.
    return prisma.adminIdentity.findFirst({
      where: { id: payload.sub, role: { in: [...PAPEIS_DA_CASA] } },
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
  //
  // O que o token sabe dizer é grosso: equipe ou cliente. Exigir `OWNER` aqui
  // não filtrava ninguém, **fechava tudo** — nenhum token pode dizer OWNER, e
  // por isso todo login por SSO neste app caía fora, o do dono inclusive
  // (01/09/2026). Quem decide de verdade é a consulta logo abaixo.
  if (sessao.papel !== "ADMIN") return null;

  // O papel mora em `portal_clients`, não no token: o auth só sabe dizer
  // ADMIN/CLIENTE, e é aqui que OWNER existe. Sem esta consulta, o dono entrando
  // pelo SSO viraria um ADMIN comum e perderia o que é exclusivo dele.
  const conta = sessao.email
    ? await prisma.adminIdentity.findFirst({
        where: { email: { equals: sessao.email, mode: "insensitive" } },
        select: { id: true, nome: true, email: true, role: true },
      })
    : null;
  if (conta && ehDaCasa(conta.role)) return conta;

  // Sem conta da casa no banco, não entra. A identidade sintética que existia
  // aqui carregava o papel do token, que nunca é da casa: ou virava sessão
  // recusada mais adiante, ou seria brecha se alguém confiasse nela. Este é o
  // painel da plataforma — quem não tem linha OWNER em `portal_clients` não
  // tem o que fazer aqui.
  return null;
}

function hashResetToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

/**
 * Gera um token de redefinição para o e-mail informado, se houver conta
 * correspondente. Retorna sempre `null` quando não há match, para o chamador
 * responder de forma genérica e não permitir enumeração de e-mails.
 *
 * Casa tanto pelo e-mail de login quanto pelo de recuperação: quem perdeu a
 * senha da caixa profissional não consegue abrir o link enviado para ela.
 *
 * O filtro aqui era `role: "ADMIN"`, o que deixava OWNER e CLIENT sem
 * recuperação nenhuma — inclusive a conta do dono. Conta desligada continua
 * de fora: quem não entra também não redefine.
 */
const PESO_DO_PAPEL: Record<string, number> = { OWNER: 0, ADMIN: 1, CLIENT: 2 };

/**
 * Qual conta recebe o link, quando o endereço digitado casa com mais de uma.
 *
 * Um e-mail de recuperação pode responder por várias contas (o pessoal do
 * Nicolas responde por três). Quem digita o **próprio** endereço recupera
 * aquela conta, sempre; quem digita o de recuperação chega na de papel mais
 * alto, e o e-mail desempata para a escolha nunca depender da ordem que o
 * banco devolveu.
 */
export function escolherParaRecuperacao<T extends { email: string; role: string }>(
  candidatas: readonly T[],
  emailDigitado: string,
): T | null {
  if (candidatas.length === 0) return null;
  const exata = candidatas.find((c) => c.email.toLowerCase() === emailDigitado.toLowerCase());
  if (exata) return exata;
  return [...candidatas].sort(
    (a, b) =>
      (PESO_DO_PAPEL[a.role] ?? 3) - (PESO_DO_PAPEL[b.role] ?? 3) ||
      a.email.localeCompare(b.email),
  )[0];
}

export async function requestPasswordReset(
  email: string,
): Promise<{ token: string; enviarPara: string } | null> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return null;

  // Quem digita o próprio endereço recupera aquela conta, sempre. O endereço
  // de recuperação pode servir a várias (o pessoal do Nicolas responde por
  // três), e aí `findFirst` sem ordem devolvia qualquer uma delas: o link
  // chegava para uma conta que a pessoa não pediu, e o `findFirst` só não
  // errava por sorte do plano de consulta. A ordem agora é explícita: o
  // e-mail exato ganha, depois o papel mais alto, e o e-mail desempata.
  const candidatas = await prisma.adminIdentity.findMany({
    where: {
      ativo: true,
      OR: [
        { email: { equals: normalizedEmail, mode: "insensitive" } },
        { emailRecuperacao: { equals: normalizedEmail, mode: "insensitive" } },
      ],
    },
    orderBy: { email: "asc" },
  });
  if (candidatas.length === 0) return null;

  const identity = escolherParaRecuperacao(candidatas, normalizedEmail);
  if (!identity) return null;

  const rawToken = crypto.randomBytes(32).toString("hex");

  await prisma.adminIdentity.update({
    where: { id: identity.id },
    data: {
      resetTokenHash: hashResetToken(rawToken),
      resetTokenExpiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
    },
  });

  // O link vai para o endereço de recuperação quando ele existe: é o único
  // que a pessoa alcança quando perdeu a senha do e-mail profissional.
  return { token: rawToken, enviarPara: identity.emailRecuperacao ?? identity.email };
}

export async function resetPasswordWithToken(rawToken: string, newPassword: string): Promise<boolean> {
  const tokenHash = hashResetToken(rawToken);

  const identity = await prisma.adminIdentity.findFirst({
    where: {
      ativo: true,
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

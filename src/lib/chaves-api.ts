import crypto from "crypto";
import { NextRequest } from "next/server";
import { ehDaCasa, getAdmin, type AdminAtual } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Chaves de API do painel.
 *
 * Existem para agente e automação (Claude, Codex, n8n) cadastrarem e lerem
 * projeto, tarefa e marca sem depender de cookie de navegador — antes disso, o
 * jeito era escrever direto no banco de produção, sem auditoria nem regra.
 *
 * Três regras sustentam o desenho:
 *
 * 1. **O segredo não é guardado.** O banco tem o SHA-256 e um prefixo; quem
 *    perder a chave cria outra.
 * 2. **Escopo é por rota, e opt-in.** Só a rota que chama
 *    `getAdminOuChave(request, escopo)` aceita chave. As 70+ rotas que chamam
 *    `getAdmin()` continuam exigindo sessão de gente — inclusive tudo que mexe
 *    em dinheiro, cofre e acesso.
 * 3. **A chave age em nome de quem a criou** e morre junto com essa conta: se
 *    ela for desligada ou deixar de ser da casa, a chave para de valer.
 */

export const PREFIXO_DA_CHAVE = "avk_";

export const ESCOPOS = {
  "projetos:ler": "Ler projetos, tarefas e a lista de clientes",
  "projetos:escrever": "Criar e editar projetos, tarefas e mídia de projeto",
  "marcas:escrever": "Criar marcas de clientes",
} as const;

export type Escopo = keyof typeof ESCOPOS;

export function ehEscopo(valor: unknown): valor is Escopo {
  return typeof valor === "string" && Object.prototype.hasOwnProperty.call(ESCOPOS, valor);
}

/** Quem a chave representa, para a auditoria dizer que foi chave e qual. */
export type OrigemChave = { id: string; prefixo: string; nome: string };

export type AdminOuChave = AdminAtual & { chave?: OrigemChave };

export function hashDaChave(segredo: string): string {
  return crypto.createHash("sha256").update(segredo).digest("hex");
}

/**
 * Segredo novo: `avk_` + 32 bytes aleatórios em base64url. O prefixo mostrado
 * na lista são os 8 primeiros caracteres depois do `avk_` — suficientes para
 * reconhecer, inúteis para usar.
 */
export function gerarChave(): { segredo: string; prefixo: string; hash: string } {
  const segredo = `${PREFIXO_DA_CHAVE}${crypto.randomBytes(32).toString("base64url")}`;
  return {
    segredo,
    prefixo: segredo.slice(0, PREFIXO_DA_CHAVE.length + 8),
    hash: hashDaChave(segredo),
  };
}

/** Lê o `Authorization: Bearer avk_…`. Outros esquemas e tokens não são nossos. */
export function lerChaveDoCabecalho(cabecalho: string | null): string | null {
  if (!cabecalho) return null;
  const [esquema, valor] = cabecalho.trim().split(/\s+/, 2);
  if (esquema?.toLowerCase() !== "bearer" || !valor?.startsWith(PREFIXO_DA_CHAVE)) return null;
  return valor;
}

type ChaveGuardada = {
  revogadaEm: Date | null;
  expiraEm: Date | null;
  escopos: string[];
};

/** Motivo de recusa, ou `null` quando a chave vale para este escopo agora. */
export function motivoDeRecusa(chave: ChaveGuardada, escopo: Escopo, agora = new Date()): string | null {
  if (chave.revogadaEm) return "Chave revogada.";
  if (chave.expiraEm && chave.expiraEm.getTime() <= agora.getTime()) return "Chave expirada.";
  if (!chave.escopos.includes(escopo)) return `Chave sem o escopo ${escopo}.`;
  return null;
}

export type ResultadoDaChave =
  | { ok: true; admin: AdminOuChave }
  | { ok: false; erro: string };

/** Autentica um segredo `avk_…` para um escopo. Não olha cookie. */
export async function autenticarChave(segredo: string, escopo: Escopo): Promise<ResultadoDaChave> {
  const chave = await prisma.chaveDeApi.findUnique({ where: { hash: hashDaChave(segredo) } });
  if (!chave) return { ok: false, erro: "Chave inválida." };

  const motivo = motivoDeRecusa(chave, escopo);
  if (motivo) return { ok: false, erro: motivo };

  // O papel vem do banco a cada chamada: quem deixou de ser da casa leva as
  // chaves junto, sem ninguém precisar lembrar de revogar.
  const conta = await prisma.adminIdentity.findFirst({
    where: { id: chave.criadaPor, ativo: true },
    select: { id: true, nome: true, email: true, role: true },
  });
  if (!conta || !ehDaCasa(conta.role)) return { ok: false, erro: "A conta dona desta chave não tem mais acesso." };

  await prisma.chaveDeApi.update({ where: { id: chave.id }, data: { ultimoUsoEm: new Date() } });

  return {
    ok: true,
    admin: { ...conta, chave: { id: chave.id, prefixo: chave.prefixo, nome: chave.nome } },
  };
}

/**
 * Sessão de gente **ou** chave de API com o escopo pedido.
 *
 * Se a requisição traz `Bearer avk_…`, vale só a chave — um cookie junto não
 * salva uma chave revogada. Sem cabeçalho, é o `getAdmin()` de sempre.
 */
export async function getAdminOuChave(
  request: NextRequest,
  escopo: Escopo,
): Promise<{ admin: AdminOuChave | null; erro?: string }> {
  const segredo = lerChaveDoCabecalho(request.headers.get("authorization"));
  if (!segredo) return { admin: await getAdmin() };

  const resultado = await autenticarChave(segredo, escopo);
  return resultado.ok ? { admin: resultado.admin } : { admin: null, erro: resultado.erro };
}

/** Pedaço de `metadata` da auditoria: vazio para gente, a chave para máquina. */
export function rastroDaChave(admin: AdminOuChave): { chave?: OrigemChave } {
  return admin.chave ? { chave: admin.chave } : {};
}

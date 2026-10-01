import crypto from "crypto";
import { prisma } from "@/lib/prisma";

/**
 * Cofre de credenciais da plataforma.
 *
 * O que é segredo da Ávila Ops — `META_APP_SECRET`, chaves do Mercado Pago,
 * consumer keys do X — passa a viver cifrado no banco e a ser editado pela tela
 * `/operacao/credenciais`, em vez de copiado em doze `.env` pelo parque
 * (`docs/inventario-chaves-integracoes.md`).
 *
 * O token de cada cliente continua em `OrganizationIntegrationConnection`.
 * São camadas diferentes e não se misturam.
 *
 * Leitura pelo resto do código é sempre por `obterCredencial()`, que consulta o
 * cofre e cai no `process.env` quando a chave ainda não foi migrada. Isso deixa
 * a migração acontecer chave a chave, sem big bang.
 */

export type CategoriaCredencial =
  | "meta"
  | "whatsapp"
  | "instagram"
  | "threads"
  | "google"
  | "mercadopago"
  | "mercadolivre"
  | "x"
  | "bancos"
  | "outros";

export type StatusCredencial = "ATIVO" | "PENDENTE" | "APOSENTADA";

const CATEGORIA_POR_PREFIXO: ReadonlyArray<[string, CategoriaCredencial]> = [
  ["WHATSAPP_", "whatsapp"],
  ["INSTAGRAM_", "instagram"],
  ["THREADS_", "threads"],
  ["META_THREADS_", "threads"],
  ["META_", "meta"],
  ["FACEBOOK_", "meta"],
  ["GERENCIADOR_ANUNCIO_", "meta"],
  ["GOOGLE_", "google"],
  ["GCLOUD_", "google"],
  ["MERCADO_PAGO_", "mercadopago"],
  ["MERCADOPAGO_", "mercadopago"],
  ["MP_", "mercadopago"],
  ["ML_", "mercadolivre"],
  ["X_", "x"],
];

/**
 * Nem toda chave é segredo. Versão da Graph API, redirect URI e lista de
 * escopos são públicos por natureza — aparecem na própria URL de consentimento.
 * Tratar tudo como segredo obriga a revelar o que não precisa e treina o time a
 * clicar em "revelar" sem pensar.
 */
const SUFIXOS_PUBLICOS = [
  "_APP_ID", "_CLIENT_ID", "_PIXEL_ID", "_BUSINESS_ID", "_CATALOG_ID", "_CATALOGO_ID",
  "_PHONE_NUMBER_ID", "_WABA_AVILAOPS", "_WABA_TESTE", "_NEGOCIO_ID", "_MAPS_ID",
  "_GRAPH_VERSION", "_REDIRECT_URI", "_SCOPES", "_PUBLIC_KEY", "_PUBLIC_KEY_PROD",
  "_DISPLAY_NAME", "_CONTACT_EMAIL", "_WEBHOOK_URL", "_CUSTOMER_ID", "_TEST_EVENT_CODE",
  "_SITE_VERIFICATION", "_DOMAIN_VERIFICATION", "_CLOUD_PROJECT", "_SYNC_DAYS",
];

export function ehSegredo(chave: string) {
  if (SUFIXOS_PUBLICOS.some((sufixo) => chave.endsWith(sufixo))) return false;
  return /SECRET|TOKEN|KEY|SENHA|PASSWORD|PIN|CIPHER|CREDS|JSON/.test(chave);
}

export function categoriaDaChave(chave: string): CategoriaCredencial {
  for (const [prefixo, categoria] of CATEGORIA_POR_PREFIXO) {
    if (chave.startsWith(prefixo)) return categoria;
  }
  return "outros";
}

/**
 * Máscara guardada em claro ao lado do valor cifrado, para a lista mostrar algo
 * reconhecível sem decifrar nada. Valor curto vira só asteriscos: mostrar dois
 * caracteres de um PIN de seis entrega o PIN.
 */
export function mascarar(valor: string) {
  const limpo = valor.trim();
  if (limpo.length <= 8) return "•".repeat(Math.max(limpo.length, 4));
  return `${limpo.slice(0, 4)}…${limpo.slice(-4)}`;
}

function chaveDeCifra() {
  const bruta =
    process.env.CREDENCIAIS_ENCRYPTION_KEY || process.env.META_TOKEN_ENCRYPTION_KEY;
  if (!bruta) {
    throw new Error("CREDENCIAIS_ENCRYPTION_KEY não configurado");
  }
  return crypto.createHash("sha256").update(bruta).digest();
}

export function cifrar(valor: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", chaveDeCifra(), iv);
  const cifrado = Buffer.concat([cipher.update(valor, "utf8"), cipher.final()]);

  return [
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    cifrado.toString("base64url"),
  ].join(".");
}

export function decifrar(valor: string) {
  const [ivBruto, tagBruta, cifradoBruto] = valor.split(".");
  if (!ivBruto || !tagBruta || !cifradoBruto) {
    throw new Error("Credencial armazenada em formato inválido");
  }

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    chaveDeCifra(),
    Buffer.from(ivBruto, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagBruta, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(cifradoBruto, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

/**
 * Cache de processo. Sem ele, cada chamada de integração vira uma consulta ao
 * banco — e o sync da Meta lê a mesma chave dezenas de vezes por execução.
 * TTL curto porque girar uma credencial não pode exigir redeploy.
 */
const CACHE_MS = 60_000;
const cache = new Map<string, { valor: string | null; expiraEm: number }>();

export function limparCacheDeCredenciais() {
  cache.clear();
}

/**
 * Ponto único de leitura. Ordem: cofre, depois `process.env`.
 *
 * O fallback é o que torna a migração incremental: código que ainda lê
 * `process.env` direto continua funcionando, e código novo que chama esta
 * função passa a funcionar tanto com a chave migrada quanto sem.
 */
export async function obterCredencial(chave: string): Promise<string | null> {
  const agora = Date.now();
  const emCache = cache.get(chave);
  if (emCache && emCache.expiraEm > agora) return emCache.valor;

  let valor: string | null = null;

  try {
    const linha = await prisma.platformCredential.findUnique({
      where: { chave },
      select: { valorCipher: true, status: true },
    });

    if (linha?.valorCipher && linha.status !== "APOSENTADA") {
      valor = decifrar(linha.valorCipher);
    }
  } catch {
    // Banco fora, cofre ainda não migrado, chave de cifra ausente: cair no
    // ambiente é melhor que derrubar a integração inteira.
    valor = null;
  }

  if (!valor) valor = process.env[chave] ?? null;

  cache.set(chave, { valor, expiraEm: agora + CACHE_MS });
  return valor;
}

/** Igual a `obterCredencial`, mas estoura quando não há valor em lugar nenhum. */
export async function exigirCredencial(chave: string) {
  const valor = await obterCredencial(chave);
  if (!valor) throw new Error(`${chave} não configurado`);
  return valor;
}

export type CredencialEmLista = {
  chave: string;
  categoria: string;
  rotulo: string | null;
  descricao: string | null;
  segredo: boolean;
  status: string;
  mascara: string | null;
  preenchida: boolean;
  consumidores: string[];
  origem: string | null;
  grupo: string | null;
  atualizadoPor: string | null;
  rotacionadoEm: string | null;
  atualizadoEm: string;
};

export async function listarCredenciais(): Promise<CredencialEmLista[]> {
  const linhas = await prisma.platformCredential.findMany({
    orderBy: [{ categoria: "asc" }, { chave: "asc" }],
  });

  return linhas.map((linha) => ({
    chave: linha.chave,
    categoria: linha.categoria,
    rotulo: linha.rotulo,
    descricao: linha.descricao,
    segredo: linha.segredo,
    status: linha.status,
    // Chave pública mostra o valor na lista: não há o que esconder e ter que
    // clicar em "revelar" para ver uma versão de API é atrito à toa.
    mascara: linha.segredo
      ? linha.mascara
      : linha.valorCipher
        ? seguroDecifrar(linha.valorCipher)
        : null,
    preenchida: Boolean(linha.valorCipher),
    consumidores: Array.isArray(linha.consumidores) ? (linha.consumidores as string[]) : [],
    origem: linha.origem,
    grupo: linha.grupo,
    atualizadoPor: linha.atualizadoPor,
    rotacionadoEm: linha.rotacionadoEm?.toISOString() ?? null,
    atualizadoEm: linha.updatedAt.toISOString(),
  }));
}

function seguroDecifrar(valor: string) {
  try {
    return decifrar(valor);
  } catch {
    return null;
  }
}

/** Valor em claro. Só OWNER deve chegar aqui — quem chama confere o papel. */
export async function revelarCredencial(chave: string) {
  const linha = await prisma.platformCredential.findUnique({
    where: { chave },
    select: { valorCipher: true },
  });

  if (!linha?.valorCipher) return null;
  return decifrar(linha.valorCipher);
}

export type EntradaCredencial = {
  chave: string;
  valor?: string | null;
  categoria?: CategoriaCredencial;
  rotulo?: string | null;
  descricao?: string | null;
  consumidores?: string[];
  origem?: string;
  status?: StatusCredencial;
  /** Nome da instituição, para chave de banco cadastrada à mão. */
  grupo?: string | null;
  /**
   * Força a chave a ser tratada como segredo. Sem isto, vale `ehSegredo()`,
   * que decide pelo nome — e campo livre ("Senha do app", "Conta") tem nome
   * que ninguém previu.
   */
  segredo?: boolean;
};

export async function salvarCredencial(entrada: EntradaCredencial, atorId: string) {
  const chave = entrada.chave.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9_]*$/.test(chave)) {
    throw new Error("Nome de chave inválido: use MAIÚSCULAS_COM_UNDERSCORE.");
  }

  const temValor = typeof entrada.valor === "string" && entrada.valor.trim().length > 0;
  const valor = temValor ? entrada.valor!.trim() : null;

  const base = {
    categoria: entrada.categoria ?? categoriaDaChave(chave),
    rotulo: entrada.rotulo ?? null,
    descricao: entrada.descricao ?? null,
    // Campo livre de banco é sempre segredo, inclusive quando editado pelo
    // cofre completo, que não manda `segredo`: o nome foi o dono que deu, e
    // "BANCO_INTER__CONTA" não diz nada sobre ser sensível.
    segredo: entrada.segredo ?? (chave.startsWith("BANCO_") || ehSegredo(chave)),
    grupo: entrada.grupo ?? undefined,
    consumidores: entrada.consumidores ?? undefined,
    origem: entrada.origem ?? "manual",
    atualizadoPor: atorId,
  };

  const comValor = valor
    ? {
        valorCipher: cifrar(valor),
        mascara: mascarar(valor),
        status: entrada.status ?? ("ATIVO" as StatusCredencial),
        rotacionadoEm: new Date(),
      }
    : {
        status: entrada.status ?? ("PENDENTE" as StatusCredencial),
      };

  const linha = await prisma.platformCredential.upsert({
    where: { chave },
    create: { chave, ...base, ...comValor },
    update: { ...base, ...comValor },
  });

  cache.delete(chave);
  return linha;
}

export async function removerCredencial(chave: string) {
  await prisma.platformCredential.delete({ where: { chave } });
  cache.delete(chave);
}

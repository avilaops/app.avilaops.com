import "server-only";

/**
 * Porta de leitura do mail.avilaops.com.
 *
 * **Por que existe.** Até 10/09/2026 a ficha do cliente não perguntava ao mail
 * quais caixas existiam: lia um espelho em `organization_integrations` que só a
 * própria tela escrevia. Caixa criada por fora (pelo /admin do auth, pelo fluxo
 * n8n chamado direto, ou na mão) nunca chegava à ficha. A tela dizia "Nenhuma
 * caixa ainda" com a caixa no ar, e o botão "Criar caixa" respondia "já existe".
 * Duas telas certas cada uma na sua fonte, e o operador no meio sem entender.
 *
 * Espelho mente assim que alguém escreve pelo outro caminho. A correção não é
 * sincronizar melhor, é parar de ter cópia: quem quer saber, pergunta.
 *
 * **A divisão que fica.** Escrita continua pelo n8n (`auth-criar-caixa`), que é
 * onde mora a integração com efeito colateral. Leitura vem direto daqui, porque
 * pergunta não é integração: um salto a menos para falhar e para atrasar a tela.
 */

const BASE = process.env.MAIL_API_URL?.trim() || "https://mail.avilaops.com/api/v1";
const TIMEOUT_MS = 8_000;

export type CaixaDoMail = {
  endereco: string;
  nomeExibicao: string | null;
  status: string;
  quotaGb: number | null;
  usadoMb: number | null;
  ultimoLoginEm: string | null;
  criadaEm: string | null;
};

/**
 * O resultado distingue três coisas que a tela precisa dizer diferente:
 * caixas encontradas, domínio sem caixa nenhuma, e "não consegui perguntar".
 * Tratar falha de rede como lista vazia foi metade do problema original.
 */
export type LeituraDeCaixas =
  | { ok: true; caixas: CaixaDoMail[] }
  | { ok: false; erro: string };

function tokenDoMail() {
  const token = process.env.MAIL_API_TOKEN?.trim();
  return token && token.length > 8 ? token : null;
}

export function mailConfigurado() {
  return Boolean(tokenDoMail());
}

type CaixaCrua = {
  address?: unknown;
  displayName?: unknown;
  status?: unknown;
  quotaGb?: unknown;
  usedMb?: unknown;
  lastLoginAt?: unknown;
  createdAt?: unknown;
};

function texto(valor: unknown): string | null {
  return typeof valor === "string" && valor.trim() ? valor.trim() : null;
}

function numero(valor: unknown): number | null {
  return typeof valor === "number" && Number.isFinite(valor) ? valor : null;
}

function normalizar(crua: CaixaCrua): CaixaDoMail | null {
  const endereco = texto(crua.address);
  if (!endereco) return null;
  return {
    endereco: endereco.toLowerCase(),
    nomeExibicao: texto(crua.displayName),
    status: texto(crua.status)?.toUpperCase() ?? "ACTIVE",
    quotaGb: numero(crua.quotaGb),
    usadoMb: numero(crua.usedMb),
    ultimoLoginEm: texto(crua.lastLoginAt),
    criadaEm: texto(crua.createdAt),
  };
}

/** Caixas de um domínio, direto do mail. Nunca lança: devolve o erro descrito. */
export async function listarCaixasDoDominio(fqdn: string): Promise<LeituraDeCaixas> {
  const dominio = fqdn.trim().toLowerCase();
  if (!dominio) return { ok: false, erro: "Domínio vazio." };

  const token = tokenDoMail();
  if (!token) return { ok: false, erro: "MAIL_API_TOKEN não configurado no app." };

  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), TIMEOUT_MS);
  try {
    const resposta = await fetch(`${BASE}/domains/${encodeURIComponent(dominio)}/mailboxes`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controle.signal,
      cache: "no-store",
    });

    // Domínio que nunca foi provisionado no mail não é erro de leitura: é um
    // domínio sem caixa, e a ficha mostra isso como lista vazia.
    if (resposta.status === 404) return { ok: true, caixas: [] };

    if (!resposta.ok) {
      return { ok: false, erro: `mail.avilaops.com respondeu ${resposta.status}.` };
    }

    const corpo = (await resposta.json()) as { mailboxes?: unknown };
    const lista = Array.isArray(corpo?.mailboxes) ? corpo.mailboxes : [];
    const caixas = lista
      .map((item) => normalizar(item as CaixaCrua))
      .filter((c): c is CaixaDoMail => c !== null)
      .sort((a, b) => a.endereco.localeCompare(b.endereco));

    return { ok: true, caixas };
  } catch (erro) {
    const motivo = erro instanceof Error && erro.name === "AbortError"
      ? "o mail demorou demais para responder"
      : erro instanceof Error
        ? erro.message
        : "falha desconhecida";
    return { ok: false, erro: `Não consegui perguntar ao mail: ${motivo}.` };
  } finally {
    clearTimeout(relogio);
  }
}

/**
 * Caixas de vários domínios do mesmo cliente, em paralelo.
 *
 * Um domínio que falha não apaga o resultado dos outros, e a tela precisa saber
 * quais falharam para não afirmar "nenhuma caixa" sobre um domínio que ela não
 * conseguiu consultar.
 */
export async function listarCaixasDosDominios(fqdns: string[]): Promise<{
  caixas: CaixaDoMail[];
  dominiosComFalha: { fqdn: string; erro: string }[];
}> {
  const alvos = [...new Set(fqdns.map((f) => f.trim().toLowerCase()).filter(Boolean))];
  const leituras = await Promise.all(
    alvos.map(async (fqdn) => ({ fqdn, leitura: await listarCaixasDoDominio(fqdn) })),
  );

  const caixas: CaixaDoMail[] = [];
  const dominiosComFalha: { fqdn: string; erro: string }[] = [];
  for (const { fqdn, leitura } of leituras) {
    if (leitura.ok) caixas.push(...leitura.caixas);
    else dominiosComFalha.push({ fqdn, erro: leitura.erro });
  }

  caixas.sort((a, b) => a.endereco.localeCompare(b.endereco));
  return { caixas, dominiosComFalha };
}

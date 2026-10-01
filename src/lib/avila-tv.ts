/**
 * Cliente da API do agente Ávila TV (tv.avilaops.com).
 *
 * A regra de ouro deste módulo: **o agente é dono do estado das telas**. Ele
 * mantém a conexão de saída de cada tela (protocolo Ávila Link), o pulso de 30
 * segundos e a telemetria por minuto. Este painel lê e comanda — nunca guarda
 * cópia, nunca decide sozinho e nunca fala com a tela pelas costas do agente.
 *
 * Por isso não há tabela nova no banco daqui: uma cópia do estado das telas
 * ficaria desatualizada entre dois `revalidate` e passaria a discordar da
 * origem justamente quando alguém abre a tela para resolver uma queda.
 *
 * Alerta, recuperação e relatório continuam no n8n; esta é a superfície de
 * quem olha. Só é chamado do servidor: a chave nunca vai para o navegador.
 */
import "server-only";

const BASE = (process.env.AVILA_TV_API_URL ?? "https://tv.avilaops.com").replace(/\/+$/, "");

export class AgenteIndisponivel extends Error {}

export function agenteConfigurado(): boolean {
  return Boolean(process.env.AVILA_TV_API_KEY?.trim());
}

function chave(): string {
  const k = process.env.AVILA_TV_API_KEY?.trim();
  if (!k) throw new AgenteIndisponivel("AVILA_TV_API_KEY não configurada neste ambiente.");
  return k;
}

/** O pulso que a tela manda a cada 30 s. Campo novo lá não quebra nada aqui. */
export type PulsoDaTela = {
  uptime_s?: number;
  exibindo?: string | null;
  memoria_mb?: number;
  ip_local?: string;
  versao?: string;
  ultimo_erro?: string | null;
  ultimo_comando?: { id: string | null; comando: string; ok: boolean; em: string } | null;
  /**
   * Só no cliente do tipo `agente`: o inventário da LAN que ele alcança.
   *
   * É o que faz este painel enxergar a rede do cliente sem entrar nela. A
   * saúde de cada aparelho não vem aqui porque custa socket do lado de lá —
   * ela sai no comando `dispositivos`, pedido quando alguém quer.
   */
  dispositivos?: Array<{ id: string; tipo: string; recursos: string[] }>;
};

export type TelaDoAgente = {
  id: string;
  nome: string;
  tenant: string;
  cliente: { tipo: string; versao: string } | null;
  /** Allowlist própria. Vazia = herda a do agente (`origens_padrao`). */
  origens: string[];
  criadoEm: string;
  tokenTrocadoEm: string;
  vistoEm: string | null;
  revogadoEm: string | null;
  conectado: boolean;
  estado: "online" | "offline";
  pulso: PulsoDaTela | null;
  pulsoEm: string | null;
};

/** Tela mostrando código de 6 letras, esperando um humano aprovar. */
export type PendenteDoAgente = {
  codigo: string;
  expiraEm: string;
  desde: string;
  ip: string;
  cliente: { tipo: string; versao: string } | null;
  tela: { largura?: number; altura?: number } | null;
  so: string | null;
};

/** Telemetria agregada (F1-4): uma amostra por minuto, lida na janela pedida. */
export type SaudeDaTela = {
  dispositivo: string;
  nome: string | null;
  amostras: number;
  minutosOnline: number;
  disponibilidade: number;
  quedas: number;
  maiorQuedaMin: number;
  ultimaQuedaEm: string | null;
  uptimeMaxH: number | null;
  memoriaPicoMb: number | null;
  memoriaMediaMb: number | null;
  versao: string | null;
  versoes: string[];
};

export type RespostaLink = {
  dispositivos: number;
  online: number;
  aguardando_pareamento: number;
  origens_padrao: string[];
  telas: TelaDoAgente[];
  pendentes: PendenteDoAgente[];
};

export type RespostaSaude = {
  dias: number;
  desde: string;
  amostras: number;
  amostra_s: number;
  telas: SaudeDaTela[];
};

async function chamar<T>(caminho: string, init: { method?: string; body?: unknown; timeoutMs?: number } = {}): Promise<T> {
  let resposta: Response;
  try {
    resposta = await fetch(BASE + caminho, {
      method: init.method ?? "GET",
      headers: { "x-api-key": chave(), "content-type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(init.timeoutMs ?? 15_000),
      cache: "no-store",
    });
  } catch (erro) {
    if (erro instanceof AgenteIndisponivel) throw erro;
    // O agente mora num PC de casa atrás de túnel: fora do ar é rotina, não
    // exceção. Quem chama trata isso como estado da tela, não como erro 500.
    const motivo = erro instanceof Error && erro.name === "TimeoutError"
      ? "o agente demorou demais para responder"
      : erro instanceof Error ? erro.message : String(erro);
    throw new AgenteIndisponivel(`Não consegui falar com o agente Ávila TV: ${motivo}.`);
  }

  const texto = await resposta.text();
  let dados: unknown = null;
  try {
    dados = texto ? JSON.parse(texto) : null;
  } catch {
    dados = texto;
  }

  if (!resposta.ok) {
    // O agente responde `{ error, erro }`: `erro` é o código do protocolo
    // (`janela_silenciosa_22h_07h`, `origem_nao_autorizada`) e `error` é a
    // frase. A frase é o que a tela mostra; o código vai no `name`.
    const corpo = dados && typeof dados === "object" ? (dados as { error?: unknown; erro?: unknown }) : {};
    const frase = typeof corpo.error === "string" ? corpo.error : `o agente respondeu ${resposta.status}`;
    const falha = new Error(frase);
    if (typeof corpo.erro === "string") falha.name = corpo.erro;
    if (resposta.status === 401) throw new AgenteIndisponivel("O agente recusou a chave (AVILA_TV_API_KEY).");
    // O agente nunca responde 5xx: o erro dele é 409 de propósito, porque a
    // Cloudflare troca 502/504 do origin pela página dela. Então 5xx aqui é o
    // caminho até o agente (túnel caído, PC desligado: 502, 521, 530), e não
    // um pedido recusado. É o caso mais comum de "fora do ar" e precisa cair
    // no mesmo estado que o timeout, não virar "o agente respondeu 530".
    if (resposta.status >= 500) {
      throw new AgenteIndisponivel(`Não consegui falar com o agente Ávila TV: o caminho até ele respondeu ${resposta.status}.`);
    }
    throw falha;
  }

  return dados as T;
}

/**
 * Tudo que a tela do painel mostra, numa ida só.
 *
 * A saúde lê arquivo no disco do agente e o resto lê memória: são chamadas
 * separadas de propósito, e a falha da saúde não pode apagar a lista de telas
 * — sem histórico a página ainda precisa abrir e comandar.
 */
export async function lerPainelDeTelas(dias = 7): Promise<{
  lidoEm: string;
  link: RespostaLink;
  saude: RespostaSaude | null;
}> {
  const [link, saude] = await Promise.all([
    chamar<RespostaLink>("/api/link"),
    chamar<RespostaSaude>(`/api/link/saude?dias=${dias}`).catch(() => null),
  ]);
  return { lidoEm: new Date().toISOString(), link, saude };
}

/** Aprova um código de 6 letras e batiza a tela. O token nasce no agente. */
export const parearTela = (codigo: string, nome: string, origens?: string[]) =>
  chamar<{ ok: boolean; dispositivo: TelaDoAgente }>("/api/link/parear", {
    method: "POST",
    body: { codigo, nome, ...(origens?.length ? { origens } : {}) },
  });

/**
 * Manda um comando e espera a tela responder.
 *
 * O TTL do protocolo é de 60 s — tela desatualizada é melhor que tela de 40
 * minutos atrás —, então o tempo daqui tem que ser maior que o de lá, senão o
 * painel desiste antes de o agente concluir e o operador não sabe o que houve.
 */
export const enviarComando = (dispositivo: string, comando: string, params: Record<string, unknown> = {}) =>
  chamar<{ ok: boolean; resultado: Record<string, unknown> }>("/api/link/comando", {
    method: "POST",
    body: { dispositivo, comando, params },
    timeoutMs: 70_000,
  });

/** Apaga o token: a conexão cai e a tela volta a pedir código, sem tocar nela. */
export const revogarTela = (dispositivo: string) =>
  chamar<{ ok: boolean; dispositivo: TelaDoAgente }>("/api/link/revogar", {
    method: "POST",
    body: { dispositivo },
  });

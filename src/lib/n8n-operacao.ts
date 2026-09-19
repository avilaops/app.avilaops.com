/**
 * O n8n visto de dentro do painel.
 *
 * Até 18/09/2026 "Automações" era só o cofre de credenciais, e todo o resto
 * do n8n — quais fluxos existem, quais estão ligados, o que falhou hoje —
 * só aparecia abrindo o n8n.avilaops.com. Quem opera pelo celular não abre.
 *
 * Esta lib lê a API REST do n8n (a mesma chave que o cofre já usa) e devolve
 * o que a tela precisa, sem inventar nada: se a chave não estiver configurada
 * ou o n8n não responder, o resultado diz isso e a tela mostra o estado, não
 * um número de enfeite.
 */

const BASE = (process.env.N8N_API_BASE ?? "https://n8n.avilaops.com/api/v1").replace(/\/+$/, "");
/** Endereço do editor, para o link "abrir no n8n". */
export const N8N_EDITOR = (process.env.N8N_EDITOR_BASE ?? "https://n8n.avilaops.com").replace(/\/+$/, "");

export type StatusExecucao = "success" | "error" | "waiting" | "canceled" | "running" | "unknown";

export type ExecucaoN8n = {
  id: string;
  fluxoId: string;
  fluxo: string;
  status: StatusExecucao;
  modo: string;
  inicio: string;
  fim: string | null;
  duracaoMs: number | null;
};

export type FluxoN8n = {
  id: string;
  nome: string;
  ativo: boolean;
  atualizadoEm: string | null;
  /** Execuções nas últimas 24 h, com o recorte de falhas. */
  execucoes24h: number;
  falhas24h: number;
  ultimaExecucao: ExecucaoN8n | null;
  url: string;
};

export type ResumoAutomacoes = {
  conectado: boolean;
  /** Preenchido quando `conectado` é falso: diz por que não deu. */
  motivo: string | null;
  lidoEm: string;
  base: string;
  fluxos: FluxoN8n[];
  execucoes: ExecucaoN8n[];
  totais: {
    fluxos: number;
    ativos: number;
    execucoes24h: number;
    falhas24h: number;
    fluxosComFalha: number;
  };
};

type RespostaLista<T> = { data?: T[]; nextCursor?: string | null };

async function api<T>(caminho: string): Promise<T> {
  const chave = process.env.N8N_API_KEY?.trim();
  if (!chave) throw new Error("N8N_API_KEY não configurada no servidor.");
  const resposta = await fetch(`${BASE}/${caminho.replace(/^\/+/, "")}`, {
    headers: { "x-n8n-api-key": chave },
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  if (!resposta.ok) {
    throw new Error(`n8n respondeu ${resposta.status} em ${caminho}`);
  }
  return (await resposta.json()) as T;
}

function normalizarStatus(valor: unknown): StatusExecucao {
  const texto = String(valor ?? "").toLowerCase();
  if (texto === "success" || texto === "error" || texto === "waiting" || texto === "canceled" || texto === "running") {
    return texto;
  }
  // "crashed" e "failed" são falha para quem opera; o valor cru fica no detalhe.
  if (texto === "crashed" || texto === "failed") return "error";
  return "unknown";
}

/** Uma página só de cada endpoint: a tela mostra o topo, não o histórico inteiro. */
export async function lerAutomacoes(limiteExecucoes = 100): Promise<ResumoAutomacoes> {
  const lidoEm = new Date().toISOString();
  const vazio: ResumoAutomacoes = {
    conectado: false,
    motivo: null,
    lidoEm,
    base: BASE,
    fluxos: [],
    execucoes: [],
    totais: { fluxos: 0, ativos: 0, execucoes24h: 0, falhas24h: 0, fluxosComFalha: 0 },
  };

  try {
    const [fluxosBrutos, execucoesBrutas] = await Promise.all([
      api<RespostaLista<{ id: string; name: string; active: boolean; updatedAt?: string }>>("workflows?limit=250"),
      api<RespostaLista<{ id: number | string; workflowId: string; status?: string; mode?: string; startedAt?: string; stoppedAt?: string | null }>>(
        `executions?limit=${limiteExecucoes}&includeData=false`,
      ),
    ]);

    const nomePorId = new Map((fluxosBrutos.data ?? []).map((f) => [f.id, f.name]));
    const execucoes: ExecucaoN8n[] = (execucoesBrutas.data ?? []).map((e) => {
      const inicio = e.startedAt ?? lidoEm;
      const fim = e.stoppedAt ?? null;
      return {
        id: String(e.id),
        fluxoId: e.workflowId,
        fluxo: nomePorId.get(e.workflowId) ?? "(fluxo removido)",
        status: normalizarStatus(e.status),
        modo: e.mode ?? "desconhecido",
        inicio,
        fim,
        duracaoMs: fim ? Math.max(0, new Date(fim).getTime() - new Date(inicio).getTime()) : null,
      };
    });

    const corte = Date.now() - 24 * 60 * 60_000;
    const ultimas24h = execucoes.filter((e) => new Date(e.inicio).getTime() >= corte);

    const fluxos: FluxoN8n[] = (fluxosBrutos.data ?? [])
      .map((f) => {
        const doFluxo = execucoes.filter((e) => e.fluxoId === f.id);
        const naJanela = ultimas24h.filter((e) => e.fluxoId === f.id);
        return {
          id: f.id,
          nome: f.name,
          ativo: Boolean(f.active),
          atualizadoEm: f.updatedAt ?? null,
          execucoes24h: naJanela.length,
          falhas24h: naJanela.filter((e) => e.status === "error").length,
          ultimaExecucao: doFluxo[0] ?? null,
          url: `${N8N_EDITOR}/workflow/${f.id}`,
        };
      })
      // Quem falhou primeiro, depois quem roda mais, depois o resto em ordem alfabética.
      .sort(
        (a, b) =>
          b.falhas24h - a.falhas24h ||
          b.execucoes24h - a.execucoes24h ||
          Number(b.ativo) - Number(a.ativo) ||
          a.nome.localeCompare(b.nome, "pt-BR"),
      );

    return {
      conectado: true,
      motivo: null,
      lidoEm,
      base: BASE,
      fluxos,
      execucoes,
      totais: {
        fluxos: fluxos.length,
        ativos: fluxos.filter((f) => f.ativo).length,
        execucoes24h: ultimas24h.length,
        falhas24h: ultimas24h.filter((e) => e.status === "error").length,
        fluxosComFalha: fluxos.filter((f) => f.falhas24h > 0).length,
      },
    };
  } catch (erro) {
    return { ...vazio, motivo: erro instanceof Error ? erro.message : "Falha ao falar com o n8n." };
  }
}

/** "há 3 min", "há 2 h", "ontem" — o mesmo jeito da tela de saúde. */
export function quandoFoi(iso: string | null, agora = Date.now()): string {
  if (!iso) return "nunca";
  const segundos = Math.max(0, Math.round((agora - new Date(iso).getTime()) / 1000));
  if (segundos < 60) return `há ${segundos}s`;
  if (segundos < 3600) return `há ${Math.floor(segundos / 60)} min`;
  if (segundos < 86_400) return `há ${Math.floor(segundos / 3600)} h`;
  const dias = Math.floor(segundos / 86_400);
  return dias === 1 ? "ontem" : `há ${dias} dias`;
}

export function duracaoLegivel(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1).replace(".", ",")} s`;
  return `${Math.floor(ms / 60_000)} min ${Math.round((ms % 60_000) / 1000)} s`;
}

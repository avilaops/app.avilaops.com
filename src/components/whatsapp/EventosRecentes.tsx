import BadgeStatus from "@/components/sistema/Status";
import EstadoVazio from "@/components/hub-social/EstadoVazio";
import BotaoEvidencia from "@/components/hub-social/FolhaEvidencia";
import type { Evidencia } from "@/lib/evidencia";

/**
 * Últimos eventos do WhatsApp gravados em integration_webhook_events.
 * Cada linha é um gatilho da FolhaEvidencia: quem audita vê a chave de
 * idempotência, o horário de gravação e o payload bruto sem sair da tela.
 */

export type EventoWhatsapp = {
  id: string;
  eventType: string;
  status: string;
  receivedAt: string;
  processedAt: string | null;
  idempotencyKey: string | null;
  externalId: string | null;
  error: string | null;
  payload: unknown;
};

const formatoDataHora = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

function formatarDataHora(iso: string) {
  const data = new Date(iso);
  return Number.isNaN(data.getTime()) ? "data inválida" : formatoDataHora.format(data);
}

export type ContextoEventos = { funcao?: string; vazioTitulo?: string; vazioDescricao?: string };

function evidenciaDoEvento(evento: EventoWhatsapp, lidoEm: string, funcaoOverride?: string): Evidencia {
  return {
    rotulo: evento.eventType,
    origem: "integrationWebhookEvent (Postgres)",
    funcao:
      funcaoOverride ??
      (evento.eventType === "flow"
        ? "processWhatsappFlowPayload() em src/lib/whatsapp.ts"
        : "registerWhatsappWebhookPayload() em src/lib/whatsapp.ts"),
    formula: "uma linha por entrada do webhook, identificada pela chave de idempotência",
    referencia: evento.idempotencyKey ?? evento.id,
    lidoEm,
    gravadoEm: evento.receivedAt,
    observacao: evento.error ? `Erro registrado: ${evento.error}` : undefined,
    bruto: evento.payload,
  };
}

export default function EventosRecentes({
  eventos,
  lidoEm,
  contexto,
}: {
  eventos: EventoWhatsapp[];
  lidoEm: string;
  contexto?: ContextoEventos;
}) {
  if (eventos.length === 0) {
    return (
      <EstadoVazio
        titulo={contexto?.vazioTitulo ?? "Nenhum evento recebido ainda."}
        descricao={contexto?.vazioDescricao ?? "Quando a Meta chamar o webhook, os eventos aparecem aqui."}
        acao={contexto ? undefined : { label: "Ver URLs oficiais", href: "#urls" }}
      />
    );
  }

  return (
    <div className="w-full min-w-0 overflow-hidden rounded-xl border border-border bg-card">
      <header className="border-b border-border px-4 pt-4 pb-3">
        <h2 className="text-[15px] font-semibold text-foreground">Eventos recentes</h2>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          Os {eventos.length} mais recentes gravados pelo webhook. Toque numa linha para ver a evidência.
        </p>
      </header>

      <ul className="m-0 list-none divide-y divide-border p-0">
        {eventos.map((evento) => (
          <li
            key={evento.id}
            className="[&>button]:flex [&>button]:min-h-14 [&>button]:w-full [&>button]:items-center [&>button]:justify-between [&>button]:gap-3 [&>button]:rounded-none [&>button]:px-4 [&>button]:py-2.5 [&>button]:text-left [&>button]:text-foreground [&>button:hover]:bg-accent"
          >
            <BotaoEvidencia
              evidencia={evidenciaDoEvento(evento, lidoEm, contexto?.funcao)}
              rotulo={`Detalhes do evento ${evento.eventType}`}
            >
              <span className="flex min-w-0 flex-1 flex-col gap-1 min-[560px]:flex-row min-[560px]:items-center min-[560px]:gap-3">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-[15px] font-medium min-[821px]:text-sm">{evento.eventType}</span>
                  <BadgeStatus status={evento.status} />
                </span>
                <span className="text-[13px] text-muted-foreground min-[560px]:ml-auto">
                  {formatarDataHora(evento.receivedAt)}
                </span>
              </span>
              <span aria-hidden="true" className="shrink-0 text-lg leading-none text-muted-foreground">
                ›
              </span>
            </BotaoEvidencia>
          </li>
        ))}
      </ul>
    </div>
  );
}

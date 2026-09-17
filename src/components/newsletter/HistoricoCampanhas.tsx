"use client";

import BadgeStatus from "@/components/hub-social/BadgeStatus";
import EstadoVazio from "@/components/hub-social/EstadoVazio";
import BotaoEvidencia from "@/components/hub-social/FolhaEvidencia";
import { Button } from "@/components/shadcn/button";
import { FORMAT_LABEL, STATUS_LABEL, formatDate, type Campaign, type Readiness } from "@/components/newsletter/tipos";
import type { TomStatus } from "@/lib/status-rotulos";

/**
 * Aba Histórico: as 25 campanhas mais recentes. Rascunho e envio parcial
 * mantêm o botão de enviar/continuar; enviada mostra a data. A evidência de
 * cada linha é a própria campanha como veio de getNewsletterOverview().
 */

const TOM_POR_STATUS: Record<string, TomStatus> = {
  SENT: "bom",
  SENDING: "info",
  FAILED: "ruim",
  DRAFT: "neutro",
};

export default function HistoricoCampanhas({
  campaigns,
  ocupadoEm,
  readiness,
  lidoEm,
  aoEnviar,
  aoCompor,
}: {
  campaigns: Campaign[];
  ocupadoEm: string;
  readiness: Readiness;
  lidoEm: string;
  aoEnviar: (campaignId: string) => void;
  aoCompor: () => void;
}) {
  return (
    <section id="historico" aria-label="Campanhas" className="scroll-mt-4">
      {campaigns.length === 0 ? (
        <EstadoVazio
          titulo="Nenhuma campanha ainda."
          descricao="Componha a primeira e envie um teste antes de disparar."
          acao={
            <Button
              type="button"
              onClick={aoCompor}
              className="min-h-11 w-full px-5 text-[15px] min-[821px]:min-h-10 min-[821px]:text-sm"
            >
              Nova campanha
            </Button>
          }
        />
      ) : (
        <div className="w-full min-w-0 overflow-hidden rounded-xl border border-border bg-card">
          <header className="border-b border-border px-4 pt-4 pb-3">
            <h2 className="text-[17px] font-semibold text-foreground min-[821px]:text-[15px]">Campanhas</h2>
            <p className="mt-0.5 text-[13px] text-muted-foreground">{campaigns.length} no histórico, da mais nova à mais antiga.</p>
          </header>

          <ul className="m-0 list-none p-0">
            {campaigns.map((campaign) => (
              <li
                key={campaign.id}
                className="flex min-h-[60px] flex-col gap-2 border-b border-border px-4 py-3 last:border-b-0 min-[821px]:flex-row min-[821px]:items-center min-[821px]:gap-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-medium text-foreground min-[821px]:text-sm">{campaign.name}</p>
                  <p className="truncate text-[13px] text-muted-foreground">{campaign.subject}</p>
                  <p className="text-[13px] text-muted-foreground">
                    {FORMAT_LABEL[campaign.format] ?? campaign.format} ·{" "}
                    {campaign.audienceTags.length === 0 ? "todos os inscritos" : campaign.audienceTags.join(", ")} · criada em{" "}
                    {formatDate(campaign.createdAt)}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 min-[821px]:gap-3">
                  <span className="font-mono text-[13px] tabular-nums text-muted-foreground">
                    {campaign.sentCount} enviados · {campaign.failedCount} falhas · {campaign.recipientCount} na fila
                  </span>

                  <BadgeStatus
                    status={campaign.status}
                    texto={STATUS_LABEL[campaign.status] ?? campaign.status}
                    tom={TOM_POR_STATUS[campaign.status] ?? "neutro"}
                  />

                  {campaign.status === "SENT" ? (
                    <span className="text-[13px] text-muted-foreground">{formatDate(campaign.sentAt)}</span>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={ocupadoEm === campaign.id || !readiness.ready}
                      onClick={() => aoEnviar(campaign.id)}
                      className="min-h-11 text-[14px] min-[821px]:min-h-8"
                    >
                      {campaign.status === "SENDING" ? "Continuar envio" : "Enviar"}
                    </Button>
                  )}

                  <span className="-mr-2 ml-auto min-[821px]:ml-0">
                    <BotaoEvidencia
                      rotulo={`Evidência de ${campaign.name}`}
                      evidencia={{
                        rotulo: campaign.name,
                        origem: "newsletterCampaign (Postgres)",
                        funcao: "getNewsletterOverview() em src/lib/newsletter.ts",
                        referencia: campaign.id,
                        gravadoEm: campaign.createdAt,
                        lidoEm,
                        bruto: campaign,
                      }}
                    />
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

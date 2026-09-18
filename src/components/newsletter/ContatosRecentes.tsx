"use client";

import BadgeStatus from "@/components/sistema/Status";
import EstadoVazio from "@/components/hub-social/EstadoVazio";
import BotaoEvidencia from "@/components/hub-social/FolhaEvidencia";
import { Badge } from "@/components/shadcn/badge";
import { Button } from "@/components/shadcn/button";
import { STATUS_LABEL, type Contact } from "@/components/newsletter/tipos";
import type { TomStatus } from "@/lib/status-rotulos";

/**
 * Aba Contatos, parte de baixo: os 200 contatos mais recentes em cartão de
 * andares. Cada linha tem a ação de descadastrar/reinscrever e a evidência
 * (linha do newsletterContact como a API devolveu).
 *
 * Abaixo de 561px o e-mail ganha a linha inteira e selo e ações descem para
 * um andar próprio: lado a lado, sobrava menos de um terço da largura para o
 * endereço e ele aparecia cortado no meio ("nicolas.ferrei…").
 */

const TOM_POR_STATUS: Record<string, TomStatus> = {
  SUBSCRIBED: "bom",
  UNSUBSCRIBED: "neutro",
  BOUNCED: "ruim",
};

export default function ContatosRecentes({
  contacts,
  ocupadoEm,
  lidoEm,
  aoMudarStatus,
  aoImportar,
}: {
  contacts: Contact[];
  ocupadoEm: string;
  lidoEm: string;
  aoMudarStatus: (contact: Contact, status: string) => void;
  aoImportar: () => void;
}) {
  return (
    <section id="contatos" aria-label="Contatos recentes" className="scroll-mt-4">
      {contacts.length === 0 ? (
        <EstadoVazio
          titulo="Nenhum contato na base."
          descricao="Importe a lista de clientes para começar."
          acao={
            <Button
              type="button"
              onClick={aoImportar}
              className="min-h-11 w-full px-5 text-[15px] min-[821px]:min-h-10 min-[821px]:text-sm"
            >
              Importar contatos
            </Button>
          }
        />
      ) : (
        <div className="w-full min-w-0 overflow-hidden rounded-xl border border-border bg-card">
          <header className="border-b border-border px-4 pt-4 pb-3">
            <h2 className="text-[17px] font-semibold text-foreground min-[821px]:text-[15px]">Contatos recentes</h2>
            <p className="mt-0.5 text-[13px] text-muted-foreground">{contacts.length} exibidos, do mais novo ao mais antigo.</p>
          </header>

          <ul className="m-0 list-none p-0">
            {contacts.map((contact) => {
              const inscrito = contact.status === "SUBSCRIBED";
              const badge = (
                <BadgeStatus
                  status={contact.status}
                  texto={STATUS_LABEL[contact.status] ?? contact.status}
                  tom={TOM_POR_STATUS[contact.status] ?? "neutro"}
                />
              );
              return (
                <li
                  key={contact.id}
                  className="flex min-h-14 flex-col gap-1.5 border-b border-border px-4 py-2.5 last:border-b-0 min-[561px]:flex-row min-[561px]:items-center min-[561px]:gap-3 min-[561px]:py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-medium text-foreground min-[821px]:text-sm">{contact.email}</p>
                    <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
                      {contact.name ?? "-"}
                      {contact.company ? ` · ${contact.company}` : ""} · {contact.source.toLowerCase()}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      {contact.tags.length === 0 ? (
                        <span className="text-[12px] text-muted-foreground">sem etiqueta</span>
                      ) : (
                        contact.tags.map((tag) => (
                          <Badge key={tag} variant="outline" className="h-5 px-1.5 text-[11px]">
                            {tag}
                          </Badge>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="-mr-2 flex shrink-0 items-center gap-1 max-[560px]:justify-end min-[561px]:gap-2">
                    {badge}

                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={ocupadoEm === contact.id}
                      onClick={() => aoMudarStatus(contact, inscrito ? "UNSUBSCRIBED" : "SUBSCRIBED")}
                      className="min-h-11 px-2 text-[14px] min-[821px]:px-3"
                    >
                      {inscrito ? "Descadastrar" : "Reinscrever"}
                    </Button>

                    <BotaoEvidencia
                      rotulo={`Evidência de ${contact.email}`}
                      evidencia={{
                        rotulo: contact.email,
                        origem: "newsletterContact (Postgres)",
                        funcao: "getNewsletterOverview() em src/lib/newsletter.ts",
                        referencia: contact.id,
                        gravadoEm: contact.createdAt,
                        lidoEm,
                        bruto: contact,
                      }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}

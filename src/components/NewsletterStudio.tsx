"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import GradeMetricas, { Metrica } from "@/components/hub-social/Metricas";
import ComporCampanha from "@/components/newsletter/ComporCampanha";
import ContatosRecentes from "@/components/newsletter/ContatosRecentes";
import HistoricoCampanhas from "@/components/newsletter/HistoricoCampanhas";
import ImportarContatos from "@/components/newsletter/ImportarContatos";
import Toast, { type TomToast } from "@/components/newsletter/Toast";
import { call } from "@/components/newsletter/api";
import { EMPTY_DRAFT, type Aba, type Campaign, type Contact, type Draft, type Overview, type Previa, type Readiness } from "@/components/newsletter/tipos";
import { Button } from "@/components/shadcn/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/shadcn/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/shadcn/tabs";

const ORIGEM = "getNewsletterOverview() em src/lib/newsletter.ts";

export default function NewsletterStudio({
  overview,
  readiness,
  adminEmail,
  lidoEm,
}: {
  overview: Overview;
  readiness: Readiness;
  adminEmail: string;
  lidoEm: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Aba>("contatos");
  const [busy, setBusy] = useState("");
  const [aviso, setAviso] = useState<{ texto: string; tom: TomToast } | null>(null);
  const [envioPendente, setEnvioPendente] = useState<{ campaignId?: string } | null>(null);

  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [preview, setPreview] = useState<Previa>({ html: "", recipients: 0 });
  const [testTo, setTestTo] = useState(adminEmail);
  const refEmails = useRef<HTMLTextAreaElement>(null);

  const audienceLabel = useMemo(
    () => (draft.audienceTags.length === 0 ? "todos os inscritos" : draft.audienceTags.join(", ")),
    [draft.audienceTags],
  );

  const feedback = useCallback((texto: string, kind: TomToast) => setAviso({ texto, tom: kind }), []);
  const fecharAviso = useCallback(() => setAviso(null), []);

  const refreshPreview = useCallback(async () => {
    try {
      const result = await call<{ html: string; recipients: number }>("/api/newsletter/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...draft, audienceTags: draft.audienceTags.join(",") }),
      });
      setPreview({ html: result.html, recipients: result.recipients });
    } catch {
      setPreview({ html: "", recipients: 0 });
    }
  }, [draft]);

  useEffect(() => {
    if (tab !== "campanha") return;
    const timer = setTimeout(refreshPreview, 500);
    return () => clearTimeout(timer);
  }, [tab, refreshPreview]);

  async function importContacts(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const mode = String(form.get("mode") ?? "paste");
    setBusy("import");

    try {
      const result = await call<{ summary: { created: number; updated: number; ignored: number; invalid: number; ignoredSamples: string[] } }>(
        "/api/newsletter/contacts",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            mode,
            raw: form.get("raw"),
            tags: form.get("tags"),
            keepMachineAddresses: form.get("keepMachineAddresses") === "on",
          }),
        },
      );
      const { created, updated, ignored, invalid } = result.summary;
      feedback(`${created} novos, ${updated} atualizados, ${ignored} descartados (caixa automática), ${invalid} inválidos.`, "ok");
      router.refresh();
    } catch (caught) {
      feedback(caught instanceof Error ? caught.message : "Falha na importação.", "erro");
    } finally {
      setBusy("");
    }
  }

  async function changeContactStatus(contact: Contact, status: string) {
    setBusy(contact.id);
    try {
      await call(`/api/newsletter/contacts/${contact.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      });
      router.refresh();
    } catch (caught) {
      feedback(caught instanceof Error ? caught.message : "Não foi possível atualizar.", "erro");
    } finally {
      setBusy("");
    }
  }

  async function uploadImage(file: File) {
    setBusy("upload");
    try {
      const body = new FormData();
      body.append("file", file);
      const result = await call<{ url: string }>("/api/newsletter/imagens", { method: "POST", body });
      setDraft((current) => ({ ...current, imageUrl: result.url }));
      feedback("Imagem enviada.", "ok");
    } catch (caught) {
      feedback(caught instanceof Error ? caught.message : "Falha no envio da imagem.", "erro");
    } finally {
      setBusy("");
    }
  }

  async function saveDraft(): Promise<string | null> {
    const body = JSON.stringify({ ...draft, audienceTags: draft.audienceTags.join(",") });
    const result = await call<{ campaign: Campaign }>(draft.id ? `/api/newsletter/campaigns/${draft.id}` : "/api/newsletter/campaigns", {
      method: draft.id ? "PUT" : "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    setDraft((current) => ({ ...current, id: result.campaign.id }));
    return result.campaign.id;
  }

  async function handleSave() {
    setBusy("save");
    try {
      await saveDraft();
      feedback("Rascunho salvo.", "ok");
      router.refresh();
    } catch (caught) {
      feedback(caught instanceof Error ? caught.message : "Não foi possível salvar.", "erro");
    } finally {
      setBusy("");
    }
  }

  async function handleTest() {
    setBusy("test");
    try {
      const id = await saveDraft();
      await call(`/api/newsletter/campaigns/${id}/teste`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ to: testTo }),
      });
      feedback(`Teste enviado para ${testTo}.`, "ok");
    } catch (caught) {
      feedback(caught instanceof Error ? caught.message : "Não foi possível enviar o teste.", "erro");
    } finally {
      setBusy("");
    }
  }

  async function handleSend(campaignId?: string) {
    const id = campaignId ?? draft.id;
    setBusy(id ?? "send");
    try {
      const target = id ?? (await saveDraft());
      const result = await call<{ result: { sent: number; failed: number; remaining: number; status: string } }>(
        `/api/newsletter/campaigns/${target}/send`,
        { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}) },
      );
      const { sent, failed, remaining } = result.result;
      feedback(
        remaining > 0
          ? `${sent} enviados, ${failed} falhas. Faltam ${remaining} - use “continuar envio”.`
          : `Envio concluído: ${sent} enviados, ${failed} falhas.`,
        failed > 0 && sent === 0 ? "erro" : "ok",
      );
      if (!campaignId) setDraft(EMPTY_DRAFT);
      setTab("historico");
      router.refresh();
    } catch (caught) {
      feedback(caught instanceof Error ? caught.message : "Não foi possível enviar.", "erro");
    } finally {
      setBusy("");
    }
  }

  function confirmarEnvio() {
    const pendente = envioPendente;
    setEnvioPendente(null);
    if (pendente) void handleSend(pendente.campaignId);
  }

  function toggleTag(tag: string) {
    setDraft((current) => ({
      ...current,
      audienceTags: current.audienceTags.includes(tag)
        ? current.audienceTags.filter((item) => item !== tag)
        : [...current.audienceTags, tag],
    }));
  }

  function irParaImportacao() {
    setTab("contatos");
    requestAnimationFrame(() => refEmails.current?.focus());
  }

  const alvoDoEnvio = envioPendente?.campaignId ? "esta campanha" : `${preview.recipients} contatos (${audienceLabel})`;
  const { metrics } = overview;
  const brutoMetricas = { ...metrics };

  return (
    <div className="flex flex-col gap-6">
      <GradeMetricas rotulo="Base de contatos">
        <Metrica
          rotulo="Inscritos"
          valor={metrics.subscribed}
          detalhe="recebem a próxima campanha"
          tom={metrics.subscribed > 0 ? "bom" : "neutro"}
          href="#contatos"
          evidencia={{ rotulo: "Inscritos", origem: ORIGEM, formula: "prisma.newsletterContact.count onde status = SUBSCRIBED", lidoEm, bruto: brutoMetricas }}
        />
        <Metrica
          rotulo="Descadastrados"
          valor={metrics.unsubscribed}
          detalhe="nunca voltam por importação"
          evidencia={{ rotulo: "Descadastrados", origem: ORIGEM, formula: "prisma.newsletterContact.count onde status = UNSUBSCRIBED", lidoEm, bruto: brutoMetricas }}
        />
        <Metrica
          rotulo="Base total"
          valor={metrics.total}
          detalhe="contatos registrados"
          evidencia={{ rotulo: "Base total", origem: ORIGEM, formula: "prisma.newsletterContact.count, qualquer status", lidoEm, bruto: brutoMetricas }}
        />
        <Metrica
          rotulo="Campanhas enviadas"
          valor={metrics.campaignsSent}
          detalhe={`motor: ${readiness.driver}`}
          href="#historico"
          evidencia={{
            rotulo: "Campanhas enviadas",
            origem: ORIGEM,
            formula: "campanhas com status SENT entre as 25 mais recentes (take: 25)",
            observacao: "Não é o total histórico: campanhas enviadas além das 25 mais recentes não entram na conta.",
            lidoEm,
            bruto: brutoMetricas,
          }}
        />
      </GradeMetricas>

      {!readiness.ready ? (
        <div role="note" className="rounded-xl border border-[color:var(--amber-line)] bg-card p-4 text-[15px] leading-5 min-[821px]:text-sm">
          Envio indisponível: {readiness.reason}
        </div>
      ) : null}

      <Tabs value={tab} onValueChange={(valor) => setTab(valor as Aba)} className="gap-4">
        <TabsList className="max-w-full justify-start overflow-x-auto [scrollbar-width:none] max-[560px]:w-full">
          <TabsTrigger value="contatos" className="min-h-9 px-4">
            Contatos
          </TabsTrigger>
          <TabsTrigger value="campanha" className="min-h-9 px-4">
            Nova campanha
          </TabsTrigger>
          <TabsTrigger value="historico" className="min-h-9 px-4">
            Histórico
          </TabsTrigger>
        </TabsList>

        <TabsContent value="contatos" className="flex flex-col gap-6">
          <ImportarContatos
            aoEnviar={importContacts}
            ocupado={busy === "import"}
            inscritos={metrics.subscribed}
            tags={overview.tags}
            refEmails={refEmails}
          />
          <ContatosRecentes
            contacts={overview.contacts}
            ocupadoEm={busy}
            lidoEm={lidoEm}
            aoMudarStatus={changeContactStatus}
            aoImportar={irParaImportacao}
          />
        </TabsContent>

        <TabsContent value="campanha">
          <ComporCampanha
            draft={draft}
            setDraft={setDraft}
            preview={preview}
            audienceLabel={audienceLabel}
            tags={overview.tags}
            testTo={testTo}
            setTestTo={setTestTo}
            readiness={readiness}
            ocupadoEm={busy}
            aoEnviarImagem={(file) => void uploadImage(file)}
            aoToggleTag={toggleTag}
            aoSalvar={handleSave}
            aoTestar={handleTest}
            aoPedirEnvio={() => setEnvioPendente({})}
          />
        </TabsContent>

        <TabsContent value="historico">
          <HistoricoCampanhas
            campaigns={overview.campaigns}
            ocupadoEm={busy}
            readiness={readiness}
            lidoEm={lidoEm}
            aoEnviar={(campaignId) => setEnvioPendente({ campaignId })}
            aoCompor={() => setTab("campanha")}
          />
        </TabsContent>
      </Tabs>

      <Dialog open={envioPendente !== null} onOpenChange={(aberto) => !aberto && setEnvioPendente(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar campanha?</DialogTitle>
            <DialogDescription>Enviar para {alvoDoEnvio}? Não dá para desfazer depois que sair.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEnvioPendente(null)} className="min-h-11">
              Cancelar
            </Button>
            <Button type="button" onClick={confirmarEnvio} className="min-h-11">
              Enviar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {aviso ? <Toast texto={aviso.texto} tom={aviso.tom} aoFechar={fecharAviso} /> : null}
    </div>
  );
}

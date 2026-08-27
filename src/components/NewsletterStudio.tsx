"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Contact = {
  id: string;
  email: string;
  name: string | null;
  company: string | null;
  source: string;
  status: string;
  tags: string[];
  createdAt: string;
};

type Campaign = {
  id: string;
  name: string;
  subject: string;
  format: string;
  status: string;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  audienceTags: string[];
  createdAt: string;
  sentAt: string | null;
};

type Overview = {
  metrics: { subscribed: number; unsubscribed: number; total: number; campaignsSent: number };
  tags: { tag: string; count: number }[];
  campaigns: Campaign[];
  contacts: Contact[];
};

type Readiness = { ready: boolean; driver: string; reason: string };

type Draft = {
  id: string | null;
  name: string;
  subject: string;
  previewText: string;
  format: "HTML" | "TEXT" | "IMAGE";
  html: string;
  text: string;
  imageUrl: string;
  imageAlt: string;
  imageLinkUrl: string;
  audienceTags: string[];
};

const EMPTY_DRAFT: Draft = {
  id: null,
  name: "",
  subject: "",
  previewText: "",
  format: "HTML",
  html: "",
  text: "",
  imageUrl: "",
  imageAlt: "",
  imageLinkUrl: "",
  audienceTags: [],
};

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Rascunho",
  SENDING: "Enviando",
  SENT: "Enviada",
  FAILED: "Falhou",
  SUBSCRIBED: "Inscrito",
  UNSUBSCRIBED: "Descadastrado",
  BOUNCED: "Retornou",
};

const FORMAT_LABEL: Record<string, string> = {
  HTML: "HTML",
  TEXT: "Mensagem",
  IMAGE: "Imagem",
};

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

export default function NewsletterStudio({
  overview,
  readiness,
  adminEmail,
}: {
  overview: Overview;
  readiness: Readiness;
  adminEmail: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"contatos" | "campanha" | "historico">("contatos");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [preview, setPreview] = useState<{ html: string; recipients: number }>({ html: "", recipients: 0 });
  const [testTo, setTestTo] = useState(adminEmail);

  const audienceLabel = useMemo(
    () => (draft.audienceTags.length === 0 ? "todos os inscritos" : draft.audienceTags.join(", ")),
    [draft.audienceTags],
  );

  const feedback = useCallback((text: string, kind: "ok" | "erro") => {
    if (kind === "ok") {
      setMessage(text);
      setError("");
    } else {
      setError(text);
      setMessage("");
    }
  }, []);

  async function call<T>(url: string, init: RequestInit): Promise<T> {
    const response = await fetch(url, init);
    const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
    if (!response.ok) throw new Error(payload.error ?? "Operação não concluída.");
    return payload;
  }

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
      feedback(
        `${created} novos, ${updated} atualizados, ${ignored} descartados (caixa automática), ${invalid} inválidos.`,
        "ok",
      );
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
    const result = await call<{ campaign: Campaign }>(
      draft.id ? `/api/newsletter/campaigns/${draft.id}` : "/api/newsletter/campaigns",
      { method: draft.id ? "PUT" : "POST", headers: { "content-type": "application/json" }, body },
    );
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
    const alvo = campaignId ? "esta campanha" : `${preview.recipients} contatos (${audienceLabel})`;
    if (!window.confirm(`Enviar para ${alvo}? Não dá para desfazer depois que sair.`)) return;

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
          ? `${sent} enviados, ${failed} falhas. Faltam ${remaining} — use “continuar envio”.`
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

  function toggleTag(tag: string) {
    setDraft((current) => ({
      ...current,
      audienceTags: current.audienceTags.includes(tag)
        ? current.audienceTags.filter((item) => item !== tag)
        : [...current.audienceTags, tag],
    }));
  }

  return (
    <div className="newsletter-studio">
      <section className="operations-metrics">
        <article className="operations-metric operations-metric-primary">
          <span>Inscritos</span>
          <strong>{overview.metrics.subscribed}</strong>
          <small>recebem a próxima campanha</small>
        </article>
        <article className="operations-metric">
          <span>Descadastrados</span>
          <strong>{overview.metrics.unsubscribed}</strong>
          <small>nunca voltam por importação</small>
        </article>
        <article className="operations-metric">
          <span>Base total</span>
          <strong>{overview.metrics.total}</strong>
          <small>contatos registrados</small>
        </article>
        <article className="operations-metric">
          <span>Campanhas enviadas</span>
          <strong>{overview.metrics.campaignsSent}</strong>
          <small>motor: {readiness.driver}</small>
        </article>
      </section>

      {!readiness.ready ? (
        <p className="feedback-error">Envio indisponível: {readiness.reason}</p>
      ) : null}
      {message ? <p className="feedback-success">{message}</p> : null}
      {error ? <p className="feedback-error">{error}</p> : null}

      <div className="filter-strip newsletter-tabs">
        <button
          type="button"
          className={tab === "contatos" ? "filter-chip filter-chip-active" : "filter-chip"}
          onClick={() => setTab("contatos")}
        >
          Contatos
        </button>
        <button
          type="button"
          className={tab === "campanha" ? "filter-chip filter-chip-active" : "filter-chip"}
          onClick={() => setTab("campanha")}
        >
          Nova campanha
        </button>
        <button
          type="button"
          className={tab === "historico" ? "filter-chip filter-chip-active" : "filter-chip"}
          onClick={() => setTab("historico")}
        >
          Histórico
        </button>
      </div>

      {tab === "contatos" ? (
        <>
          <section className="operations-panel">
            <div className="operations-panel-heading">
              <div>
                <span className="eyebrow">Base</span>
                <h2>Importar contatos</h2>
              </div>
              <small>{overview.metrics.subscribed} inscritos</small>
            </div>

            <form className="newsletter-import" onSubmit={importContacts}>
              <div className="newsletter-import-modes">
                <label>
                  <input type="radio" name="mode" value="paste" defaultChecked /> Colar lista
                </label>
                <label>
                  <input type="radio" name="mode" value="clientes" /> Puxar dos clientes do painel
                </label>
              </div>

              <label className="full-field">
                <span>E-mails</span>
                <textarea
                  name="raw"
                  rows={6}
                  placeholder={"um@cliente.com.br\nNome do Cliente <outro@cliente.com.br>\nterceiro@cliente.com.br"}
                />
                <small>Um por linha, vírgula ou o formato “Nome &lt;e-mail&gt;”. Duplicados são unificados.</small>
              </label>

              <div className="operations-form-grid">
                <label>
                  <span>Etiquetas</span>
                  <input name="tags" placeholder="clientes, saudepet, prospeccao" />
                </label>
                <label className="newsletter-checkbox">
                  <input type="checkbox" name="keepMachineAddresses" />
                  <span>Manter caixas automáticas (no-reply, notificações)</span>
                </label>
              </div>

              <button className="primary-button" type="submit" disabled={busy === "import"}>
                {busy === "import" ? "Importando…" : "Importar"}
              </button>
            </form>
          </section>

          <section className="operations-panel">
            <div className="operations-panel-heading">
              <div>
                <span className="eyebrow">Etiquetas</span>
                <h2>Públicos disponíveis</h2>
              </div>
              <small>{overview.tags.length} etiquetas</small>
            </div>
            {overview.tags.length === 0 ? (
              <p className="muted">Nenhuma etiqueta ainda — importe contatos com etiqueta para segmentar.</p>
            ) : (
              <div className="filter-strip">
                {overview.tags.map((item) => (
                  <span className="filter-chip" key={item.tag}>
                    {item.tag} · {item.count}
                  </span>
                ))}
              </div>
            )}
          </section>

          <section className="operations-panel">
            <div className="operations-panel-heading">
              <div>
                <span className="eyebrow">Base</span>
                <h2>Contatos recentes</h2>
              </div>
              <small>{overview.contacts.length} exibidos</small>
            </div>

            {overview.contacts.length === 0 ? (
              <div className="operations-empty">
                <span className="empty-index">00</span>
                <strong>Nenhum contato na base.</strong>
                <p>Importe a lista de clientes para começar.</p>
              </div>
            ) : (
              <div className="newsletter-contacts">
                {overview.contacts.map((contact) => (
                  <article className="newsletter-contact-row" key={contact.id}>
                    <div>
                      <strong>{contact.email}</strong>
                      <small>
                        {contact.name ?? "—"}
                        {contact.company ? ` · ${contact.company}` : ""} · {contact.source.toLowerCase()}
                      </small>
                    </div>
                    <div className="newsletter-contact-tags">
                      {contact.tags.length === 0 ? <small>sem etiqueta</small> : contact.tags.map((tag) => <span key={tag}>{tag}</span>)}
                    </div>
                    <span className={`newsletter-status newsletter-status-${contact.status.toLowerCase()}`}>
                      {STATUS_LABEL[contact.status] ?? contact.status}
                    </span>
                    <button
                      type="button"
                      className="inline-action"
                      disabled={busy === contact.id}
                      onClick={() =>
                        changeContactStatus(contact, contact.status === "SUBSCRIBED" ? "UNSUBSCRIBED" : "SUBSCRIBED")
                      }
                    >
                      {contact.status === "SUBSCRIBED" ? "Descadastrar" : "Reinscrever"}
                    </button>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      ) : null}

      {tab === "campanha" ? (
        <section className="operations-panel newsletter-composer">
          <div className="operations-panel-heading">
            <div>
              <span className="eyebrow">Composição</span>
              <h2>{draft.id ? "Editando rascunho" : "Nova campanha"}</h2>
            </div>
            <small>{preview.recipients} destinatários · {audienceLabel}</small>
          </div>

          <div className="operations-form-grid">
            <label>
              <span>Nome interno</span>
              <input
                value={draft.name}
                maxLength={160}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                placeholder="Ex.: Quem cuida do seu site — agosto"
              />
            </label>
            <label>
              <span>Assunto do e-mail</span>
              <input
                value={draft.subject}
                maxLength={200}
                onChange={(event) => setDraft({ ...draft, subject: event.target.value })}
                placeholder="Você ainda sabe quem cuida do seu site?"
              />
            </label>
          </div>

          <label className="full-field">
            <span>Texto de prévia</span>
            <input
              value={draft.previewText}
              maxLength={300}
              onChange={(event) => setDraft({ ...draft, previewText: event.target.value })}
              placeholder="Linha curta que aparece depois do assunto na caixa de entrada"
            />
          </label>

          <div className="filter-strip newsletter-formats">
            {(["HTML", "TEXT", "IMAGE"] as const).map((format) => (
              <button
                key={format}
                type="button"
                className={draft.format === format ? "filter-chip filter-chip-active" : "filter-chip"}
                onClick={() => setDraft({ ...draft, format })}
              >
                {FORMAT_LABEL[format]}
              </button>
            ))}
          </div>

          {draft.format === "HTML" ? (
            <label className="full-field">
              <span>HTML da campanha</span>
              <textarea
                rows={14}
                value={draft.html}
                onChange={(event) => setDraft({ ...draft, html: event.target.value })}
                placeholder="<!doctype html> … cole aqui o e-mail pronto"
              />
              <small>
                Use <code>{"{{unsubscribe}}"}</code> onde quiser o link de descadastro. Sem o marcador, um rodapé é
                acrescentado automaticamente.
              </small>
            </label>
          ) : null}

          {draft.format === "TEXT" ? (
            <label className="full-field">
              <span>Mensagem</span>
              <textarea
                rows={12}
                value={draft.text}
                onChange={(event) => setDraft({ ...draft, text: event.target.value })}
                placeholder="Escreva como escreveria um e-mail. Linhas em branco viram parágrafos."
              />
            </label>
          ) : null}

          {draft.format === "IMAGE" ? (
            <div className="newsletter-image-field">
              <label className="full-field">
                <span>Imagem</span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void uploadImage(file);
                  }}
                />
                <small>PNG, JPG, WEBP ou GIF até 8 MB. A imagem fica em endereço público fixo.</small>
              </label>
              {draft.imageUrl ? (
                // A imagem é a mesma URL pública que vai no e-mail: precisa ser
                // exibida crua, sem o otimizador do next/image no meio.
                // eslint-disable-next-line @next/next/no-img-element
                <img className="newsletter-image-preview" src={draft.imageUrl} alt="Prévia da imagem da campanha" />
              ) : null}
              <div className="operations-form-grid">
                <label>
                  <span>Texto alternativo</span>
                  <input
                    value={draft.imageAlt}
                    onChange={(event) => setDraft({ ...draft, imageAlt: event.target.value })}
                    placeholder="Descreva a imagem para quem bloqueia imagens"
                  />
                </label>
                <label>
                  <span>Link ao clicar</span>
                  <input
                    value={draft.imageLinkUrl}
                    onChange={(event) => setDraft({ ...draft, imageLinkUrl: event.target.value })}
                    placeholder="https://avilaops.com/…"
                  />
                </label>
              </div>
            </div>
          ) : null}

          <div className="newsletter-audience">
            <span className="eyebrow">Público</span>
            <div className="filter-strip">
              <button
                type="button"
                className={draft.audienceTags.length === 0 ? "filter-chip filter-chip-active" : "filter-chip"}
                onClick={() => setDraft({ ...draft, audienceTags: [] })}
              >
                Todos os inscritos
              </button>
              {overview.tags.map((item) => (
                <button
                  key={item.tag}
                  type="button"
                  className={draft.audienceTags.includes(item.tag) ? "filter-chip filter-chip-active" : "filter-chip"}
                  onClick={() => toggleTag(item.tag)}
                >
                  {item.tag} · {item.count}
                </button>
              ))}
            </div>
          </div>

          <div className="newsletter-preview">
            <span className="eyebrow">Prévia — renderizada pelo mesmo código que envia</span>
            <iframe title="Prévia da campanha" srcDoc={preview.html} sandbox="" />
          </div>

          <div className="newsletter-actions">
            <label className="newsletter-test">
              <span>Enviar teste para</span>
              <input value={testTo} onChange={(event) => setTestTo(event.target.value)} />
            </label>
            <button type="button" className="inline-action" onClick={handleSave} disabled={busy === "save"}>
              {busy === "save" ? "Salvando…" : "Salvar rascunho"}
            </button>
            <button type="button" className="inline-action" onClick={handleTest} disabled={busy === "test" || !readiness.ready}>
              {busy === "test" ? "Enviando…" : "Enviar teste"}
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={() => handleSend()}
              disabled={busy === "send" || !readiness.ready || preview.recipients === 0}
            >
              {busy === "send" ? "Enviando…" : `Enviar para ${preview.recipients}`}
            </button>
          </div>
        </section>
      ) : null}

      {tab === "historico" ? (
        <section className="operations-panel">
          <div className="operations-panel-heading">
            <div>
              <span className="eyebrow">Registro</span>
              <h2>Campanhas</h2>
            </div>
            <small>{overview.campaigns.length} no histórico</small>
          </div>

          {overview.campaigns.length === 0 ? (
            <div className="operations-empty">
              <span className="empty-index">00</span>
              <strong>Nenhuma campanha ainda.</strong>
              <p>Componha a primeira na aba ao lado.</p>
            </div>
          ) : (
            <div className="newsletter-campaigns">
              {overview.campaigns.map((campaign) => (
                <article className="newsletter-campaign-row" key={campaign.id}>
                  <div>
                    <strong>{campaign.name}</strong>
                    <small>{campaign.subject}</small>
                    <small>
                      {FORMAT_LABEL[campaign.format] ?? campaign.format} ·{" "}
                      {campaign.audienceTags.length === 0 ? "todos os inscritos" : campaign.audienceTags.join(", ")} ·
                      criada em {formatDate(campaign.createdAt)}
                    </small>
                  </div>
                  <div className="newsletter-campaign-numbers">
                    <span>{campaign.sentCount} enviados</span>
                    <span>{campaign.failedCount} falhas</span>
                    <span>{campaign.recipientCount} na fila</span>
                  </div>
                  <span className={`newsletter-status newsletter-status-${campaign.status.toLowerCase()}`}>
                    {STATUS_LABEL[campaign.status] ?? campaign.status}
                  </span>
                  {campaign.status === "SENT" ? (
                    <small>{formatDate(campaign.sentAt)}</small>
                  ) : (
                    <button
                      type="button"
                      className="inline-action"
                      disabled={busy === campaign.id || !readiness.ready}
                      onClick={() => handleSend(campaign.id)}
                    >
                      {campaign.status === "SENDING" ? "Continuar envio" : "Enviar"}
                    </button>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  CONTRACTS,
  LOCATION_TYPES,
  type JobPostingContent,
} from "@/lib/job-postings.constants";

export type JobPostingEditorData = {
  id: string;
  ref: string;
  slug: string;
  title: string;
  area: string;
  team: string;
  location: string;
  locationType: string;
  contract: string;
  summary: string;
  postedAt: string | null;
  validThrough: string | null;
  status: string;
  publishedAt: string | null;
  applicationCount: number;
  content: JobPostingContent;
};

type ResponsibilityDraft = { title: string; body: string; items: string };

/** Uma linha por item: o formato que o operador já usa nos outros editores. */
const toLines = (items: string[] | undefined) => (items ?? []).join("\n");
const fromLines = (text: string) =>
  text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

export default function JobPostingEditor({
  posting,
  blockers,
  publicUrl,
}: {
  posting: JobPostingEditorData;
  blockers: string[];
  publicUrl: string;
}) {
  const router = useRouter();

  const [campos, setCampos] = useState({
    title: posting.title,
    area: posting.area,
    team: posting.team,
    location: posting.location,
    locationType: posting.locationType,
    contract: posting.contract,
    summary: posting.summary,
    postedAt: posting.postedAt ?? "",
    validThrough: posting.validThrough ?? "",
    travel: posting.content.travel ?? "",
  });
  const [intro, setIntro] = useState(toLines(posting.content.intro));
  const [expertise, setExpertise] = useState(toLines(posting.content.expertise));
  const [benefits, setBenefits] = useState(toLines(posting.content.benefits));
  const [closing, setClosing] = useState(toLines(posting.content.closing));
  const [responsibilities, setResponsibilities] = useState<ResponsibilityDraft[]>(
    (posting.content.responsibilities ?? []).map((group) => ({
      title: group.title,
      body: group.body,
      items: toLines(group.items),
    })),
  );

  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");
  const [erroLista, setErroLista] = useState<string[]>([]);
  const [message, setMessage] = useState("");

  const campo = (nome: keyof typeof campos) => ({
    value: campos[nome],
    onChange: (
      event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
    ) => setCampos((atual) => ({ ...atual, [nome]: event.target.value })),
  });

  function payload() {
    return {
      ...campos,
      intro: fromLines(intro),
      expertise: fromLines(expertise),
      benefits: fromLines(benefits),
      closing: fromLines(closing),
      responsibilities: responsibilities
        .filter((group) => group.title.trim().length > 0)
        .map((group) => ({
          title: group.title,
          body: group.body,
          items: fromLines(group.items),
        })),
    };
  }

  async function chamar(
    acao: string,
    url: string,
    init: RequestInit,
    sucesso: string,
  ) {
    setLoading(acao);
    setError("");
    setErroLista([]);
    setMessage("");

    try {
      const response = await fetch(url, init);
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
        blockers?: string[];
        aviso?: string;
      };
      if (!response.ok) {
        setErroLista(result.blockers ?? []);
        throw new Error(result.error ?? "A operação não foi concluída.");
      }

      setMessage(result.aviso ? `${sucesso} ${result.aviso}` : sucesso);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A operação não foi concluída.");
    } finally {
      setLoading("");
    }
  }

  const salvar = () =>
    chamar(
      "save",
      `/api/job-postings/${posting.id}`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload()),
      },
      "Vaga salva.",
    );

  const transicao = (acao: "publish" | "pause" | "close", sucesso: string) =>
    chamar(acao, `/api/job-postings/${posting.id}/${acao}`, { method: "POST" }, sucesso);

  async function excluir() {
    if (
      !window.confirm(
        "Excluir esta vaga? A ação é definitiva. Para tirar do ar mantendo o histórico, encerre em vez de excluir.",
      )
    ) {
      return;
    }
    setLoading("delete");
    setError("");
    try {
      const response = await fetch(`/api/job-postings/${posting.id}`, { method: "DELETE" });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Não foi possível excluir a vaga.");
      router.push("/vagas");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Não foi possível excluir a vaga.",
      );
      setLoading("");
    }
  }

  const ocupado = loading !== "";

  return (
    <div className="job-editor">
      <section className="operations-panel job-actions-panel">
        <div className="operations-panel-heading">
          <div>
            <h2>Publicação</h2>
          </div>
          <span className="panel-count">{posting.applicationCount}</span>
        </div>

        {blockers.length > 0 ? (
          <div className="job-blockers">
            <strong>Pendências para publicar</strong>
            <ul>
              {blockers.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <small>Salve o conteúdo para a lista ser recalculada.</small>
          </div>
        ) : (
          <p className="job-ready">
            Conteúdo completo para o JSON-LD do Google Jobs. Publicar aqui não sobe o
            site: rode o build de <code>jobs.avilaops.com</code> depois.
          </p>
        )}

        <div className="job-actions">
          <button
            className="primary-button"
            type="button"
            onClick={() => transicao("publish", "Vaga no ar.")}
            disabled={ocupado || blockers.length > 0}
          >
            {loading === "publish"
              ? "Publicando…"
              : posting.status === "PUBLISHED"
                ? "Republicar"
                : "Publicar"}
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => transicao("pause", "Vaga pausada.")}
            disabled={ocupado || posting.status !== "PUBLISHED"}
          >
            {loading === "pause" ? "Pausando…" : "Pausar"}
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => transicao("close", "Vaga encerrada.")}
            disabled={ocupado || posting.status === "CLOSED"}
          >
            {loading === "close" ? "Encerrando…" : "Encerrar"}
          </button>
          <button
            className="danger-button"
            type="button"
            onClick={excluir}
            disabled={ocupado || posting.applicationCount > 0}
            title={
              posting.applicationCount > 0
                ? "Vaga com candidatura não pode ser excluída — encerre."
                : undefined
            }
          >
            {loading === "delete" ? "Excluindo…" : "Excluir"}
          </button>
          {posting.publishedAt ? (
            <a className="text-link" href={publicUrl} target="_blank" rel="noreferrer">
              Abrir no site ↗
            </a>
          ) : null}
        </div>

        {error ? <p className="inline-feedback feedback-error">{error}</p> : null}
        {erroLista.length > 0 ? (
          <ul className="inline-feedback feedback-error job-blocker-list">
            {erroLista.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : null}
        {message ? <p className="inline-feedback feedback-success">{message}</p> : null}
      </section>

      <div className="job-editor-columns">
        <section className="operations-panel job-form-panel">
          <div className="operations-panel-heading">
            <div>
              <h2>Editor da vaga</h2>
            </div>
            <small>{posting.ref}</small>
          </div>

          <div className="operations-form-grid job-form">
            <label className="span-two">
              Título *
              <input maxLength={160} {...campo("title")} />
            </label>
            <label>
              Área
              <input maxLength={80} {...campo("area")} />
            </label>
            <label>
              Time
              <input maxLength={80} {...campo("team")} />
            </label>
            <label>
              Local
              <input maxLength={160} {...campo("location")} />
            </label>
            <label>
              Modelo
              <select {...campo("locationType")}>
                {LOCATION_TYPES.map((item) => (
                  <option value={item} key={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Contrato
              <select {...campo("contract")}>
                {CONTRACTS.map((item) => (
                  <option value={item} key={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Publicação
              <input type="date" {...campo("postedAt")} />
            </label>
            <label>
              Inscrição até
              <input type="date" {...campo("validThrough")} />
            </label>
            <label>
              Viagem
              <input maxLength={400} placeholder="Opcional" {...campo("travel")} />
            </label>
            <label className="span-two">
              Resumo
              <textarea rows={2} maxLength={400} {...campo("summary")} />
            </label>
            <label className="span-two">
              Introdução — um parágrafo por linha
              <textarea
                rows={4}
                value={intro}
                onChange={(event) => setIntro(event.target.value)}
              />
            </label>
          </div>

          <div className="job-blocks">
            <div className="job-blocks-heading">
              <strong>Responsabilidades</strong>
              <button
                className="secondary-button"
                type="button"
                onClick={() =>
                  setResponsibilities((atual) => [
                    ...atual,
                    { title: "", body: "", items: "" },
                  ])
                }
              >
                Adicionar bloco
              </button>
            </div>

            {responsibilities.length === 0 ? (
              <p className="job-blocks-empty">
                Nenhum bloco. A página de vaga usa cada bloco como um item do acordeão
                “Áreas que combinam com seus pontos fortes”.
              </p>
            ) : (
              responsibilities.map((group, index) => (
                <div className="job-block" key={index}>
                  <label>
                    Título do bloco
                    <input
                      maxLength={140}
                      value={group.title}
                      onChange={(event) =>
                        setResponsibilities((atual) =>
                          atual.map((item, i) =>
                            i === index ? { ...item, title: event.target.value } : item,
                          ),
                        )
                      }
                    />
                  </label>
                  <label>
                    Texto de abertura
                    <textarea
                      rows={2}
                      maxLength={600}
                      value={group.body}
                      onChange={(event) =>
                        setResponsibilities((atual) =>
                          atual.map((item, i) =>
                            i === index ? { ...item, body: event.target.value } : item,
                          ),
                        )
                      }
                    />
                  </label>
                  <label>
                    Itens — um por linha
                    <textarea
                      rows={4}
                      value={group.items}
                      onChange={(event) =>
                        setResponsibilities((atual) =>
                          atual.map((item, i) =>
                            i === index ? { ...item, items: event.target.value } : item,
                          ),
                        )
                      }
                    />
                  </label>
                  <button
                    className="text-button"
                    type="button"
                    onClick={() =>
                      setResponsibilities((atual) => atual.filter((_, i) => i !== index))
                    }
                  >
                    Remover bloco
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="operations-form-grid job-form">
            <label className="span-two">
              Conhecimento e expertise — um por linha
              <textarea
                rows={5}
                value={expertise}
                onChange={(event) => setExpertise(event.target.value)}
              />
            </label>
            <label className="span-two">
              Benefícios — um por linha
              <textarea
                rows={4}
                value={benefits}
                onChange={(event) => setBenefits(event.target.value)}
              />
            </label>
            <label className="span-two">
              Fechamento — um parágrafo por linha
              <textarea
                rows={3}
                value={closing}
                onChange={(event) => setClosing(event.target.value)}
              />
            </label>
          </div>

          <div className="organization-form-actions">
            <p>
              Salvar não publica. Enquanto a vaga estiver em rascunho, mudar o título
              também atualiza o endereço; depois da primeira publicação o endereço fica
              congelado para não quebrar o link já indexado.
            </p>
            <button
              className="primary-button"
              type="button"
              onClick={salvar}
              disabled={ocupado}
            >
              {loading === "save" ? "Salvando…" : "Salvar vaga"}
            </button>
          </div>
        </section>

        <section className="operations-panel job-preview-panel">
          <div className="operations-panel-heading">
            <div>
              <h2>Como a página lê</h2>
            </div>
            <small>/vagas/{posting.slug}/</small>
          </div>

          <div className="job-preview">
            <span className="job-preview-eyebrow">
              {campos.area || "Área"} · {campos.locationType} · {campos.contract}
            </span>
            <h3>{campos.title || "Título da vaga"}</h3>
            <p className="job-preview-summary">
              {campos.summary || "O resumo aparece na listagem e no card de busca."}
            </p>
            <p className="job-preview-meta">
              {campos.location || "Local a definir"}
              {campos.team ? ` · time ${campos.team}` : ""}
              {campos.validThrough ? ` · inscrições até ${campos.validThrough}` : ""}
            </p>

            {fromLines(intro).map((paragrafo, index) => (
              <p key={index}>{paragrafo}</p>
            ))}

            {responsibilities
              .filter((group) => group.title.trim())
              .map((group, index) => (
                <div className="job-preview-block" key={index}>
                  <strong>{group.title}</strong>
                  {group.body ? <p>{group.body}</p> : null}
                  <ul>
                    {fromLines(group.items).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ))}

            {fromLines(expertise).length > 0 ? (
              <div className="job-preview-block">
                <strong>Você tem o que é necessário?</strong>
                <ul>
                  {fromLines(expertise).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {fromLines(benefits).length > 0 ? (
              <div className="job-preview-block">
                <strong>Benefícios</strong>
                <ul>
                  {fromLines(benefits).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {campos.travel ? (
              <div className="job-preview-block">
                <strong>Viagem</strong>
                <p>{campos.travel}</p>
              </div>
            ) : null}

            {fromLines(closing).map((paragrafo, index) => (
              <p key={index}>{paragrafo}</p>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

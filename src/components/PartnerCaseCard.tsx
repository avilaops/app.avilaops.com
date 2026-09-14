"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Metric = { label: string; value: string };

type Props = {
  id: string;
  title: string;
  competency: string;
  status: string;
  statusLabel: string;
  summary: string | null;
  metrics: Metric[];
};

const statusOptions = [
  { value: "NOT_STARTED", label: "Não iniciado" },
  { value: "PILOT", label: "Em piloto" },
  { value: "PRODUCTION", label: "Em produção" },
  { value: "DOCUMENTED", label: "Documentado" },
];

export default function PartnerCaseCard({
  id,
  title,
  competency,
  status,
  summary,
  metrics,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [currentStatus, setCurrentStatus] = useState(status);
  const [currentSummary, setCurrentSummary] = useState(summary ?? "");
  const [currentMetrics, setCurrentMetrics] = useState<Metric[]>(
    metrics.length > 0 ? metrics : [{ label: "", value: "" }],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function updateMetric(index: number, field: "label" | "value", value: string) {
    setCurrentMetrics((prev) =>
      prev.map((metric, i) => (i === index ? { ...metric, [field]: value } : metric)),
    );
  }

  function addMetric() {
    setCurrentMetrics((prev) => [...prev, { label: "", value: "" }]);
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/partner-network/cases/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          status: currentStatus,
          summary: currentSummary || null,
          metrics: currentMetrics.filter((metric) => metric.label.trim()),
        }),
      });
      if (!response.ok) throw new Error("Falha ao salvar.");
      setOpen(false);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="case">
      <div className="case-head">
        <div>
          <span className="case-id">{competency}</span>
          <h4>{title}</h4>
        </div>
        <span className={`status-pill status-${currentStatus.toLowerCase().replace("_", "-")}`}>
          {statusOptions.find((option) => option.value === currentStatus)?.label}
        </span>
      </div>
      <div className="case-body-simple">
        {currentSummary ? <p>{currentSummary}</p> : null}
        {currentMetrics.filter((metric) => metric.label.trim()).length > 0 ? (
          <div className="metric-list">
            {currentMetrics
              .filter((metric) => metric.label.trim())
              .map((metric, index) => (
                <div className="metric-row" key={index}>
                  <span className="label">{metric.label}</span>
                  <span className="val">{metric.value || "-"}</span>
                </div>
              ))}
          </div>
        ) : null}
        <button type="button" className="row-action" onClick={() => setOpen((value) => !value)}>
          {open ? "Fechar" : "Editar caso"}
        </button>
      </div>

      {open ? (
        <div className="case-editor">
          <label>
            Estado
            <select
              value={currentStatus}
              onChange={(event) => setCurrentStatus(event.target.value)}
            >
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Resumo
            <input
              value={currentSummary}
              onChange={(event) => setCurrentSummary(event.target.value)}
              placeholder="O que mudou desde a última atualização"
              maxLength={400}
            />
          </label>
          <div className="metric-editor-list">
            {currentMetrics.map((metric, index) => (
              <div className="metric-editor-row" key={index}>
                <input
                  value={metric.label}
                  onChange={(event) => updateMetric(index, "label", event.target.value)}
                  placeholder="Métrica (ex.: taxa de conversão)"
                  maxLength={60}
                />
                <input
                  value={metric.value}
                  onChange={(event) => updateMetric(index, "value", event.target.value)}
                  placeholder="Valor"
                  maxLength={60}
                />
              </div>
            ))}
            <button type="button" className="text-button" onClick={addMetric}>
              + adicionar métrica
            </button>
          </div>
          {error ? <span className="form-error">{error}</span> : null}
          <div className="editor-actions">
            <button type="button" className="small-primary" onClick={save} disabled={saving}>
              {saving ? "Salvando…" : "Salvar"}
            </button>
            <button type="button" className="text-button" onClick={() => setOpen(false)}>
              Cancelar
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

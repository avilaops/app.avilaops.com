"use client"

import { useState, type FormEvent } from "react"

export default function CobrancaPersonalizadaForm({ organizationId, onSuccess }: { organizationId: string; onSuccess(): void }) {
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("")
    const form = new FormData(event.currentTarget)
    const payload = Object.fromEntries(form)
    const response = await fetch(`/api/organizations/${organizationId}/faturas`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...payload, nfseAutomatica: form.get("nfseAutomatica") === "on" }) })
    const body = await response.json().catch(() => ({}))
    setBusy(false)
    if (!response.ok) { setError(body.error ?? "Não foi possível criar a cobrança."); return }
    onSuccess()
  }
  return <form id="form-cobranca-personalizada" className="stack" onSubmit={submit}>
    <label>Descrição<input name="descricao" required maxLength={200} /></label>
    <label>Valor em reais<input name="valor" required inputMode="decimal" placeholder="1.250,00" /></label>
    <label>Competência<input name="competencia" type="month" required /></label>
    <label>Vencimento<input name="vencimento" type="date" required /></label>
    <label>Forma de cobrança<select name="metodo" defaultValue="PIX"><option value="PIX">PIX</option><option value="BOLETO">Boleto</option></select></label>
    <label><input name="nfseAutomatica" type="checkbox" /> Emitir NFS-e automaticamente após o pagamento • exige certificado A1</label>
    <label>Código nacional do serviço<input name="codigoServico" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} /></label>
    <label>Descrição fiscal<textarea name="descricaoFiscal" maxLength={2000} rows={4} /></label>
    {error ? <p className="inline-feedback feedback-error" role="alert">{error}</p> : null}
    <button className="primary-button" type="submit" disabled={busy}>{busy ? "Criando…" : "Criar cobrança"}</button>
  </form>
}

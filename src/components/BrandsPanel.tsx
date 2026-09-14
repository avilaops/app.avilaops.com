"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type Brand = {
  id: string;
  name: string;
  slug: string;
  siteUrl: string | null;
  status: string;
};

export default function BrandsPanel({ organizationId, brands }: { organizationId: string; brands: Brand[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [siteUrl, setSiteUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function createBrand(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setFeedback(null);
    try {
      const response = await fetch(`/api/organizations/${organizationId}/marcas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, siteUrl }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string; marca?: Brand } | null;
      if (!response.ok) throw new Error(payload?.error ?? "Não foi possível criar a marca.");
      setName("");
      setSiteUrl("");
      setFeedback(`Marca ${payload?.marca?.name ?? name} criada.`);
      router.refresh();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Não foi possível criar a marca.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="client-summary-section client-brands-panel">
      <div className="seo-section-heading">
        <div><span className="eyebrow">IDENTIDADE</span><h2>Marcas do cliente</h2></div>
        <span className="client-summary-number">{brands.length}</span>
      </div>
      <div className="client-brands-list">
        {brands.length ? brands.map((brand) => (
          <div className="client-brand-row" key={brand.id}>
            <div><strong>{brand.name}</strong><small>{brand.siteUrl || `/${brand.slug}`}</small></div>
            <span className="seo-state good">{brand.status}</span>
          </div>
        )) : <p>Nenhuma marca cadastrada.</p>}
      </div>
      <form className="client-brand-form" onSubmit={createBrand}>
        <label className="field"><span>Nova marca</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Marca principal" required minLength={2} maxLength={120} /></label>
        <label className="field"><span>Site (opcional)</span><input value={siteUrl} onChange={(event) => setSiteUrl(event.target.value)} placeholder="https://..." maxLength={300} /></label>
        <button className="primary-button" type="submit" disabled={busy}>{busy ? "Criando..." : "Adicionar marca"}</button>
      </form>
      {feedback ? <p className="field-help" role="status">{feedback}</p> : null}
    </section>
  );
}

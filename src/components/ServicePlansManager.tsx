"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type ServicePlan = {
  id: string;
  serviceType: string;
  slug: string;
  name: string;
  description: string | null;
  priceCents: number | null;
  currency: string;
  billingCycle: string | null;
  status: string;
  sortOrder: number;
};

const serviceTypes = [
  ["DOMAIN", "Domínios"],
  ["PDF_CATALOG", "Catálogo PDF"],
  ["SOCIAL_MEDIA", "Redes sociais"],
  ["PROFESSIONAL_EMAIL", "E-mail profissional"],
  ["BRAND_IDENTITY", "Identidade visual"],
  ["ONLINE_STORE", "Loja online"],
] as const;

function money(cents: number | null) {
  if (cents === null) return "A definir";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

function grouped(plans: ServicePlan[]) {
  return plans.reduce<Record<string, ServicePlan[]>>((groups, plan) => {
    groups[plan.serviceType] = groups[plan.serviceType] ?? [];
    groups[plan.serviceType].push(plan);
    return groups;
  }, {});
}

export default function ServicePlansManager({ plans }: { plans: ServicePlan[] }) {
  const router = useRouter();
  const [saving, setSaving] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const groups = useMemo(() => grouped(plans), [plans]);

  async function submit(event: FormEvent<HTMLFormElement>, planId?: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(planId ?? "new");
    setMessage("");
    setError("");

    const payload = {
      serviceType: form.get("serviceType"),
      slug: form.get("slug"),
      name: form.get("name"),
      description: form.get("description"),
      price: form.get("price"),
      billingCycle: form.get("billingCycle"),
      status: form.get("status"),
      sortOrder: form.get("sortOrder"),
    };

    try {
      const response = await fetch(planId ? `/api/service-plans/${planId}` : "/api/service-plans", {
        method: planId ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Não foi possível salvar o plano.");
      setMessage(planId ? "Plano atualizado." : "Plano criado.");
      if (!planId) event.currentTarget.reset();
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível salvar o plano.");
    } finally {
      setSaving("");
    }
  }

  return (
    <div className="service-plans-manager">
      <section className="operations-panel">
        <span className="eyebrow">Novo plano</span>
        <form className="service-plan-form" onSubmit={(event) => submit(event)}>
          <select name="serviceType" defaultValue="PDF_CATALOG">
            {serviceTypes.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <input name="slug" placeholder="slug-unico-do-plano" required />
          <input name="name" placeholder="Nome comercial" required />
          <input name="price" placeholder="Preço, ex: 450,00" />
          <select name="billingCycle" defaultValue="ONE_TIME">
            <option value="ONE_TIME">Pagamento único</option>
            <option value="MONTHLY">Mensal</option>
            <option value="YEARLY">Anual</option>
            <option value="TWO_YEARS">2 anos</option>
            <option value="FOUR_YEARS">4 anos</option>
            <option value="NONE">Sem cobrança</option>
          </select>
          <select name="status" defaultValue="ACTIVE">
            <option value="ACTIVE">Ativo</option>
            <option value="DRAFT">Rascunho</option>
            <option value="ARCHIVED">Arquivado</option>
          </select>
          <input name="sortOrder" type="number" defaultValue="100" />
          <textarea name="description" placeholder="Descrição, limites e condição comercial" rows={2} />
          <button className="primary-button" type="submit" disabled={saving === "new"}>
            {saving === "new" ? "Criando..." : "Criar plano"}
          </button>
        </form>
      </section>

      {serviceTypes.map(([type, label]) => (
        <section className="operations-panel" key={type}>
          <div className="seo-keyword-heading">
            <div>
              <span className="eyebrow">{type}</span>
              <h3>{label}</h3>
            </div>
            <small>{groups[type]?.length ?? 0} planos</small>
          </div>
          <div className="service-plan-list">
            {(groups[type] ?? []).map((plan) => (
              <form className="service-plan-row" key={plan.id} onSubmit={(event) => submit(event, plan.id)}>
                <input name="serviceType" type="hidden" defaultValue={plan.serviceType} />
                <label>Slug<input name="slug" defaultValue={plan.slug} /></label>
                <label>Nome<input name="name" defaultValue={plan.name} /></label>
                <label>Preço<input name="price" defaultValue={plan.priceCents === null ? "" : String(plan.priceCents / 100).replace(".", ",")} /></label>
                <label>Ciclo<select name="billingCycle" defaultValue={plan.billingCycle ?? "ONE_TIME"}>
                  <option value="ONE_TIME">Pagamento único</option>
                  <option value="MONTHLY">Mensal</option>
                  <option value="YEARLY">Anual</option>
                  <option value="TWO_YEARS">2 anos</option>
                  <option value="FOUR_YEARS">4 anos</option>
                  <option value="NONE">Sem cobrança</option>
                </select></label>
                <label>Status<select name="status" defaultValue={plan.status}>
                  <option value="ACTIVE">Ativo</option>
                  <option value="DRAFT">Rascunho</option>
                  <option value="ARCHIVED">Arquivado</option>
                </select></label>
                <label>Ordem<input name="sortOrder" type="number" defaultValue={plan.sortOrder} /></label>
                <label className="span-3">Descrição<textarea name="description" rows={2} defaultValue={plan.description ?? ""} /></label>
                <strong>{money(plan.priceCents)}</strong>
                <button className="secondary-button" type="submit" disabled={saving === plan.id}>
                  {saving === plan.id ? "Salvando..." : "Salvar"}
                </button>
              </form>
            ))}
          </div>
        </section>
      ))}
      {message ? <p className="inline-feedback feedback-success">{message}</p> : null}
      {error ? <p className="inline-feedback feedback-error">{error}</p> : null}
    </div>
  );
}

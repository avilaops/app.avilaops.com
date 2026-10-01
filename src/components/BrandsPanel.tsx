"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Grupo, LinhaInfo } from "@/components/sistema/Lista";
import BadgeStatus from "@/components/sistema/Status";
import Sheet from "@/components/ui/Sheet";
import { nomeProprio } from "@/lib/format";

type Brand = {
  id: string;
  name: string;
  slug: string;
  siteUrl: string | null;
  status: string;
};

/**
 * Marcas do cliente: a lista, e o cadastro numa folha.
 *
 * O formulário ficava aberto no fim da ficha, em três colunas — no celular
 * sobravam 90px por campo ("Ex.: Ma", "https://") e ele ocupava espaço em toda
 * visita, enquanto cadastrar marca acontece uma vez por cliente. O estado da
 * marca também saía cru ("ACTIVE"); agora usa o selo da casa.
 */
export default function BrandsPanel({ organizationId, brands }: { organizationId: string; brands: Brand[] }) {
  const router = useRouter();
  const [aberta, setAberta] = useState(false);
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
      setAberta(false);
      router.refresh();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Não foi possível criar a marca.");
    } finally {
      setBusy(false);
    }
  }

  const formId = `marca-${organizationId}`;

  return (
    <div className="client-brands-panel">
      <Grupo
        titulo="Marcas"
        acao={
          <button type="button" className="text-button" onClick={() => setAberta(true)}>
            Adicionar
          </button>
        }
      >
        {brands.length ? (
          brands.map((brand) => (
            <LinhaInfo
              key={brand.id}
              titulo={nomeProprio(brand.name)}
              descricao={brand.siteUrl || `/${brand.slug}`}
              valor={<BadgeStatus status={brand.status} />}
            />
          ))
        ) : (
          <LinhaInfo
            titulo="Nenhuma marca cadastrada"
            descricao="A marca é o que dá nome ao site, ao perfil e às peças do cliente."
          />
        )}
      </Grupo>

      {feedback ? (
        <p className="field-help" role="status">
          {feedback}
        </p>
      ) : null}

      {aberta ? (
        <Sheet
          titulo="Nova marca"
          aoFechar={() => setAberta(false)}
          rodape={
            <>
              <button type="submit" form={formId} className="primary-button" disabled={busy}>
                {busy ? "Criando…" : "Adicionar marca"}
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setAberta(false)}
                disabled={busy}
              >
                Cancelar
              </button>
            </>
          }
        >
          <form id={formId} className="form-stack" onSubmit={createBrand}>
            <label className="field">
              <span>Nome da marca</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Ex.: Marca principal"
                required
                minLength={2}
                maxLength={120}
                autoFocus
              />
            </label>
            <label className="field">
              <span>Site (opcional)</span>
              <input
                value={siteUrl}
                onChange={(event) => setSiteUrl(event.target.value)}
                placeholder="https://..."
                maxLength={300}
                inputMode="url"
              />
            </label>
            {feedback ? (
              <p className="inline-feedback feedback-error" role="alert">
                {feedback}
              </p>
            ) : null}
          </form>
        </Sheet>
      ) : null}
    </div>
  );
}

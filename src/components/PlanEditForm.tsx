"use client";

import { FormEvent, useState } from "react";
import { Icone } from "@/components/ui/Icones";
import Sheet from "@/components/ui/Sheet";

export type PlanoServico = {
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

export const tiposServico = [
  ["DOMAIN", "Domínios"],
  ["PDF_CATALOG", "Catálogo PDF"],
  ["SOCIAL_MEDIA", "Redes sociais"],
  ["PROFESSIONAL_EMAIL", "E-mail profissional"],
  ["BRAND_IDENTITY", "Identidade visual"],
  ["ONLINE_STORE", "Loja online"],
] as const;

export const ciclos = [
  ["ONE_TIME", "Pagamento único"],
  ["MONTHLY", "Mensal"],
  ["YEARLY", "Anual"],
  ["TWO_YEARS", "2 anos"],
  ["FOUR_YEARS", "4 anos"],
  ["NONE", "Sem cobrança"],
] as const;

export const statusPlano = [
  ["ACTIVE", "Ativo"],
  ["DRAFT", "Rascunho"],
  ["ARCHIVED", "Arquivado"],
] as const;

export function rotuloCiclo(valor: string | null) {
  return ciclos.find(([codigo]) => codigo === valor)?.[1] ?? "Pagamento único";
}

export function rotuloStatus(valor: string) {
  return statusPlano.find(([codigo]) => codigo === valor)?.[1] ?? valor;
}

export function dinheiro(cents: number | null) {
  if (cents === null) return "A definir";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

/* Mesma regra da API: o que a tela sugere é o que o servidor vai gravar. */
function slugDe(texto: string) {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function precoTexto(cents: number | null) {
  return cents === null ? "" : (cents / 100).toFixed(2).replace(".", ",");
}

type Campos = {
  serviceType: string;
  name: string;
  slug: string;
  price: string;
  billingCycle: string;
  status: string;
  sortOrder: string;
  description: string;
};

type Props = {
  /** `null` cria um plano novo. */
  plano: PlanoServico | null;
  tipoInicial: string;
  aoFechar: () => void;
  aoSalvar: (mensagem: string) => void;
};

/**
 * Formulário de um plano, numa folha. Um campo por linha, alvo de toque de
 * 48px e o "Salvar" fixo no rodapé: dá para editar preço com uma mão no
 * ônibus. Antes eram oito campos espremidos numa grade de três colunas.
 */
export default function PlanEditForm({ plano, tipoInicial, aoFechar, aoSalvar }: Props) {
  const [campos, setCampos] = useState<Campos>(() => ({
    serviceType: plano?.serviceType ?? tipoInicial,
    name: plano?.name ?? "",
    slug: plano?.slug ?? "",
    price: precoTexto(plano?.priceCents ?? null),
    billingCycle: plano?.billingCycle ?? "ONE_TIME",
    status: plano?.status ?? "ACTIVE",
    sortOrder: String(plano?.sortOrder ?? 100),
    description: plano?.description ?? "",
  }));
  // Plano novo ganha o slug a partir do nome até alguém digitar um à mão.
  const [slugManual, setSlugManual] = useState(Boolean(plano));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  function mudar<K extends keyof Campos>(campo: K, valor: Campos[K]) {
    setCampos((atual) => ({ ...atual, [campo]: valor }));
  }

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (salvando) return;
    setSalvando(true);
    setErro("");

    try {
      const resposta = await fetch(
        plano ? `/api/service-plans/${plano.id}` : "/api/service-plans",
        {
          method: plano ? "PUT" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...campos,
            slug: campos.slug || slugDe(campos.name),
          }),
        },
      );
      const resultado = (await resposta.json()) as { error?: string };
      if (!resposta.ok) {
        throw new Error(resultado.error ?? "Não foi possível salvar o plano.");
      }
      aoSalvar(plano ? "Plano atualizado." : "Plano criado.");
    } catch (falha) {
      setErro(
        falha instanceof Error ? falha.message : "Não foi possível salvar o plano.",
      );
      setSalvando(false);
    }
  }

  const titulo = plano ? "Editar plano" : "Novo plano";

  return (
    <Sheet
      titulo={titulo}
      aoFechar={aoFechar}
      rodape={
        <>
          <button
            type="submit"
            form="plano-form"
            className="primary-button"
            disabled={salvando}
          >
            {salvando ? "Salvando…" : plano ? "Salvar alterações" : "Criar plano"}
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={aoFechar}
            disabled={salvando}
          >
            Cancelar
          </button>
        </>
      }
    >
      <form id="plano-form" className="form-stack" onSubmit={enviar}>
        <label className="field field-select">
          <span>Tipo de serviço</span>
          <select
            value={campos.serviceType}
            onChange={(evento) => mudar("serviceType", evento.target.value)}
          >
            {tiposServico.map(([codigo, rotulo]) => (
              <option key={codigo} value={codigo}>
                {rotulo}
              </option>
            ))}
          </select>
          <Icone nome="chevron" tamanho={16} className="chevron" />
        </label>

        <label className="field">
          <span>Nome comercial</span>
          <input
            value={campos.name}
            onChange={(evento) => {
              mudar("name", evento.target.value);
              if (!slugManual) mudar("slug", slugDe(evento.target.value));
            }}
            placeholder="Ex.: Identidade Visual Essencial"
            required
            autoFocus={!plano}
            autoComplete="off"
            enterKeyHint="next"
          />
        </label>

        <label className="field">
          <span>Slug</span>
          <input
            value={campos.slug}
            onChange={(evento) => {
              setSlugManual(true);
              mudar("slug", slugDe(evento.target.value));
            }}
            placeholder="gerado-a-partir-do-nome"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            className="mono"
          />
          <small className="field-help">
            Identificador usado nos links e nas integrações.
          </small>
        </label>

        <div className="field-grid">
          <label className="field">
            <span>Preço</span>
            <span className="input-prefix">
              <i aria-hidden="true">R$</i>
              <input
                value={campos.price}
                onChange={(evento) => mudar("price", evento.target.value)}
                placeholder="0,00"
                inputMode="decimal"
                autoComplete="off"
              />
            </span>
            <small className="field-help">Vazio fica como “a definir”.</small>
          </label>

          <label className="field field-select">
            <span>Ciclo</span>
            <select
              value={campos.billingCycle}
              onChange={(evento) => mudar("billingCycle", evento.target.value)}
            >
              {ciclos.map(([codigo, rotulo]) => (
                <option key={codigo} value={codigo}>
                  {rotulo}
                </option>
              ))}
            </select>
            <Icone nome="chevron" tamanho={16} className="chevron" />
          </label>
        </div>

        <div className="field">
          <span>Status</span>
          <div className="segmented" role="radiogroup" aria-label="Status do plano">
            {statusPlano.map(([codigo, rotulo]) => (
              <button
                type="button"
                key={codigo}
                role="radio"
                aria-checked={campos.status === codigo}
                onClick={() => mudar("status", codigo)}
              >
                {rotulo}
              </button>
            ))}
          </div>
        </div>

        <label className="field">
          <span>Ordem de exibição</span>
          <input
            type="number"
            value={campos.sortOrder}
            onChange={(evento) => mudar("sortOrder", evento.target.value)}
            inputMode="numeric"
            min={0}
            step={1}
          />
          <small className="field-help">Menor aparece primeiro dentro do tipo.</small>
        </label>

        <label className="field">
          <span>Descrição</span>
          <textarea
            value={campos.description}
            onChange={(evento) => mudar("description", evento.target.value)}
            placeholder="Limites, entregáveis e condição comercial"
            rows={3}
            maxLength={1000}
          />
        </label>

        {erro ? (
          <p className="inline-feedback feedback-error" role="alert">
            {erro}
          </p>
        ) : null}
      </form>
    </Sheet>
  );
}

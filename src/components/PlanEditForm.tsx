"use client";

import { FormEvent, useState } from "react";
import { Icone } from "@/components/ui/Icones";
import Segmented from "@/components/ui/Segmented";
import Sheet from "@/components/ui/Sheet";
import { slugify } from "@/lib/slug";

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

type StatusPlano = (typeof statusPlano)[number][0];

export function rotuloCiclo(valor: string | null) {
  return ciclos.find(([codigo]) => codigo === valor)?.[1] ?? "Pagamento único";
}

export function rotuloStatus(valor: string) {
  return statusPlano.find(([codigo]) => codigo === valor)?.[1] ?? valor;
}

/**
 * Preço na moeda do plano.
 *
 * Era fixo em real, e isso não é detalhe: um plano em dólar aparecia na tela
 * como "R$ 79,00", que é preço errado escrito com confiança. Desde 31/08/2026
 * a casa vende em cinco moedas (BRL, USD, CAD, EUR, GBP, AUD), cada mercado no
 * preço local, então quem exibe preço precisa dizer de qual moeda se trata.
 */
export function dinheiro(cents: number | null, moeda = "BRL") {
  if (cents === null) return "A definir";
  return new Intl.NumberFormat(moeda === "BRL" ? "pt-BR" : "en-US", {
    style: "currency",
    currency: moeda,
  }).format(cents / 100);
}

/** Só o símbolo, para o prefixo do campo de preço. */
export function simboloDaMoeda(moeda: string) {
  const mapa: Record<string, string> = { BRL: "R$", USD: "US$", CAD: "C$", EUR: "€", GBP: "£", AUD: "A$", MXN: "MX$" };
  return mapa[moeda] ?? moeda;
}

/** Moedas em que a casa vende. Fechada de propósito: moeda inventada vira preço que ninguém sabe cobrar. */
export const moedas = [
  ["BRL", "Real (R$)"],
  ["USD", "Dólar (US$)"],
  ["CAD", "Dólar canadense (C$)"],
  ["EUR", "Euro (€)"],
  ["GBP", "Libra (£)"],
  ["AUD", "Dólar australiano (A$)"],
  ["MXN", "Peso mexicano (MX$)"],
] as const;

function precoTexto(cents: number | null) {
  return cents === null ? "" : (cents / 100).toFixed(2).replace(".", ",");
}

type Campos = {
  serviceType: string;
  name: string;
  slug: string;
  price: string;
  currency: string;
  billingCycle: string;
  status: StatusPlano;
  sortOrder: string;
  description: string;
};

type Props = {
  /** `null` cria um plano novo. */
  plano: PlanoServico | null;
  tipoInicial: string;
  aoFechar: () => void;
  /** Recebe o plano como a API gravou, para a lista atualizar sem esperar o servidor. */
  aoSalvar: (mensagem: string, plano: PlanoServico) => void;
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
    currency: plano?.currency ?? "BRL",
    billingCycle: plano?.billingCycle ?? "ONE_TIME",
    status: (statusPlano.some(([codigo]) => codigo === plano?.status)
      ? plano?.status
      : "ACTIVE") as StatusPlano,
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
            slug: campos.slug || slugify(campos.name),
          }),
        },
      );
      const resultado = (await resposta.json()) as {
        error?: string;
        plan?: PlanoServico;
      };
      if (!resposta.ok || !resultado.plan) {
        throw new Error(resultado.error ?? "Não foi possível salvar o plano.");
      }
      aoSalvar(plano ? "Plano atualizado." : "Plano criado.", resultado.plan);
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
              if (!slugManual) mudar("slug", slugify(evento.target.value));
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
              mudar("slug", slugify(evento.target.value));
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
              <i aria-hidden="true">{simboloDaMoeda(campos.currency)}</i>
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
            <span>Moeda</span>
            <select
              value={campos.currency}
              onChange={(evento) => mudar("currency", evento.target.value)}
            >
              {moedas.map(([codigo, rotulo]) => (
                <option key={codigo} value={codigo}>
                  {rotulo}
                </option>
              ))}
            </select>
            <Icone nome="chevron" tamanho={16} className="chevron" />
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
          <Segmented
            opcoes={statusPlano}
            valor={campos.status}
            aoMudar={(valor) => mudar("status", valor)}
            rotulo="Status do plano"
          />
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

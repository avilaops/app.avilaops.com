"use client";

import { FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { classifyCpfCnpj, onlyDigits } from "@/lib/cpf-cnpj";
import type { CnpjLookupData } from "@/lib/cnpj-lookup";

function formatCpfCnpj(value: string): string {
  const digits = onlyDigits(value).slice(0, 14);
  if (digits.length <= 11) {
    return digits
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  }
  return digits
    .replace(/(\d{2})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1/$2")
    .replace(/(\d{4})(\d{1,2})$/, "$1-$2");
}

const segments = [
  "Serviços profissionais",
  "Comércio e e-commerce",
  "Indústria e manutenção",
  "Logística e transporte",
  "Alimentação e bem-estar",
  "Tecnologia",
  "Construção e obras",
  "Outro",
];

export default function OrganizationForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [cpfCnpjInput, setCpfCnpjInput] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const [cnpjData, setCnpjData] = useState<CnpjLookupData | null>(null);
  const [hasCurrentSite, setHasCurrentSite] = useState("");
  const [wantsCustomDomain, setWantsCustomDomain] = useState(true);
  const [checkingDomain, setCheckingDomain] = useState(false);
  const [domainCheck, setDomainCheck] = useState("");

  const nameInputRef = useRef<HTMLInputElement>(null);
  const legalNameInputRef = useRef<HTMLInputElement>(null);

  const classified = classifyCpfCnpj(cpfCnpjInput);

  async function runCnpjLookup(digits: string) {
    setLookupLoading(true);
    setLookupError("");
    setCnpjData(null);
    try {
      const response = await fetch(`/api/cnpj-lookup?cnpj=${digits}`);
      const result = (await response.json()) as { data?: CnpjLookupData; error?: string };
      if (!response.ok) {
        throw new Error(result.error ?? "Não foi possível consultar o CNPJ.");
      }
      const data = result.data ?? null;
      setCnpjData(data);
      if (data) {
        if (nameInputRef.current && !nameInputRef.current.value) {
          nameInputRef.current.value = data.nome_fantasia || data.razao_social || "";
        }
        if (legalNameInputRef.current && data.razao_social) {
          legalNameInputRef.current.value = data.razao_social;
        }
      }
    } catch (caught) {
      setLookupError(
        caught instanceof Error ? caught.message : "Não foi possível consultar o CNPJ.",
      );
    } finally {
      setLookupLoading(false);
    }
  }

  function handleCpfCnpjBlur() {
    if (classified?.kind === "CNPJ" && classified.valid) {
      void runCnpjLookup(classified.digits);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    setLoading(true);
    setMessage("");
    setError("");
    const form = new FormData(formEl);

    if (cpfCnpjInput && !classified?.valid) {
      setError("CPF ou CNPJ inválido.");
      setLoading(false);
      return;
    }

    try {
      const response = await fetch("/api/organizations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"),
          legalName: form.get("legalName"),
          segment: form.get("segment"),
          hasCurrentSite,
          siteUrl: form.get("siteUrl"),
          currentSiteDomain: form.get("currentSiteDomain"),
          siteProvider: form.get("siteProvider"),
          siteAccessStatus: form.get("siteAccessStatus"),
          siteNotes: form.get("siteNotes"),
          wantsCustomDomain,
          selectedDomainPlanSlug: form.get("selectedDomainPlanSlug"),
          desiredDomain: form.get("desiredDomain"),
          preferredExtension: form.get("preferredExtension"),
          alternativeDomains: form.get("alternativeDomains"),
          domainAvailabilityStatus: form.get("domainAvailabilityStatus"),
          cpfCnpj: classified?.digits ?? "",
          cnpjData: classified?.kind === "CNPJ" ? cnpjData : null,
        }),
      });
      const result = (await response.json()) as {
        organization?: { name: string };
        error?: string;
      };
      if (!response.ok) {
        throw new Error(result.error ?? "Não foi possível cadastrar o cliente.");
      }

      setMessage(`${result.organization?.name ?? "Cliente"} adicionado à operação.`);
      formEl.isConnected && formEl.reset();
      setCpfCnpjInput("");
      setCnpjData(null);
      setHasCurrentSite("");
      setWantsCustomDomain(true);
      router.refresh();
      window.setTimeout(() => {
        setOpen(false);
        setMessage("");
      }, 1600);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Não foi possível cadastrar o cliente.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function checkDomain(formEl: HTMLFormElement) {
    const domainInput = formEl.elements.namedItem("desiredDomain") as HTMLInputElement | null;
    const statusSelect = formEl.elements.namedItem("domainAvailabilityStatus") as HTMLSelectElement | null;
    const domain = domainInput?.value ?? "";
    if (!domain.trim()) {
      setError("Informe o domínio desejado antes de verificar.");
      return;
    }

    setCheckingDomain(true);
    setDomainCheck("");
    setError("");
    try {
      const response = await fetch("/api/domains/availability", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ domain }),
      });
      const result = (await response.json()) as {
        domain?: string;
        status?: string;
        message?: string;
        error?: string;
      };
      if (!response.ok) throw new Error(result.error ?? "Não foi possível verificar o domínio.");
      if (domainInput && result.domain) domainInput.value = result.domain;
      if (statusSelect && result.status) statusSelect.value = result.status;
      setDomainCheck(`${result.domain}: ${result.status} · ${result.message}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível verificar o domínio.");
    } finally {
      setCheckingDomain(false);
    }
  }

  return (
    <div className="organization-form-wrap">
      <button
        className="primary-button"
        type="button"
        onClick={() => {
          setOpen((current) => !current);
          setError("");
          setMessage("");
        }}
        aria-expanded={open}
      >
        {open ? "Fechar cadastro" : "Adicionar cliente"}
        <span aria-hidden="true">{open ? "×" : "+"}</span>
      </button>

      {open ? (
        <form className="organization-form" onSubmit={submit}>
          <div className="form-title">
            <div>
              <span className="eyebrow">Nova organização</span>
              <h2>Entrada operacional do cliente</h2>
            </div>
            <span className="status-chip">Dados mínimos</span>
          </div>

          <div className="operations-form-grid">
            <label>
              CPF ou CNPJ
              <input
                name="cpfCnpj"
                inputMode="numeric"
                maxLength={18}
                placeholder="00.000.000/0000-00"
                value={cpfCnpjInput}
                onChange={(event) => {
                  setCpfCnpjInput(formatCpfCnpj(event.target.value));
                  setCnpjData(null);
                  setLookupError("");
                }}
                onBlur={handleCpfCnpjBlur}
              />
            </label>
            <label>
              Nome da empresa *
              <input
                name="name"
                ref={nameInputRef}
                required
                minLength={2}
                maxLength={120}
                autoComplete="organization"
                placeholder="Empresa ou marca principal"
              />
            </label>
            <label>
              Razão social
              <input
                name="legalName"
                ref={legalNameInputRef}
                maxLength={160}
                placeholder="Opcional nesta etapa"
              />
            </label>
            <label>
              Segmento
              <select name="segment" defaultValue="">
                <option value="">Ainda não classificado</option>
                {segments.map((segment) => (
                  <option value={segment} key={segment}>
                    {segment}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Site atual
              <select
                name="hasCurrentSite"
                required
                value={hasCurrentSite}
                onChange={(event) => setHasCurrentSite(event.target.value)}
              >
                <option value="">Selecione</option>
                <option value="YES">Sim</option>
                <option value="NO">Não</option>
              </select>
            </label>
          </div>

          {hasCurrentSite === "YES" ? (
            <div className="conditional-form-block">
              <div className="form-block-heading">
                <span className="eyebrow">Site existente</span>
                <strong>Registrar contexto atual</strong>
              </div>
              <div className="operations-form-grid">
                <label>
                  URL do site atual *
                  <input
                    name="siteUrl"
                    type="url"
                    inputMode="url"
                    required
                    placeholder="https://empresa.com.br"
                  />
                </label>
                <label>
                  Domínio principal
                  <input name="currentSiteDomain" placeholder="empresa.com.br" />
                </label>
                <label>
                  Responsável pelo site
                  <input name="siteProvider" placeholder="Agência, freelancer ou interno" />
                </label>
                <label>
                  Acesso disponível
                  <select name="siteAccessStatus" defaultValue="WILL_REQUEST">
                    <option value="YES">Sim</option>
                    <option value="NO">Não</option>
                    <option value="WILL_REQUEST">Será solicitado</option>
                  </select>
                </label>
              </div>
              <label className="full-field">
                Observações
                <textarea
                  name="siteNotes"
                  rows={3}
                  placeholder="Stack, provedor, pendências, riscos ou acesso pendente."
                />
              </label>
            </div>
          ) : null}

          {hasCurrentSite === "NO" ? (
            <div className="conditional-form-block">
              <div className="form-block-heading">
                <span className="eyebrow">Sem site atual</span>
                <strong>Domínio personalizado</strong>
              </div>
              <label className="switch-line">
                <input
                  type="checkbox"
                  checked={wantsCustomDomain}
                  onChange={(event) => setWantsCustomDomain(event.target.checked)}
                />
                Deseja contratar um domínio personalizado?
              </label>

              <div className="domain-plan-grid">
                {[
                  ["domain-1-year", "1 ano", "R$ 60"],
                  ["domain-2-years", "2 anos", "R$ 120"],
                  ["domain-4-years", "4 anos", "R$ 220"],
                  ["domain-none", "Sem domínio", "Não irá utilizar"],
                ].map(([value, label, price]) => (
                  <label className="plan-option" key={value}>
                    <input
                      type="radio"
                      name="selectedDomainPlanSlug"
                      value={value}
                      defaultChecked={value === "domain-1-year"}
                      disabled={!wantsCustomDomain && value !== "domain-none"}
                    />
                    <span>{label}</span>
                    <strong>{price}</strong>
                  </label>
                ))}
              </div>

              <div className="operations-form-grid">
                <label>
                  Domínio desejado
                  <input name="desiredDomain" placeholder="engreaco.com.br" />
                </label>
                <button
                  className="secondary-button cep-button"
                  type="button"
                  onClick={(event) => {
                    const form = event.currentTarget.form;
                    if (form) void checkDomain(form);
                  }}
                  disabled={checkingDomain}
                >
                  {checkingDomain ? "Verificando..." : "Verificar domínio"}
                </button>
                <label>
                  Extensão preferida
                  <select name="preferredExtension" defaultValue=".com.br">
                    <option value=".com.br">.com.br</option>
                    <option value=".com">.com</option>
                    <option value="outra">Outra</option>
                  </select>
                </label>
                <label>
                  Status da disponibilidade
                  <select name="domainAvailabilityStatus" defaultValue="NOT_CHECKED">
                    <option value="NOT_CHECKED">Não verificado</option>
                    <option value="AVAILABLE">Disponível</option>
                    <option value="UNAVAILABLE">Indisponível</option>
                  </select>
                </label>
                <label>
                  Sugestões alternativas
                  <input name="alternativeDomains" placeholder="engrenagensengreaco.com.br" />
                </label>
              </div>
              <p className="inline-feedback">
                A seleção registra uma oportunidade comercial. Disponibilidade e
                preço real serão confirmados antes de contratação ou cobrança.
              </p>
              {domainCheck ? (
                <p className="inline-feedback feedback-success">{domainCheck}</p>
              ) : null}
            </div>
          ) : null}

          {classified?.kind === "CNPJ" && !classified.valid ? (
            <p className="inline-feedback feedback-error">CNPJ inválido.</p>
          ) : null}
          {classified?.kind === "CPF" && !classified.valid ? (
            <p className="inline-feedback feedback-error">CPF inválido.</p>
          ) : null}
          {lookupLoading ? (
            <p className="inline-feedback">Consultando CNPJ na Receita Federal…</p>
          ) : null}
          {lookupError ? <p className="inline-feedback feedback-error">{lookupError}</p> : null}
          {cnpjData ? (
            <p className="inline-feedback feedback-success">
              {cnpjData.razao_social ?? "Empresa encontrada"}
              {cnpjData.descricao_situacao_cadastral
                ? ` · Situação: ${cnpjData.descricao_situacao_cadastral}`
                : ""}
              {cnpjData.municipio && cnpjData.uf
                ? ` · ${cnpjData.municipio}/${cnpjData.uf}`
                : ""}
            </p>
          ) : null}

          <div className="organization-form-actions">
            <p>
              Contatos, documentos e credenciais serão coletados em fluxos
              separados, com permissão e finalidade explícitas.
            </p>
            <button className="primary-button" type="submit" disabled={loading}>
              {loading ? "Salvando…" : "Criar organização"}
            </button>
          </div>

          {error ? <p className="inline-feedback feedback-error">{error}</p> : null}
          {message ? (
            <p className="inline-feedback feedback-success">{message}</p>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}

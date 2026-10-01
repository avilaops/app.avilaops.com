"use client";

import { FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { classifyCpfCnpj, onlyDigits } from "@/lib/cpf-cnpj";
import type { CnpjLookupData } from "@/lib/cnpj-lookup";
import type { FichaCadastral } from "@/lib/ficha-cadastral";
import { nomeProprio } from "@/lib/format";

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

/**
 * Campos da ficha que o cadastro rápido não pede, mas que a ficha completa do
 * cliente guarda. Vindo de uma ficha em PDF, aparecem aqui para conferência e
 * entram junto no cadastro, em vez de serem redigitados depois.
 */
const CAMPOS_EXTRAS_DA_FICHA: Array<{
  nome: string;
  rotulo: string;
  campo: keyof FichaCadastral;
  tipo?: string;
}> = [
  { nome: "stateRegistration", rotulo: "Inscrição estadual", campo: "inscricaoEstadual" },
  { nome: "municipalRegistration", rotulo: "Inscrição municipal", campo: "inscricaoMunicipal" },
  { nome: "ownerName", rotulo: "Responsável", campo: "responsavel" },
  { nome: "phone", rotulo: "Telefone", campo: "telefone" },
  { nome: "whatsapp", rotulo: "WhatsApp", campo: "whatsapp" },
  { nome: "email", rotulo: "E-mail", campo: "email", tipo: "email" },
  { nome: "postalCode", rotulo: "CEP", campo: "cep" },
  { nome: "street", rotulo: "Logradouro", campo: "logradouro" },
  { nome: "number", rotulo: "Número", campo: "numero" },
  { nome: "complement", rotulo: "Complemento", campo: "complemento" },
  { nome: "district", rotulo: "Bairro", campo: "bairro" },
  { nome: "city", rotulo: "Cidade", campo: "cidade" },
  { nome: "state", rotulo: "UF", campo: "uf" },
];

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
  const fichaInputRef = useRef<HTMLInputElement>(null);

  const [ficha, setFicha] = useState<FichaCadastral | null>(null);
  const [fichaVersao, setFichaVersao] = useState(0);
  const [fichaLendo, setFichaLendo] = useState(false);
  const [fichaAviso, setFichaAviso] = useState("");
  const [fichaErro, setFichaErro] = useState("");

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
          nameInputRef.current.value = nomeProprio(data.nome_fantasia || data.razao_social);
        }
        if (legalNameInputRef.current && data.razao_social) {
          // A Receita devolve tudo em caixa alta; o cadastro guarda como nome próprio.
          legalNameInputRef.current.value = nomeProprio(data.razao_social);
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

  async function importarFicha(arquivo: File) {
    setFichaLendo(true);
    setFichaErro("");
    setFichaAviso("");
    try {
      const corpo = new FormData();
      corpo.append("arquivo", arquivo);
      const response = await fetch("/api/fichas/ler", { method: "POST", body: corpo });
      const result = (await response.json()) as {
        ficha?: FichaCadastral;
        campos?: string[];
        error?: string;
      };
      if (!response.ok || !result.ficha) {
        throw new Error(result.error ?? "Não foi possível ler a ficha.");
      }
      const lida = result.ficha;

      // A ficha é a fonte que a pessoa acabou de escolher: os campos que ela
      // traz substituem o que estava digitado, e os que ela não traz ficam.
      const nome = lida.nomeFantasia || lida.razaoSocial;
      if (nome && nameInputRef.current) nameInputRef.current.value = nome;
      if (lida.razaoSocial && legalNameInputRef.current) {
        legalNameInputRef.current.value = lida.razaoSocial;
      }
      if (lida.cpfCnpj) {
        setCpfCnpjInput(formatCpfCnpj(lida.cpfCnpj));
        setCnpjData(null);
        setLookupError("");
        // CNPJ da ficha passa pela Receita como o digitado: situação
        // cadastral e razão social oficial chegam antes de salvar.
        if (lida.cpfCnpj.length === 14) void runCnpjLookup(lida.cpfCnpj);
      }
      setFicha(lida);
      setFichaVersao((versao) => versao + 1);
      setFichaAviso(
        `${result.campos?.length ?? 0} campos lidos de ${arquivo.name}. Confira antes de criar.`,
      );
    } catch (caught) {
      setFichaErro(caught instanceof Error ? caught.message : "Não foi possível ler a ficha.");
    } finally {
      setFichaLendo(false);
      if (fichaInputRef.current) fichaInputRef.current.value = "";
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
          perfil: ficha
            ? Object.fromEntries(
                CAMPOS_EXTRAS_DA_FICHA.map(({ nome }) => [nome, form.get(nome) ?? ""]),
              )
            : null,
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
      setFicha(null);
      setFichaAviso("");
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
              <h2>Entrada operacional do cliente</h2>
            </div>
            <div className="form-title-acoes">
              <span className="status-chip">Dados mínimos</span>
              <button
                className="row-action"
                type="button"
                onClick={() => fichaInputRef.current?.click()}
                disabled={fichaLendo}
              >
                {fichaLendo ? "Lendo ficha…" : "Importar ficha PDF"}
              </button>
              <input
                ref={fichaInputRef}
                type="file"
                accept="application/pdf,.pdf"
                hidden
                onChange={(event) => {
                  const arquivo = event.target.files?.[0];
                  if (arquivo) void importarFicha(arquivo);
                }}
              />
            </div>
          </div>
          {fichaAviso ? <p className="inline-feedback feedback-success">{fichaAviso}</p> : null}
          {fichaErro ? <p className="inline-feedback feedback-error">{fichaErro}</p> : null}

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

          {ficha ? (
            <div className="conditional-form-block" key={fichaVersao}>
              <div className="form-block-heading">
                <span className="eyebrow">Da ficha cadastral</span>
                <strong>Contato, inscrições e endereço</strong>
              </div>
              <div className="operations-form-grid">
                {CAMPOS_EXTRAS_DA_FICHA.map(({ nome, rotulo, campo, tipo }) => (
                  <label key={nome}>
                    {rotulo}
                    <input name={nome} type={tipo ?? "text"} defaultValue={ficha[campo] ?? ""} />
                  </label>
                ))}
              </div>
            </div>
          ) : null}

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

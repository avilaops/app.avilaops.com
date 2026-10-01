"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Grupo } from "@/components/sistema/Lista";
import type { DadosFiscaisDaCasa } from "@/lib/dados-da-casa";

type Campo = {
  nome: keyof DadosFiscaisDaCasa;
  rotulo: string;
  ajuda?: string;
  tipo?: "text" | "email" | "tel" | "url";
  modo?: "numeric" | "decimal";
  largo?: boolean;
};

const BLOCOS: Array<{ titulo: string; campos: Campo[] }> = [
  {
    titulo: "Empresa",
    campos: [
      { nome: "cnpj", rotulo: "CNPJ", modo: "numeric" },
      { nome: "razaoSocial", rotulo: "Razão social", largo: true },
      { nome: "inscricaoMunicipal", rotulo: "Inscrição municipal", ajuda: "Obrigatória para emitir NFS-e." },
      { nome: "inscricaoEstadual", rotulo: "Inscrição estadual", ajuda: "Só se a empresa tiver. Prestador de serviço costuma ser isento." },
      { nome: "cnae", rotulo: "CNAE principal", modo: "numeric", ajuda: "7 dígitos. Ex.: 6201501 (desenvolvimento de software sob encomenda)." },
    ],
  },
  {
    titulo: "Nota de serviço",
    campos: [
      { nome: "codigoServico", rotulo: "Código do serviço (LC 116)", ajuda: "Ex.: 1.07 — suporte técnico em informática." },
      { nome: "codigoTributacaoMunicipal", rotulo: "Código de tributação municipal", ajuda: "Só se a prefeitura usar um código próprio." },
      { nome: "aliquotaIss", rotulo: "Alíquota do ISS (%)", modo: "decimal", ajuda: "Ex.: 2,00. No Simples, a alíquota da sua faixa." },
    ],
  },
  {
    titulo: "Contato",
    campos: [
      { nome: "emailFiscal", rotulo: "E-mail fiscal", tipo: "email", ajuda: "Para onde a prefeitura e o contador mandam aviso." },
      { nome: "telefone", rotulo: "Telefone", tipo: "tel" },
      { nome: "site", rotulo: "Site", tipo: "url" },
    ],
  },
  {
    titulo: "Endereço",
    campos: [
      { nome: "cep", rotulo: "CEP", modo: "numeric" },
      { nome: "logradouro", rotulo: "Logradouro", largo: true },
      { nome: "numero", rotulo: "Número" },
      { nome: "complemento", rotulo: "Complemento" },
      { nome: "bairro", rotulo: "Bairro" },
      { nome: "municipio", rotulo: "Município" },
      { nome: "uf", rotulo: "UF" },
      { nome: "codigoMunicipioIbge", rotulo: "Código IBGE do município", modo: "numeric", ajuda: "7 dígitos. A NFS-e identifica a cidade por ele." },
    ],
  },
];

const ROTULOS: Record<string, string> = Object.fromEntries(
  BLOCOS.flatMap((b) => b.campos).map((c) => [c.nome, c.rotulo]).concat([["regimeTributario", "Regime tributário"]]),
);

/**
 * Os dados que vão no cabeçalho da nota de serviço.
 *
 * "Buscar na Receita" preenche o que a BrasilAPI devolve e não salva nada
 * sozinho: o dono confere antes. Inscrição municipal, código do serviço e
 * alíquota a Receita não sabe — são da prefeitura, e ficam para quem tem o
 * alvará na mão.
 */
export default function DadosFiscaisForm({
  dados: iniciais,
  regimes,
  ufs,
  obrigatorios,
}: {
  dados: DadosFiscaisDaCasa;
  regimes: ReadonlyArray<{ valor: string; rotulo: string }>;
  ufs: ReadonlyArray<string>;
  obrigatorios: ReadonlyArray<keyof DadosFiscaisDaCasa>;
}) {
  const router = useRouter();
  const [dados, setDados] = useState<DadosFiscaisDaCasa>(iniciais);
  // O que está no banco. `iniciais` não serve depois de salvar: o refresh
  // não reinicia o estado deste componente.
  const [salvos, setSalvos] = useState<DadosFiscaisDaCasa>(iniciais);
  const [ocupado, setOcupado] = useState<"salvar" | "receita" | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [recado, setRecado] = useState<string | null>(null);

  const faltando = obrigatorios.filter((campo) => !dados[campo].trim());
  const mudou = JSON.stringify(dados) !== JSON.stringify(salvos);

  function mudar(campo: keyof DadosFiscaisDaCasa, valor: string) {
    setDados((atual) => ({ ...atual, [campo]: valor }));
    setRecado(null);
  }

  async function buscarNaReceita() {
    const cnpj = dados.cnpj.replace(/\D/g, "");
    if (cnpj.length !== 14) {
      setErro("Digite os 14 dígitos do CNPJ antes de buscar.");
      return;
    }
    setOcupado("receita");
    setErro(null);
    setRecado(null);

    try {
      const resposta = await fetch(`/api/cnpj-lookup?cnpj=${cnpj}`);
      const corpo = (await resposta.json().catch(() => ({}))) as {
        data?: Record<string, unknown>;
        error?: string;
      };
      if (!resposta.ok || !corpo.data) throw new Error(corpo.error ?? "A Receita não respondeu.");

      const r = corpo.data;
      const texto = (valor: unknown) =>
        valor === null || valor === undefined ? "" : String(valor).trim();

      // Só preenche o que veio; o que a Receita não devolveu continua como
      // estava, em vez de ser apagado por um vazio.
      setDados((atual) => {
        const novo = { ...atual };
        const pares: Array<[keyof DadosFiscaisDaCasa, string]> = [
          ["razaoSocial", texto(r.razao_social)],
          ["cnae", texto(r.cnae_fiscal)],
          ["emailFiscal", texto(r.email).toLowerCase()],
          ["telefone", texto(r.ddd_telefone_1)],
          ["cep", texto(r.cep)],
          ["logradouro", [texto(r.descricao_tipo_de_logradouro), texto(r.logradouro)].filter(Boolean).join(" ")],
          ["numero", texto(r.numero)],
          ["complemento", texto(r.complemento)],
          ["bairro", texto(r.bairro)],
          ["municipio", texto(r.municipio)],
          ["uf", texto(r.uf)],
          ["codigoMunicipioIbge", texto(r.codigo_municipio_ibge)],
        ];
        for (const [campo, valor] of pares) if (valor) novo[campo] = valor;
        return novo;
      });
      setRecado("Dados da Receita preenchidos. Confira e salve.");
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : "Não consegui consultar a Receita.");
    } finally {
      setOcupado(null);
    }
  }

  async function salvar() {
    setOcupado("salvar");
    setErro(null);
    setRecado(null);

    try {
      const resposta = await fetch("/api/empresa/dados", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(dados),
      });
      const corpo = (await resposta.json().catch(() => ({}))) as {
        erro?: string;
        dados?: DadosFiscaisDaCasa;
      };
      if (!resposta.ok) throw new Error(corpo.erro ?? "Não consegui salvar.");
      if (corpo.dados) {
        setDados(corpo.dados);
        setSalvos(corpo.dados);
      }
      setRecado("Dados da empresa salvos.");
      router.refresh();
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : "Não consegui salvar.");
    } finally {
      setOcupado(null);
    }
  }

  return (
    <Grupo titulo="Dados para nota fiscal">
      <div className="dados-casa">
        {faltando.length ? (
          <p className="dados-casa-faltando">
            <strong>Para emitir nota faltam:</strong>{" "}
            {faltando.map((campo) => ROTULOS[campo] ?? campo).join(", ")}.
          </p>
        ) : (
          <p className="aviso-ok">Tudo que a nota de serviço pede está preenchido.</p>
        )}

        {BLOCOS.map((bloco) => (
          <fieldset className="dados-casa-bloco" key={bloco.titulo} disabled={ocupado !== null}>
            <legend>{bloco.titulo}</legend>
            <div className="dados-casa-grade">
              {bloco.campos.map((campo) =>
                campo.nome === "uf" ? (
                  <label className="credencial-campo" key={campo.nome}>
                    <span>{campo.rotulo}</span>
                    <select value={dados.uf} onChange={(e) => mudar("uf", e.target.value)}>
                      <option value="">—</option>
                      {ufs.map((uf) => (
                        <option key={uf} value={uf}>
                          {uf}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : campo.nome === "cnpj" ? (
                  <div className="dados-casa-cnpj" key={campo.nome}>
                    <label className="credencial-campo">
                      <span>{campo.rotulo}</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={dados.cnpj}
                        onChange={(e) => mudar("cnpj", e.target.value)}
                      />
                    </label>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => void buscarNaReceita()}
                    >
                      {ocupado === "receita" ? "Buscando…" : "Buscar na Receita"}
                    </button>
                  </div>
                ) : (
                  <label
                    className={`credencial-campo${campo.largo ? " dados-casa-largo" : ""}`}
                    key={campo.nome}
                  >
                    <span>{campo.rotulo}</span>
                    <input
                      type={campo.tipo ?? "text"}
                      inputMode={campo.modo}
                      value={dados[campo.nome]}
                      onChange={(e) => mudar(campo.nome, e.target.value)}
                    />
                    {campo.ajuda ? <small>{campo.ajuda}</small> : null}
                  </label>
                ),
              )}

              {bloco.titulo === "Empresa" ? (
                <>
                  <label className="credencial-campo">
                    <span>Regime tributário</span>
                    <select
                      value={dados.regimeTributario}
                      onChange={(e) => mudar("regimeTributario", e.target.value)}
                    >
                      <option value="">—</option>
                      {regimes.map((r) => (
                        <option key={r.valor} value={r.valor}>
                          {r.rotulo}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              ) : null}
            </div>
          </fieldset>
        ))}

        <div className="credenciais-acoes">
          <button
            type="button"
            className="primary-button"
            disabled={ocupado !== null || !mudou}
            onClick={() => void salvar()}
          >
            {ocupado === "salvar" ? "Salvando…" : "Salvar dados da empresa"}
          </button>
        </div>

        {erro ? <p className="aviso-erro">{erro}</p> : null}
        {recado ? <p className="aviso-ok">{recado}</p> : null}
      </div>
    </Grupo>
  );
}

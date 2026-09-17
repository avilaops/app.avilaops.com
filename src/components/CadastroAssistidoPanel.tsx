"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Assistente de cadastro: mostra o que falta na ficha do cliente, de onde
 * cada lacuna pode ser preenchida, e põe as propostas numa fila de revisão.
 *
 * O painel nunca grava sozinho. Ele propõe; quem decide marca o que aceita e
 * clica em aplicar. É de propósito: o cadastro do cliente é a base da
 * cobrança, do contrato e do site, e dado que entrou sem ninguém olhar é pior
 * do que campo vazio, porque parece conferido.
 */

type Lacuna = {
  chave: string;
  rotulo: string;
  grupo: string;
  origens: string[];
  porque?: string;
};

type Analise = {
  totalCampos: number;
  preenchidos: number;
  completude: number;
  lacunas: Lacuna[];
  preenchiveisPelaReceita: number;
  preenchiveisPelaSefaz: number;
  preenchiveisPelaIa: number;
  somenteComOCliente: number;
  temConsultaDeCnpj: boolean;
  temRetratoDaSefaz: boolean;
};

type Sugestao = {
  id: string;
  campo: string;
  rotulo: string;
  grupo: string;
  multilinha: boolean;
  valor: string;
  origem: string;
  confianca: string;
  justificativa: string | null;
  criadaEm: string;
};

export type Painel = {
  organizationId: string;
  nome: string;
  analise: Analise;
  pendentes: Sugestao[];
  temPendentesDaIa: boolean;
  temDadosDeCnpj: boolean;
  temRetratoDaSefaz: boolean;
  iaDisponivel: boolean;
};

type Resposta = {
  status?: string;
  error?: string;
  criadas?: number;
  observacao?: string;
  aplicadas?: string[];
  descartadas?: number;
  ignoradas?: string[];
  painel?: Painel;
};

const ROTULO_ORIGEM: Record<string, string> = {
  RECEITA_FEDERAL: "Receita Federal",
  SEFAZ: "NF-e (SEFAZ)",
  IA: "IA",
  CLIENTE: "Cliente",
};

const ROTULO_CONFIANCA: Record<string, string> = {
  ALTA: "Confiança alta",
  MEDIA: "Confiança média",
  BAIXA: "Confiança baixa",
};

export default function CadastroAssistidoPanel({ painelInicial }: { painelInicial: Painel }) {
  const router = useRouter();
  const [painel, setPainel] = useState(painelInicial);
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [ocupado, setOcupado] = useState<"" | "receita" | "sefaz" | "ia" | "decisao">("");
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");

  const { analise, pendentes } = painel;

  function alternar(id: string) {
    setSelecionadas((atual) => {
      const proxima = new Set(atual);
      if (proxima.has(id)) proxima.delete(id);
      else proxima.add(id);
      return proxima;
    });
  }

  function aplicarResposta(resultado: Resposta) {
    if (resultado.painel) setPainel(resultado.painel);
    setSelecionadas(new Set());
    // A ficha logo abaixo é renderizada no servidor: sem o refresh ela
    // continuaria mostrando os campos vazios que acabaram de ser gravados.
    router.refresh();
  }

  async function gerar(origem: "RECEITA_FEDERAL" | "SEFAZ" | "IA") {
    setOcupado(origem === "IA" ? "ia" : origem === "SEFAZ" ? "sefaz" : "receita");
    setMensagem("");
    setErro("");

    try {
      const resposta = await fetch(
        `/api/organizations/${painel.organizationId}/cadastro/sugestoes`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ origem }),
        },
      );
      const resultado = (await resposta.json()) as Resposta;

      if (!resposta.ok) throw new Error(resultado.error ?? "Falha ao gerar sugestões.");

      if (resultado.status === "NOT_CONFIGURED") {
        setMensagem(
          "A IA ainda não está habilitada neste ambiente. O preenchimento pela Receita Federal continua disponível.",
        );
        return;
      }
      if (resultado.status === "SPEND_LIMIT") {
        setMensagem(resultado.error ?? "Orçamento de IA do período esgotado.");
        return;
      }

      aplicarResposta(resultado);

      const criadas = resultado.criadas ?? 0;
      setMensagem(
        criadas === 0
          ? "Nenhuma sugestão nova — não havia base suficiente para os campos vazios."
          : `${criadas} ${criadas === 1 ? "sugestão" : "sugestões"} para revisar.` +
              (resultado.observacao ? ` ${resultado.observacao}` : ""),
      );
    } catch (capturado) {
      setErro(capturado instanceof Error ? capturado.message : "Não foi possível gerar.");
    } finally {
      setOcupado("");
    }
  }

  async function decidir(acao: "aplicar" | "descartar") {
    if (selecionadas.size === 0) return;

    setOcupado("decisao");
    setMensagem("");
    setErro("");

    const ids = [...selecionadas];

    try {
      const resposta = await fetch(
        `/api/organizations/${painel.organizationId}/cadastro/sugestoes/decidir`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(
            acao === "aplicar" ? { aprovadas: ids } : { descartadas: ids },
          ),
        },
      );
      const resultado = (await resposta.json()) as Resposta;

      if (!resposta.ok) throw new Error(resultado.error ?? "Falha ao registrar a decisão.");

      aplicarResposta(resultado);

      if (acao === "descartar") {
        setMensagem(`${resultado.descartadas ?? ids.length} descartadas.`);
        return;
      }

      const aplicadas = resultado.aplicadas ?? [];
      const ignoradas = resultado.ignoradas ?? [];
      setMensagem(
        [
          aplicadas.length > 0
            ? `Gravado no cadastro: ${aplicadas.join(", ")}.`
            : "Nada foi gravado.",
          ignoradas.length > 0
            ? `Ignorado por já estar preenchido: ${ignoradas.join(", ")}.`
            : "",
        ]
          .filter(Boolean)
          .join(" "),
      );
    } catch (capturado) {
      setErro(capturado instanceof Error ? capturado.message : "Não foi possível salvar.");
    } finally {
      setOcupado("");
    }
  }

  // Uma lacuna só é "do cliente" quando nenhuma automação a alcança — não
  // basta a Receita não resolver.
  const soComOCliente = analise.lacunas.filter(
    (lacuna) => lacuna.origens.length === 1 && lacuna.origens[0] === "CLIENTE",
  );

  return (
    <section className="cadastro-ia">
      <header className="cadastro-ia-topo">
        <div>
          <span className="eyebrow">ASSISTENTE DE CADASTRO</span>
          <h2>
            {analise.completude}% preenchido
            <small>
              {analise.preenchidos} de {analise.totalCampos} campos acompanhados
            </small>
          </h2>
        </div>
        <div className="cadastro-ia-acoes">
          <button
            type="button"
            className="secondary-button"
            disabled={ocupado !== "" || !painel.temDadosDeCnpj || analise.preenchiveisPelaReceita === 0}
            onClick={() => gerar("RECEITA_FEDERAL")}
            title={
              painel.temDadosDeCnpj
                ? "Usa a consulta de CNPJ já guardada neste cadastro."
                : "Este cliente não tem consulta de CNPJ guardada."
            }
          >
            {ocupado === "receita" ? "Lendo…" : "Preencher pela Receita"}
          </button>
          <button
            type="button"
            className="secondary-button"
            disabled={
              ocupado !== "" || !painel.temRetratoDaSefaz || analise.preenchiveisPelaSefaz === 0
            }
            onClick={() => gerar("SEFAZ")}
            title={
              painel.temRetratoDaSefaz
                ? "Usa o bloco do destinatário da NF-e mais recente que a sincronização fiscal guardou."
                : "A sincronização da SEFAZ ainda não guardou nota deste cliente."
            }
          >
            {ocupado === "sefaz" ? "Lendo…" : "Preencher pela NF-e"}
          </button>
          <button
            type="button"
            className="secondary-button"
            disabled={ocupado !== "" || analise.preenchiveisPelaIa === 0 || !painel.iaDisponivel}
            onClick={() => gerar("IA")}
            title={
              painel.iaDisponivel
                ? "Redige os campos descritivos a partir do que o sistema já sabe."
                : "A IA está desligada neste ambiente (AI_CORE_ENABLED)."
            }
          >
            {ocupado === "ia" ? "Redigindo…" : "Redigir com IA"}
          </button>
        </div>
      </header>

      <div className="cadastro-ia-barra" aria-hidden="true">
        <span style={{ width: `${analise.completude}%` }} />
      </div>

      <p className="cadastro-ia-resumo">
        {analise.lacunas.length === 0
          ? "Nenhuma lacuna nos campos acompanhados."
          : `${analise.lacunas.length} campos vazios · ${analise.preenchiveisPelaReceita} a Receita resolve · ${analise.preenchiveisPelaSefaz} a NF-e resolve · ${analise.preenchiveisPelaIa} a IA redige · ${analise.somenteComOCliente} só o cliente responde.`}
        {/* Sem consulta de CNPJ os campos oficiais só caem no colo do cliente
            quando a NF-e também não os cobre. Afirmar isso olhando apenas para
            a Receita ficou errado no dia em que a origem SEFAZ nasceu. */}
        {analise.lacunas.length > 0 && !analise.temConsultaDeCnpj ? (
          <>
            {" "}
            <strong>
              {analise.temRetratoDaSefaz
                ? "Este cliente não tem consulta de CNPJ guardada; o que aparece como oficial veio da NF-e mais recente, escrita por um fornecedor — confira antes de aplicar."
                : "Este cliente não tem consulta de CNPJ nem nota guardada, então razão social, endereço e contato oficial contam como \u201Csó o cliente responde\u201D."}
            </strong>
          </>
        ) : null}
      </p>

      {!painel.iaDisponivel ? (
        <p className="cadastro-ia-aviso">
          A IA está desligada neste ambiente, então &quot;Redigir com IA&quot; fica indisponível.
          {/* Só apontar para a Receita quando ela tem o que devolver: num
              cliente sem consulta de CNPJ guardada aquele botão também está
              desativado, e mandar a pessoa para lá é trocar uma porta
              fechada por outra. */}
          {painel.temDadosDeCnpj
            ? " O preenchimento pela Receita Federal não depende dela e continua valendo."
            : painel.temRetratoDaSefaz
              ? " O preenchimento pela NF-e não depende dela e continua valendo."
              : " Este cliente também não tem consulta de CNPJ nem nota guardada, então os campos que restam precisam vir do cliente."}
        </p>
      ) : null}

      {erro ? <p className="cadastro-ia-erro">{erro}</p> : null}
      {mensagem ? <p className="cadastro-ia-mensagem">{mensagem}</p> : null}

      {pendentes.length > 0 ? (
        <div className="cadastro-ia-fila">
          <div className="seo-section-heading">
            <h3>Esperando sua decisão</h3>
            <span className="cadastro-ia-contador">{selecionadas.size} selecionadas</span>
          </div>

          <ul className="cadastro-ia-lista">
            {pendentes.map((sugestao) => (
              <li
                key={sugestao.id}
                className={
                  sugestao.origem === "IA"
                    ? "da-ia"
                    : sugestao.origem === "SEFAZ"
                      ? "da-sefaz"
                      : "da-receita"
                }
              >
                <label>
                  <input
                    type="checkbox"
                    checked={selecionadas.has(sugestao.id)}
                    onChange={() => alternar(sugestao.id)}
                  />
                  <span className="cadastro-ia-campo">
                    <strong>{sugestao.rotulo}</strong>
                    <small>
                      {sugestao.grupo} · {ROTULO_ORIGEM[sugestao.origem] ?? sugestao.origem}
                      {sugestao.origem === "RECEITA_FEDERAL"
                        ? ""
                        : ` · ${ROTULO_CONFIANCA[sugestao.confianca] ?? sugestao.confianca}`}
                    </small>
                  </span>
                </label>
                <p className={sugestao.multilinha ? "cadastro-ia-valor longo" : "cadastro-ia-valor"}>
                  {sugestao.valor}
                </p>
                {sugestao.justificativa ? (
                  <small className="cadastro-ia-justificativa">{sugestao.justificativa}</small>
                ) : null}
              </li>
            ))}
          </ul>

          <div className="cadastro-ia-decisao">
            <button
              type="button"
              className="primary-button"
              disabled={ocupado !== "" || selecionadas.size === 0}
              onClick={() => decidir("aplicar")}
            >
              {ocupado === "decisao" ? "Salvando…" : "Aplicar selecionadas"}
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={ocupado !== "" || selecionadas.size === 0}
              onClick={() => decidir("descartar")}
            >
              Descartar selecionadas
            </button>
            <small>
              Aplicar grava o texto exato acima. Para ajustar a redação, aplique e edite no
              formulário abaixo — a alteração fica registrada como edição sua.
            </small>
          </div>
        </div>
      ) : null}

      {soComOCliente.length > 0 ? (
        <div className="cadastro-ia-perguntar">
          <div className="seo-section-heading">
            <h3>Só o cliente responde</h3>
            <span className="cadastro-ia-contador">{soComOCliente.length} campos</span>
          </div>
          <ul>
            {soComOCliente.map((lacuna) => (
              <li key={lacuna.chave}>
                <strong>{lacuna.rotulo}</strong>
                <small>{lacuna.porque ?? lacuna.grupo}</small>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

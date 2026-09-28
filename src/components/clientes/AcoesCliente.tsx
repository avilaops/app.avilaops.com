"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Sheet from "@/components/ui/Sheet";

/**
 * Menu de ações de um cliente: abrir a ficha, arquivar/reativar e, para o
 * dono, excluir. É o mesmo componente na linha da lista e no cabeçalho da
 * ficha, para a pessoa achar a exclusão onde procurar.
 *
 * A exclusão pede o nome do cliente digitado. A API ainda confere se ele tem
 * assinatura, domínio, marca ou acesso ao portal e, se tiver, recusa e manda
 * arquivar: apagar isso levaria junto histórico de cobrança.
 */
export default function AcoesCliente({
  id,
  nome,
  status,
  podeExcluir,
  aoExcluirIrPara,
  rotulo = "Ações",
}: {
  id: string;
  nome: string;
  status: string;
  podeExcluir: boolean;
  /** Para onde ir depois de excluir; sem isto, só recarrega a página atual. */
  aoExcluirIrPara?: string;
  rotulo?: string;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState<"" | "menu" | "excluir">("");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const arquivado = status === "ARCHIVED";

  function fechar() {
    setAberto("");
    setErro("");
    setConfirmacao("");
  }

  async function mudarStatus() {
    setOcupado(true);
    setErro("");
    try {
      const resposta = await fetch(`/api/organizations/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: arquivado ? "ACTIVE" : "ARCHIVED" }),
      });
      const resultado = (await resposta.json()) as { error?: string };
      if (!resposta.ok) throw new Error(resultado.error ?? "Não foi possível mudar a situação.");
      fechar();
      router.refresh();
    } catch (capturado) {
      setErro(capturado instanceof Error ? capturado.message : "Não foi possível mudar a situação.");
    } finally {
      setOcupado(false);
    }
  }

  async function excluir() {
    setOcupado(true);
    setErro("");
    try {
      const resposta = await fetch(`/api/organizations/${id}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirmacao }),
      });
      const resultado = (await resposta.json()) as { error?: string };
      if (!resposta.ok) throw new Error(resultado.error ?? "Não foi possível excluir.");
      fechar();
      if (aoExcluirIrPara) router.replace(aoExcluirIrPara);
      else router.refresh();
    } catch (capturado) {
      setErro(capturado instanceof Error ? capturado.message : "Não foi possível excluir.");
    } finally {
      setOcupado(false);
    }
  }

  const confere =
    confirmacao.trim().toLocaleLowerCase("pt-BR") === nome.trim().toLocaleLowerCase("pt-BR");

  return (
    <>
      <button
        type="button"
        className="acoes-cliente-botao"
        aria-haspopup="dialog"
        aria-label={`${rotulo} de ${nome}`}
        onClick={() => setAberto("menu")}
      >
        <span aria-hidden="true">•••</span>
      </button>

      {/* Portal: montada dentro da linha da lista, a folha ficava presa no
          empilhamento da linha e as linhas seguintes eram pintadas por cima. */}
      {aberto === "menu" ? createPortal(
        <Sheet titulo={nome} aoFechar={fechar}>
          <div className="lista-secoes acoes-cliente-menu">
            <Link href={`/clientes/${id}`} onClick={fechar}>
              <span>Abrir área de trabalho</span>
            </Link>
            <Link href={`/clientes/${id}?section=registration`} onClick={fechar}>
              <span>Editar cadastro</span>
            </Link>
            <button type="button" onClick={mudarStatus} disabled={ocupado}>
              <span>{arquivado ? "Reativar cliente" : "Arquivar cliente"}</span>
              <small>{arquivado ? "Volta para a lista" : "Sai da lista; dá para reativar"}</small>
            </button>
            {podeExcluir ? (
              <button type="button" className="acao-perigo" onClick={() => setAberto("excluir")} disabled={ocupado}>
                <span>Excluir definitivamente</span>
              </button>
            ) : null}
          </div>
          {erro ? <p className="inline-feedback feedback-error">{erro}</p> : null}
        </Sheet>,
        document.body,
      ) : null}

      {aberto === "excluir" ? createPortal(
        <Sheet
          titulo="Excluir cliente"
          aoFechar={fechar}
          rodape={
            <>
              <button
                type="button"
                className="primary-button perigo"
                onClick={excluir}
                disabled={ocupado || !confere}
              >
                {ocupado ? "Excluindo…" : "Excluir definitivamente"}
              </button>
              <button type="button" className="secondary-button" onClick={fechar} disabled={ocupado}>
                Cancelar
              </button>
            </>
          }
        >
          <div className="confirmacao">
            <p className="confirmacao-alvo">{nome}</p>
            <p>
              Apaga o cliente e tudo o que é só dele: cadastro, contatos, endereços, arquivos,
              palavras-chave, etapas de implantação e projetos. Cliente com assinatura, domínio,
              marca ou acesso ao portal não pode ser excluído; arquive.
            </p>
            <p className="confirmacao-reversivel">Não dá para desfazer.</p>
            <label className="campo-confirmacao">
              <span>
                Digite <strong>{nome}</strong> para confirmar
              </span>
              <input
                value={confirmacao}
                onChange={(evento) => setConfirmacao(evento.target.value)}
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
              />
            </label>
            {erro ? <p className="inline-feedback feedback-error">{erro}</p> : null}
          </div>
        </Sheet>,
        document.body,
      ) : null}
    </>
  );
}

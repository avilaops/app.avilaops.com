"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Confirmacao from "@/components/sistema/Confirmacao";
import { useConfirmacaoDeSenha } from "@/components/sistema/ConfirmarSenha";
import type { SituacaoDaIsencao } from "@/lib/lojas-plataforma";

/**
 * Marcar ou tirar a isenção de mensalidade de uma loja.
 *
 * A isenção não é cobrança: é a plataforma deixando de avaliar a loja pela
 * régua de inadimplência. Por isso tirar a isenção NÃO cobra ninguém — não
 * cria mensalidade, não gera fatura, não muda o status da loja. O que muda é
 * que ela volta a ser avaliada, e a tela diz, antes do clique, o que a régua
 * concluiria hoje. Pede a senha de novo, como os outros atos de cobrança.
 */
export default function ControleDeIsencao({ slug, nome, situacao }: { slug: string; nome: string; situacao: SituacaoDaIsencao }) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [recado, setRecado] = useState<string | null>(null);
  const { executar, folha } = useConfirmacaoDeSenha();

  const vaiFicarIsenta = !situacao.isenta;

  async function aplicar() {
    setEnviando(true);
    setErro(null);
    setRecado(null);
    try {
      const resposta = await executar(() =>
        fetch(`/api/lojas/${encodeURIComponent(slug)}/isencao`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          // Quem confirmou leu a consequência escrita na própria confirmação.
          body: JSON.stringify({ isenta: vaiFicarIsenta, cienteDaRegua: !vaiFicarIsenta }),
        }),
      );
      const dados = (await resposta.json().catch(() => ({}))) as { erro?: string; mudou?: boolean };
      if (!resposta.ok) throw new Error(dados.erro ?? "Não consegui alterar a isenção.");
      // Só depois de a plataforma confirmar: a tela relê o estado em vez de presumir.
      setRecado(vaiFicarIsenta ? "Loja marcada como isenta." : "Isenção retirada. Nenhuma cobrança foi criada.");
      setConfirmando(false);
      router.refresh();
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : "Não consegui alterar a isenção.");
      setConfirmando(false);
    } finally {
      setEnviando(false);
    }
  }

  const consequencia = vaiFicarIsenta
    ? "A plataforma deixa de avaliar esta loja pela régua de inadimplência e bloqueia a criação de mensalidade por aqui. Se ela já tem mensalidade no Mercado Pago, a mensalidade continua cobrando: isenção não cancela nada."
    : situacao.seNaoFosseIsenta
      ? `Sem a isenção, esta loja cai na régua de inadimplência hoje: ${situacao.seNaoFosseIsenta}. ${
          situacao.suspensaoAutomatica
            ? "A suspensão automática está ligada: ela seria suspensa na próxima rodada."
            : "A suspensão automática está desligada: ela só passa a aparecer na lista de quem seria suspensa, e continua no ar."
        } Nenhuma cobrança é criada: para cobrar, crie a mensalidade depois.`
      : "A loja volta a ser avaliada pela régua de inadimplência, que hoje não a reprova. Nenhuma cobrança é criada: para cobrar, crie a mensalidade depois.";

  return (
    <div className="isencao">
      <p>
        <strong>Isenção de mensalidade:</strong> {situacao.isenta ? "isenta" : "não isenta"}.{" "}
        {situacao.isenta
          ? situacao.seNaoFosseIsenta
            ? `Sem ela, a régua diria: ${situacao.seNaoFosseIsenta}.`
            : "Sem ela, a régua não reprovaria esta loja hoje."
          : "A loja é avaliada pela régua de inadimplência."}
      </p>
      <p>
        <button type="button" className="secondary-button" disabled={enviando} onClick={() => setConfirmando(true)}>
          {situacao.isenta ? "Tirar a isenção" : "Marcar como isenta"}
        </button>
      </p>
      {recado ? <p className="aviso-ok">{recado}</p> : null}
      {erro ? <p className="aviso-erro">{erro}</p> : null}

      {confirmando ? (
        <Confirmacao
          titulo={vaiFicarIsenta ? "Marcar como isenta" : "Tirar a isenção"}
          descricao={consequencia}
          alvo={nome}
          reversivel
          rotuloConfirmar={vaiFicarIsenta ? "Marcar como isenta" : "Tirar a isenção"}
          confirmando={enviando}
          aoConfirmar={() => void aplicar()}
          aoCancelar={() => setConfirmando(false)}
        />
      ) : null}
      {folha}
    </div>
  );
}

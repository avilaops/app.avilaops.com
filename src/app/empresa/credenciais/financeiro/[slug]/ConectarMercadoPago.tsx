"use client";

import { useState } from "react";
import { useConfirmacaoDeSenha } from "@/components/sistema/ConfirmarSenha";
import { Grupo } from "@/components/sistema/Lista";
import { formatDateTime } from "@/lib/format";
import type { EstadoDaConexao } from "@/lib/mercadopago-oauth";

/**
 * O botão de conectar a conta do Mercado Pago, e o estado da conexão.
 *
 * Fica acima dos campos porque, conectando, o Access Token deixa de ser
 * colado. Mas não esconde o que continua manual: a tela diz que a assinatura
 * do webhook não vem por aqui, e mostra o endereço de retorno que precisa
 * estar cadastrado na aplicação — sem ele o Mercado Pago recusa a volta, com
 * uma mensagem que não diz qual endereço esperava.
 */
export default function ConectarMercadoPago({
  estado,
  retorno,
  conectouAgora,
  erroDaVolta,
}: {
  estado: EstadoDaConexao;
  retorno: string;
  conectouAgora: boolean;
  erroDaVolta: string | null;
}) {
  const [indo, setIndo] = useState(false);
  const [erro, setErro] = useState<string | null>(erroDaVolta);
  const { executar, folha } = useConfirmacaoDeSenha();

  async function conectar() {
    setIndo(true);
    setErro(null);
    try {
      const resposta = await executar(() => fetch("/api/empresa/mercadopago/oauth/start", { method: "POST" }));
      const dados = (await resposta.json().catch(() => ({}))) as { erro?: string; url?: string };
      if (!resposta.ok || !dados.url) throw new Error(dados.erro ?? "Não consegui começar a conexão.");
      // Sai do painel: a autorização acontece na tela do próprio Mercado Pago.
      window.location.assign(dados.url);
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : "Não consegui começar a conexão.");
      setIndo(false);
    }
  }

  return (
    <Grupo titulo="Conectar a conta">
      <div className="aviso-financeira">
        {estado.conectada ? (
          <>
            <strong>Conectada por OAuth</strong>
            <p>
              Conta {estado.userId ?? "sem identificação"} do Mercado Pago.
              {estado.expiraEm
                ? ` O token vence em ${formatDateTime(estado.expiraEm)} e é renovado sozinho antes disso.`
                : ""}
            </p>
          </>
        ) : estado.substituidaAMao ? (
          <>
            <strong>Token trocado à mão</strong>
            <p>
              A conta já foi conectada por OAuth, mas o Access Token em uso foi colado depois e é outro. Ele não
              é renovado sozinho. Conectar de novo volta a usar o token da conexão.
            </p>
          </>
        ) : (
          <>
            <strong>Em vez de colar o Access Token</strong>
            <p>
              Você autoriza na tela do Mercado Pago, que mostra qual conta está logada, e o token passa a ser
              renovado sozinho. A assinatura secreta do webhook não vem por aqui: continua sendo o campo abaixo.
            </p>
          </>
        )}

        {estado.aplicacaoPronta ? null : (
          <p>
            Falta guardar, nos campos abaixo: {estado.faltam.join(" e ")} da aplicação.
          </p>
        )}

        <p>
          Endereço de retorno a cadastrar na aplicação do Mercado Pago (URLs de redirecionamento):{" "}
          <code>{retorno}</code>
        </p>

        <p>
          <button
            type="button"
            className="primary-button"
            onClick={conectar}
            disabled={indo || !estado.aplicacaoPronta}
          >
            {indo ? "Abrindo o Mercado Pago…" : estado.conectada ? "Conectar de novo" : "Conectar com Mercado Pago"}
          </button>
        </p>

        {conectouAgora && !erro ? <p className="aviso-ok">Conta conectada. O Access Token foi guardado.</p> : null}
        {erro ? <p className="aviso-erro">{erro}</p> : null}
      </div>
      {folha}
    </Grupo>
  );
}

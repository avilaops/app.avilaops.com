"use client";

import { useEffect, useState } from "react";
import { idDoCampo } from "@/app/empresa/credenciais/financeiro/[slug]/FormularioDaFinanceira";
import { useConfirmacaoDeSenha } from "@/components/sistema/ConfirmarSenha";
import { Grupo, LinhaBotao } from "@/components/sistema/Lista";
import { formatDateTime } from "@/lib/format";
import type { EstadoDaConexao } from "@/lib/mercadopago-oauth";

/** Leva o cursor ao campo de uma chave, no formulário logo abaixo. */
function irParaOCampo(chave: string) {
  const campo = document.getElementById(idDoCampo(chave));
  if (!campo) return;
  campo.scrollIntoView({ behavior: "smooth", block: "center" });
  campo.focus({ preventScroll: true });
}

export type SituacaoDasChaves = {
  /** Máscara do Access Token guardado, ou nulo se não há. */
  token: string | null;
  webhook: boolean;
};

/**
 * A ficha do Mercado Pago em três perguntas, antes de qualquer campo: dá para
 * cobrar? a baixa sai sozinha? o token se renova?
 *
 * Existe porque a primeira versão desta tela respondia isso em seis campos e
 * três parágrafos, e o dono precisou perguntar por que o botão de conectar não
 * clicava. Cada linha diz o estado e, tocada, leva ao campo que falta.
 */
export function SituacaoMercadoPago({
  chaves,
  conexao,
}: {
  chaves: SituacaoDasChaves;
  conexao: EstadoDaConexao;
}) {
  return (
    <Grupo titulo="Situação">
      <LinhaBotao
        titulo="Cobrar"
        descricao={chaves.token ? `Access Token guardado (${chaves.token})` : "Falta o Access Token"}
        icone="config"
        tom={chaves.token ? "azul" : "vermelho"}
        valor={chaves.token ? "Pronto" : "Falta"}
        aoClicar={() => irParaOCampo("MP_ACCESS_TOKEN")}
      />
      <LinhaBotao
        titulo="Dar baixa sozinho"
        descricao={
          chaves.webhook
            ? "Assinatura do webhook guardada"
            : "Parado: falta a assinatura secreta do webhook"
        }
        icone="config"
        tom={chaves.webhook ? "azul" : "vermelho"}
        valor={chaves.webhook ? "Pronto" : "Falta"}
        aoClicar={() => irParaOCampo("MP_WEBHOOK_SECRET")}
      />
      <LinhaBotao
        titulo="Renovar o token sozinho"
        descricao={
          conexao.conectada
            ? `Conta ${conexao.userId ?? "sem identificação"} conectada`
            : conexao.substituidaAMao
              ? "Token trocado à mão depois da conexão"
              : "Opcional: conecte a conta, no fim da página"
        }
        icone="config"
        tom={conexao.conectada ? "azul" : conexao.substituidaAMao ? "amarelo" : "neutro"}
        valor={conexao.conectada ? "Ligado" : "Desligado"}
        aoClicar={() => document.getElementById("conectar-mercado-pago")?.scrollIntoView({ behavior: "smooth" })}
      />
    </Grupo>
  );
}

/**
 * Conectar a conta do Mercado Pago, em três passos numerados.
 *
 * O botão só funciona com os dois primeiros feitos, e a tela diz qual falta ao
 * lado dele — botão apagado sem motivo à vista parece defeito. O que continua
 * manual também está escrito: a assinatura do webhook não vem por aqui.
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
  const [copiado, setCopiado] = useState(false);
  const { executar, folha } = useConfirmacaoDeSenha();

  // O recado da volta vem na query. Lido uma vez, sai do endereço: senão ele
  // reaparece a cada recarga e em qualquer favorito feito nesta tela.
  useEffect(() => {
    if (!conectouAgora && !erroDaVolta) return;
    window.history.replaceState(null, "", window.location.pathname);
  }, [conectouAgora, erroDaVolta]);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(retorno);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      // Sem permissão de área de transferência o endereço segue na tela, selecionável.
    }
  }

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

  const faltaId = estado.faltam.includes("Client ID");
  const faltaSecret = estado.faltam.includes("Client Secret");

  return (
    <Grupo titulo="Conectar a conta (opcional)">
      <div className="conexao" id="conectar-mercado-pago">
        <p className="conexao-resumo">
          {estado.conectada
            ? `Conectada: conta ${estado.userId ?? "sem identificação"}.${
                estado.expiraEm ? ` O token vence em ${formatDateTime(estado.expiraEm)} e é renovado antes disso.` : ""
              }`
            : estado.substituidaAMao
              ? "A conta foi conectada, mas o Access Token em uso foi colado depois e é outro: ele não é renovado sozinho. Conectar de novo volta a usar o da conexão."
              : "Em vez de colar o Access Token, você autoriza na tela do Mercado Pago e o token passa a ser renovado sozinho. A assinatura do webhook não vem por aqui."}
        </p>

        <ol className="conexao-passos">
          <li>
            <span className="conexao-numero">1</span>
            <div>
              <strong>Cadastre o endereço de retorno na aplicação do Mercado Pago</strong>
              <small>Painel de desenvolvedor → sua aplicação → URLs de redirecionamento.</small>
              <span className="conexao-endereco">
                <code>{retorno}</code>
                <button type="button" className="secondary-button" onClick={() => void copiar()}>
                  {copiado ? "Copiado" : "Copiar"}
                </button>
              </span>
            </div>
          </li>
          <li>
            <span className={estado.aplicacaoPronta ? "conexao-numero conexao-numero-ok" : "conexao-numero"}>
              {estado.aplicacaoPronta ? "✓" : "2"}
            </span>
            <div>
              <strong>Guarde o Client ID e o Client Secret da aplicação</strong>
              <small>
                Client ID: {faltaId ? "falta" : "guardado"} · Client Secret: {faltaSecret ? "falta" : "guardado"}
              </small>
              {estado.aplicacaoPronta ? null : (
                <span>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => irParaOCampo(faltaId ? "MP_CLIENT_ID" : "MP_CLIENT_SECRET")}
                  >
                    Ir para o campo que falta
                  </button>
                </span>
              )}
            </div>
          </li>
          <li>
            <span className={estado.conectada ? "conexao-numero conexao-numero-ok" : "conexao-numero"}>
              {estado.conectada ? "✓" : "3"}
            </span>
            <div>
              <strong>Autorize na tela do Mercado Pago</strong>
              <small>
                {estado.aplicacaoPronta
                  ? "Pede a sua senha do painel e abre o Mercado Pago, que mostra qual conta está logada."
                  : "Disponível depois do passo 2."}
              </small>
              <span>
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => void conectar()}
                  disabled={indo || !estado.aplicacaoPronta}
                >
                  {indo ? "Abrindo o Mercado Pago…" : estado.conectada ? "Conectar de novo" : "Conectar com Mercado Pago"}
                </button>
              </span>
            </div>
          </li>
        </ol>

        {conectouAgora && !erro ? <p className="aviso-ok">Conta conectada. O Access Token foi guardado.</p> : null}
        {erro ? <p className="aviso-erro">{erro}</p> : null}
      </div>
      {folha}
    </Grupo>
  );
}

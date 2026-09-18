"use client";

import Sheet from "@/components/ui/Sheet";

/**
 * Confirmação de ação destrutiva, no lugar do `window.confirm`.
 *
 * O diálogo diz três coisas que o alerta do navegador não dizia: o que vai
 * acontecer, sobre qual item, e se dá para desfazer. Monta só quando aberto —
 * quem chama guarda o estado, como no resto do app.
 */
export default function Confirmacao({
  titulo,
  descricao,
  alvo,
  reversivel,
  rotuloConfirmar = "Confirmar",
  confirmando = false,
  aoConfirmar,
  aoCancelar,
}: {
  titulo: string;
  descricao: string;
  /** Nome do que será afetado: o cliente, o domínio, a vaga. */
  alvo?: string;
  reversivel?: boolean;
  rotuloConfirmar?: string;
  confirmando?: boolean;
  aoConfirmar: () => void;
  aoCancelar: () => void;
}) {
  return (
    <Sheet
      titulo={titulo}
      aoFechar={aoCancelar}
      rodape={
        <>
          <button type="button" className="primary-button perigo" onClick={aoConfirmar} disabled={confirmando}>
            {confirmando ? "Aplicando…" : rotuloConfirmar}
          </button>
          <button type="button" className="secondary-button" onClick={aoCancelar} disabled={confirmando}>
            Cancelar
          </button>
        </>
      }
    >
      <div className="confirmacao">
        {alvo ? <p className="confirmacao-alvo">{alvo}</p> : null}
        <p>{descricao}</p>
        <p className="confirmacao-reversivel">
          {reversivel ? "Dá para refazer depois." : "Não dá para desfazer."}
        </p>
      </div>
    </Sheet>
  );
}

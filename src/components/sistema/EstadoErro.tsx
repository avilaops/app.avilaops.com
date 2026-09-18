"use client";

/**
 * Erro de área: mensagem humana, detalhe técnico recolhido e um botão que
 * tenta de novo. O `error.tsx` do App Router entrega `reset`, que remonta o
 * segmento sem recarregar a página inteira.
 */
export default function EstadoErro({
  titulo = "Não foi possível carregar esta tela",
  descricao = "O erro foi registrado. Você pode tentar de novo; se continuar, vale olhar o log do servidor.",
  erro,
  aoTentarDeNovo,
}: {
  titulo?: string;
  descricao?: string;
  erro?: Error & { digest?: string };
  aoTentarDeNovo?: () => void;
}) {
  return (
    <div className="estado-erro" role="alert">
      <h2>{titulo}</h2>
      <p>{descricao}</p>
      {aoTentarDeNovo ? (
        <button type="button" className="primary-button" onClick={aoTentarDeNovo}>
          Tentar de novo
        </button>
      ) : null}
      {erro ? (
        <details>
          <summary>Detalhes técnicos</summary>
          <pre>{erro.digest ? `digest ${erro.digest}\n` : ""}{erro.message}</pre>
        </details>
      ) : null}
    </div>
  );
}

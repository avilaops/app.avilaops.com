"use client";

import EstadoErro from "@/components/sistema/EstadoErro";

export default function Erro({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <EstadoErro
      titulo="Não foi possível abrir as lojas"
      descricao="A leitura da plataforma falhou antes de a tela montar. Tentar de novo costuma resolver; se insistir, o log do servidor diz o motivo."
      erro={error}
      aoTentarDeNovo={reset}
    />
  );
}

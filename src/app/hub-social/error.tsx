"use client";

import EstadoErro from "@/components/sistema/EstadoErro";

export default function Erro({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <EstadoErro erro={error} aoTentarDeNovo={reset} />;
}

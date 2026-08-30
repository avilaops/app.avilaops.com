"use client";

import BotaoTema from "@/lib/tema-noturno/react";

/**
 * O tema segue o relógio (18h escurece, 6h clareia). Este botão é a saída para
 * quem não quer o automático agora: a escolha vale até a próxima virada, e
 * Alt+clique devolve o controle ao horário.
 */
export default function ThemeToggle({
  className = "theme-toggle",
}: {
  className?: string;
}) {
  return <BotaoTema className={className} />;
}

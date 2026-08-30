import type { SVGProps } from "react";

export type NomeIcone =
  | "inicio"
  | "clientes"
  | "financeiro"
  | "entregas"
  | "mais"
  | "chevron"
  | "fechar"
  | "adicionar";

/*
 * Um conjunto pequeno de ícones de traço, no peso do SF Symbols. Sem
 * biblioteca: são oito desenhos, e cada dependência a mais é um build a mais
 * para quebrar. Todos herdam a cor do texto.
 */
const caminhos: Record<NomeIcone, React.ReactNode> = {
  inicio: (
    <>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" />
    </>
  ),
  clientes: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5" />
      <path d="M15.5 4.6a3.5 3.5 0 0 1 0 6.8" />
      <path d="M17 14.6c2.6.5 4.2 2.3 4.5 5.4" />
    </>
  ),
  financeiro: (
    <>
      <rect x="2.5" y="5.5" width="19" height="13" rx="2.5" />
      <circle cx="12" cy="12" r="3" />
      <path d="M6 9v6M18 9v6" />
    </>
  ),
  entregas: (
    <>
      <path d="m3.5 7.5 8.5-4 8.5 4-8.5 4-8.5-4Z" />
      <path d="M3.5 7.5v9l8.5 4 8.5-4v-9" />
      <path d="M12 11.5v9" />
    </>
  ),
  mais: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="8" cy="12" r="0.9" fill="currentColor" />
      <circle cx="12" cy="12" r="0.9" fill="currentColor" />
      <circle cx="16" cy="12" r="0.9" fill="currentColor" />
    </>
  ),
  chevron: <path d="m9 5 7 7-7 7" />,
  fechar: <path d="M6 6l12 12M18 6 6 18" />,
  adicionar: <path d="M12 5v14M5 12h14" />,
};

export function Icone({
  nome,
  tamanho = 20,
  className,
  ...resto
}: { nome: NomeIcone; tamanho?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
      {...resto}
    >
      {caminhos[nome]}
    </svg>
  );
}

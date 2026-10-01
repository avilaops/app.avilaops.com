import type { SVGProps } from "react";

export type NomeIcone =
  | "inicio"
  | "clientes"
  | "financeiro"
  | "entregas"
  | "mais"
  | "chevron"
  | "fechar"
  | "adicionar"
  | "voltar"
  | "busca"
  | "operacao"
  | "casa"
  | "hub"
  | "infra"
  | "fiscal"
  | "credito"
  | "config"
  | "seo"
  | "dominios"
  | "google"
  | "meta"
  | "whatsapp"
  | "newsletter"
  | "estudio"
  | "icones"
  | "vagas"
  | "lojas"
  | "automacoes"
  | "saude"
  | "telas";

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
  voltar: <path d="m15 5-7 7 7 7" />,
  busca: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </>
  ),
  operacao: (
    <>
      <path d="M4 19V9.5M10 19V5M16 19v-6M22 19H2" />
    </>
  ),
  casa: (
    <>
      <path d="M4 10.5 12 4l8 6.5" />
      <path d="M6 9.8V20h12V9.8" />
      <path d="M10 20v-5h4v5" />
    </>
  ),
  hub: (
    <>
      <circle cx="12" cy="6" r="2.6" />
      <circle cx="5.5" cy="17" r="2.6" />
      <circle cx="18.5" cy="17" r="2.6" />
      <path d="M10.4 8.2 7.1 14.7M13.6 8.2l3.3 6.5M8.1 17h7.8" />
    </>
  ),
  infra: (
    <>
      <rect x="3" y="4" width="18" height="6" rx="2" />
      <rect x="3" y="14" width="18" height="6" rx="2" />
      <path d="M7 7h.01M7 17h.01" />
    </>
  ),
  fiscal: (
    <>
      <path d="M6 3h9l4 4v14H6z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6M9 17h4" />
    </>
  ),
  credito: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v10M9.5 9.5h4a1.8 1.8 0 0 1 0 3.6h-3a1.8 1.8 0 0 0 0 3.6h4" />
    </>
  ),
  config: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 14a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V20a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H4a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H10a1.6 1.6 0 0 0 1-1.5V4a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V10a1.6 1.6 0 0 0 1.5 1H20a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z" />
    </>
  ),
  seo: (
    <>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="m15 15 5 5" />
      <path d="M7.5 11.5 10 9l2 2.5L13.5 8" />
    </>
  ),
  dominios: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.6 3.8 5.7 3.8 9S14.5 18.4 12 21c-2.5-2.6-3.8-5.7-3.8-9S9.5 5.6 12 3Z" />
    </>
  ),
  google: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 12h8.5" />
      <path d="M12 12 7.8 19.4M12 12 7.8 4.6" />
    </>
  ),
  meta: (
    <>
      <path d="M3 15c0-4.5 2-8 4.7-8 2.6 0 3.7 3 4.3 5.5.6-2.5 1.7-5.5 4.3-5.5C19 7 21 10.5 21 15c0 2.2-1.1 3.6-2.8 3.6-2.4 0-4-3.1-6.2-8.1" />
    </>
  ),
  whatsapp: (
    <>
      <path d="M20 12a8 8 0 0 1-11.8 7L4 20l1.1-4A8 8 0 1 1 20 12Z" />
      <path d="M9 9.5c.4 2.4 3.1 5.1 5.5 5.5l1-1.4 1.8.9c-.3 1-1.2 1.6-2.3 1.5-3-.3-5.9-3.2-6.2-6.2-.1-1.1.5-2 1.5-2.3l.9 1.8-1.2 1" />
    </>
  ),
  newsletter: (
    <>
      <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
      <path d="m4 7 8 5.5L20 7" />
    </>
  ),
  estudio: (
    <>
      <path d="M12 3a9 9 0 1 0 0 18c1.3 0 2-.8 2-1.8 0-1.5-1.3-1.7-1.3-2.9 0-.8.7-1.3 1.7-1.3H16a5 5 0 0 0 5-5c0-4-4-7-9-7Z" />
      <circle cx="8" cy="11" r="1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="7.8" r="1" fill="currentColor" stroke="none" />
      <circle cx="16" cy="10" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  /** O squircle que iOS e Android desenham em volta do ícone do atalho. */
  icones: (
    <>
      <path d="M3 12c0-4.2 0-6.4 1.3-7.7C5.6 3 7.8 3 12 3s6.4 0 7.7 1.3C21 5.6 21 7.8 21 12s0 6.4-1.3 7.7C18.4 21 16.2 21 12 21s-6.4 0-7.7-1.3C3 18.4 3 16.2 3 12Z" />
      <circle cx="12" cy="12" r="3.2" />
    </>
  ),
  vagas: (
    <>
      <rect x="3" y="7" width="18" height="13" rx="2.5" />
      <path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7" />
      <path d="M3 12h18" />
    </>
  ),
  // Vitrine: o toldo em três ondas sobre a fachada com a porta.
  lojas: (
    <>
      <path d="M3.5 9.5 5 4h14l1.5 5.5" />
      <path d="M3.5 9.5a2.8 2.8 0 0 0 5.5 0 2.8 2.8 0 0 0 5.5 0 2.8 2.8 0 0 0 5.5 0" />
      <path d="M5 11.8V20h14v-8.2" />
      <path d="M10 20v-4.5h4V20" />
    </>
  ),
  automacoes: <path d="M13 3 5 13.5h5.5L11 21l8-10.5h-5.5L13 3Z" />,
  saude: <path d="M3 12.5h4l2.5-6 3.5 12 2.5-6h5.5" />,
  // Tela de parede com o pé embaixo: o que a Ávila TV entrega é a tela do
  // salão, não o televisor da sala.
  telas: (
    <>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M9 20h6M12 16v4" />
    </>
  ),
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

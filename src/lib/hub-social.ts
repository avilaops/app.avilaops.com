import type { SecaoApp } from "@/lib/navegacao";

export type CanalHubSocial = {
  chave: string;
  href: string;
  label: string;
  section: SecaoApp;
};

/** Os sete canais, na ordem das abas. `navegacao.ts` monta o grupo do menu daqui. */
export const canaisHubSocial: readonly CanalHubSocial[] = [
  { chave: "seo", href: "/hub-social/seo", label: "SEO", section: "seo" },
  { chave: "dominios", href: "/hub-social/dominios", label: "Domínios", section: "domains" },
  { chave: "google", href: "/hub-social/google", label: "Google", section: "google-suite" },
  { chave: "meta", href: "/hub-social/meta", label: "Meta", section: "meta" },
  { chave: "whatsapp", href: "/hub-social/whatsapp", label: "WhatsApp", section: "whatsapp" },
  { chave: "newsletter", href: "/hub-social/newsletter", label: "Newsletter", section: "newsletter" },
  { chave: "estudio", href: "/hub-social/estudio", label: "Estúdio", section: "estudio" },
];

export function canalDoPathname(pathname: string): CanalHubSocial | null {
  return (
    canaisHubSocial.find(
      (canal) => pathname === canal.href || pathname.startsWith(`${canal.href}/`),
    ) ?? null
  );
}

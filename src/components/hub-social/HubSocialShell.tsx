"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import AppShell from "@/components/AppShell";
import AbasHubSocial from "@/components/hub-social/AbasHubSocial";
import { canalDoPathname } from "@/lib/hub-social";

/**
 * Um AppShell para as sete telas. O layout (servidor) não sabe o pathname;
 * este wrapper sabe, e é dele que sai qual item do menu acende e qual aba
 * está ativa.
 */
export default function HubSocialShell({
  adminName,
  papel,
  children,
}: {
  adminName: string;
  papel: string;
  children: ReactNode;
}) {
  const canal = canalDoPathname(usePathname() ?? "");
  return (
    <AppShell adminName={adminName} papel={papel} section={canal?.section ?? "seo"}>
      <AbasHubSocial ativo={canal?.chave ?? null} />
      {children}
    </AppShell>
  );
}

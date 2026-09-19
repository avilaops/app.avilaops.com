import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import AppShell from "@/components/AppShell";
import { getAdmin } from "@/lib/auth";

/**
 * A moldura sai das páginas e vem para cá para o `loading.tsx` aparecer dentro
 * dela: esqueleto sem a barra de abas é um piscar de tela em branco a cada
 * toque. Mesma estrutura do Hub Social.
 *
 * Cada página confere o papel de novo — layout não roda na navegação entre
 * irmãs, então ele sozinho não protege nada.
 */
export default async function LojasLayout({ children }: { children: ReactNode }) {
  const admin = await getAdmin();
  if (!admin) redirect("/login");
  return (
    <AppShell adminName={admin.nome} papel={admin.role} section="lojas">
      {children}
    </AppShell>
  );
}

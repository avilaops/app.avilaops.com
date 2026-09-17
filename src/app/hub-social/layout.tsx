import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import HubSocialShell from "@/components/hub-social/HubSocialShell";
import { getAdmin } from "@/lib/auth";

// Cada página confere o papel de novo: layout não roda na navegação entre irmãs.
export default async function HubSocialLayout({ children }: { children: ReactNode }) {
  const admin = await getAdmin();
  if (!admin) redirect("/login");
  return (
    <HubSocialShell adminName={admin.nome} papel={admin.role}>
      {children}
    </HubSocialShell>
  );
}

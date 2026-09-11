import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import CredenciaisN8n from "@/components/CredenciaisN8n";
import { ehDono, getAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AutomacoesPage() {
  const admin = await getAdmin();
  if (!admin) redirect("/login");
  // Chave de terceiro é do dono; o sócio nem vê o item no menu.
  if (!ehDono(admin.role)) redirect("/operacao");

  return (
    <AppShell adminName={admin.nome} papel={admin.role} section="automacoes">
      <header className="page-header">
        <div>
          <h1>Automações</h1>
          <p>Cofre do n8n. O que falta aparece primeiro; toque, cole o valor, e os fluxos são religados sozinhos.</p>
        </div>
      </header>
      <CredenciaisN8n />
    </AppShell>
  );
}

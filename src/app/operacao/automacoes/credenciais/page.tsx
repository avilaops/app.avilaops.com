import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import CredenciaisN8n from "@/components/CredenciaisN8n";
import CabecalhoTela from "@/components/sistema/CabecalhoTela";
import { ehDono, getAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** O cofre do n8n, que antes ocupava a tela inteira de "Automações". */
export default async function CredenciaisN8nPage() {
  const admin = await getAdmin();
  if (!admin) redirect("/login");
  if (!ehDono(admin.role)) redirect("/operacao");

  return (
    <AppShell adminName={admin.nome} papel={admin.role} section="automacoes">
      <CabecalhoTela
        titulo="Credenciais do n8n"
        descricao="O que falta aparece primeiro; toque, cole o valor, e os fluxos são religados sozinhos."
        icone="config"
        voltar={{ href: "/operacao/automacoes", rotulo: "Voltar para Automações" }}
      />
      <CredenciaisN8n />
    </AppShell>
  );
}

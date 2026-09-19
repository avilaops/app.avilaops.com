import Link from "next/link";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import CabecalhoTela from "@/components/sistema/CabecalhoTela";
import { ehDono, getAdmin } from "@/lib/auth";
import { listarCredenciais } from "@/lib/credenciais";
import CofreClient from "./CofreClient";

export const dynamic = "force-dynamic";

/**
 * Cofre de credenciais da plataforma.
 *
 * Substitui a prática de copiar `META_APP_SECRET` e companhia em doze arquivos
 * `.env` pelo parque. Ver `docs/inventario-chaves-integracoes.md`.
 */
export default async function CredenciaisPage() {
  const admin = await getAdmin();
  if (!admin) redirect("/login");
  // Segredo é do dono. Nem o sócio entra: `ehDaCasa()` não basta aqui.
  if (!ehDono(admin.role)) redirect("/operacao");

  const credenciais = await listarCredenciais();

  return (
    <AppShell adminName={admin.nome} section="credenciais" papel={admin.role}>
      <CabecalhoTela
        titulo="Cofre de credenciais"
        descricao="Segredos da plataforma, cifrados no banco. O token de cada cliente continua na conexão da organização."
        voltar={{ href: "/mais/infraestrutura", rotulo: "Voltar para Infraestrutura" }}
        icone="config"
        tom="azul"
        acoes={
          <Link href="/hub-social/meta" className="secondary-button">
            Hub Social
          </Link>
        }
      />

      <CofreClient credenciaisIniciais={credenciais} />
    </AppShell>
  );
}

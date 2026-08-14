import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import ServicePlansManager from "@/components/ServicePlansManager";
import { getAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function ServicePlansPage() {
  const admin = await getAdmin();
  if (!admin) redirect("/login");

  const plans = await prisma.servicePlan.findMany({
    orderBy: [{ serviceType: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
  });

  return (
    <AppShell adminName={admin.nome} section="services">
      <header className="page-header">
        <div>
          <span className="eyebrow">Operação · Catálogo comercial</span>
          <h1>Planos e preços administráveis.</h1>
          <p>
            Controle domínios, catálogos, redes sociais, e-mail profissional,
            identidade visual e loja online sem editar código.
          </p>
        </div>
      </header>

      <ServicePlansManager plans={JSON.parse(JSON.stringify(plans))} />
    </AppShell>
  );
}

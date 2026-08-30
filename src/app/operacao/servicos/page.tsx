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
    <AppShell adminName={admin.nome} papel={admin.role} section="services">
      <header className="page-header">
        <div>
          <h1>Catálogo de serviços</h1>
          <p>Planos e preços editáveis, sem mexer em código.</p>
        </div>
      </header>

      <ServicePlansManager plans={JSON.parse(JSON.stringify(plans))} />
    </AppShell>
  );
}

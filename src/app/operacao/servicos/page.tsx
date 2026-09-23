import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import CabecalhoTela from "@/components/sistema/CabecalhoTela";
import { contextoDaSecao } from "@/lib/navegacao";
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
      <CabecalhoTela
        titulo="Catálogo de serviços"
        descricao="Planos e preços editáveis, sem mexer em código."
        {...contextoDaSecao("services")}
      />

      <ServicePlansManager plans={JSON.parse(JSON.stringify(plans))} />
    </AppShell>
  );
}

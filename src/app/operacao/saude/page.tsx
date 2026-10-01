import { headers } from "next/headers";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import RealtimeHealthDashboard, { type MonitoringData } from "@/components/RealtimeHealthDashboard";
import CabecalhoTela from "@/components/sistema/CabecalhoTela";
import { ehDono, getAdmin } from "@/lib/auth";
import { requestIdFrom } from "@/lib/health/request";
import { monitoringSnapshot } from "@/lib/monitoring";

export const dynamic = "force-dynamic";

export default async function RealtimeHealthPage({
  searchParams,
}: {
  searchParams: Promise<{ debug?: string }>;
}) {
  const admin = await getAdmin();
  if (!admin) redirect("/login");
  const requestId = requestIdFrom(await headers());
  const initialData: MonitoringData = await monitoringSnapshot({
    requestId,
    refresh: false,
    endpoint: "render /operacao/saude (leitura do banco)",
  });
  // Inspeção (JSON, request ids, versões) só para o dono: é mapa da infraestrutura.
  const podeInspecionar = ehDono(admin.role);
  const { debug } = await searchParams;

  return (
    <AppShell adminName={admin.nome} papel={admin.role} section="health-live">
      <CabecalhoTela
        titulo="Saúde em tempo real"
        descricao="Veja antes do cliente: disponibilidade, velocidade e capacidade de toda a operação."
        voltar={{ href: "/mais/infraestrutura", rotulo: "Voltar para Infraestrutura" }}
        icone="saude"
        tom="azul"
      />
      <RealtimeHealthDashboard
        initialData={initialData}
        podeInspecionar={podeInspecionar}
        debugInicial={debug === "health"}
      />
    </AppShell>
  );
}

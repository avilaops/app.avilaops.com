import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import RealtimeHealthDashboard, { type MonitoringData } from "@/components/RealtimeHealthDashboard";
import { getAdmin } from "@/lib/auth";
import { monitoringSnapshot } from "@/lib/monitoring";

export const dynamic = "force-dynamic";

export default async function RealtimeHealthPage() {
  const admin = await getAdmin();
  if (!admin) redirect("/login");
  const initialData = await monitoringSnapshot(false) as MonitoringData;
  return <AppShell adminName={admin.nome} papel={admin.role} section="health-live">
    <header className="page-header health-page-header"><div><span className="eyebrow">CENTRAL DE CONFIABILIDADE</span><h1>Saúde em tempo real</h1><p>Veja antes do cliente: disponibilidade, velocidade e capacidade de toda a operação.</p></div></header>
    <RealtimeHealthDashboard initialData={initialData} />
  </AppShell>;
}

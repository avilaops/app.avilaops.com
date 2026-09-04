import { notFound, redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import EstudioEditor from "@/components/EstudioEditor";
import { getAdmin } from "@/lib/auth";
import { obterPeca } from "@/lib/estudio/servidor";

export const dynamic = "force-dynamic";

export default async function EstudioPecaPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdmin();
  if (!admin) redirect("/login");
  const { id } = await params;
  const peca = await obterPeca(id);
  if (!peca) notFound();
  return (
    <AppShell adminName={admin.nome} papel={admin.role} section="estudio">
      <EstudioEditor pecaInicial={peca} />
    </AppShell>
  );
}

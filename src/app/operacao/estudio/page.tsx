import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import EstudioLista from "@/components/EstudioLista";
import { getAdmin } from "@/lib/auth";
import { listarPecas } from "@/lib/estudio/servidor";

export const dynamic = "force-dynamic";

export default async function EstudioPage() {
  const admin = await getAdmin();
  if (!admin) redirect("/login");
  const pecas = await listarPecas();
  return (
    <AppShell adminName={admin.nome} papel={admin.role} section="estudio">
      <header className="page-header">
        <div>
          <h1>Estúdio</h1>
          <p>Peças de vídeo e imagem para as redes e o mural, montadas a partir dos templates da casa.</p>
        </div>
      </header>
      <EstudioLista pecas={pecas} />
    </AppShell>
  );
}

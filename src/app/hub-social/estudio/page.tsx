import { redirect } from "next/navigation";
import EstudioLista from "@/components/EstudioLista";
import { getAdmin } from "@/lib/auth";
import { listarPecas } from "@/lib/estudio/servidor";

export const dynamic = "force-dynamic";

export default async function EstudioPage() {
  const admin = await getAdmin();
  if (!admin) redirect("/login");
  const pecas = await listarPecas();
  const lidoEm = new Date().toISOString();
  return <EstudioLista pecas={pecas} lidoEm={lidoEm} />;
}

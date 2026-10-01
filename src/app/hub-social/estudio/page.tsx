import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/shadcn/button";
import EstudioLista from "@/components/EstudioLista";
import { getAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listarPecas } from "@/lib/estudio/servidor";

export const dynamic = "force-dynamic";

export default async function EstudioPage() {
  const admin = await getAdmin();
  if (!admin) redirect("/login");
  const [pecas, clientes] = await Promise.all([
    listarPecas(),
    prisma.organization.findMany({
      where: { status: { not: "ARCHIVED" } },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);
  const lidoEm = new Date().toISOString();
  return (
    <>
    <div className="page-actions"><Button asChild variant="outline"><Link href="/hub-social/estudio/publicacoes">Publicações e calendário</Link></Button></div>
    <EstudioLista
      pecas={pecas}
      clientes={clientes.map((c) => ({ id: c.id, nome: c.name }))}
      lidoEm={lidoEm}
    />
    </>
  );
}

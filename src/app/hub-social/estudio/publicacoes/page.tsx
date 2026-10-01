import { redirect } from "next/navigation";
import { getAdmin, ehDono } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listarPublicacoes } from "@/lib/publicacoes/repositorio";
import PublicacoesPainel, { type DadosPainel } from "@/components/publicacoes/PublicacoesPainel";
export const dynamic="force-dynamic";
export default async function Page() {
  const admin=await getAdmin();
  if(!admin) redirect("/login");
  const [dados,empresas]=await Promise.all([listarPublicacoes(),prisma.organization.findMany({where:{status:{not:"ARCHIVED"}},select:{id:true,name:true},orderBy:{name:"asc"}})]);
  return <PublicacoesPainel inicial={JSON.parse(JSON.stringify(dados)) as DadosPainel} empresas={empresas} dono={ehDono(admin.role)} />;
}

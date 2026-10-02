import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import CabecalhoTela from "@/components/sistema/CabecalhoTela";
import AbasDaEmpresa from "@/app/empresa/AbasDaEmpresa";
import ChavesDeApi, { type ChaveListada } from "@/app/empresa/chaves-api/ChavesDeApi";
import { ehDono, getAdmin } from "@/lib/auth";
import { ESCOPOS } from "@/lib/chaves-api";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const metadata = { title: "Chaves de API - Ávila Ops" };

/**
 * Chaves para agente e automação usarem o painel sem cookie.
 *
 * Fica na Empresa, ao lado das Credenciais, porque é concessão de acesso: só o
 * dono vê e só o dono cria.
 */
export default async function ChavesDeApiPage() {
  const admin = await getAdmin();
  if (!admin) redirect("/login");
  if (!ehDono(admin.role)) redirect("/mais");

  const chaves = await prisma.chaveDeApi.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      nome: true,
      prefixo: true,
      escopos: true,
      ultimoUsoEm: true,
      expiraEm: true,
      revogadaEm: true,
      createdAt: true,
    },
  });

  const listadas: ChaveListada[] = chaves.map((chave) => ({
    ...chave,
    ultimoUsoEm: chave.ultimoUsoEm?.toISOString() ?? null,
    expiraEm: chave.expiraEm?.toISOString() ?? null,
    revogadaEm: chave.revogadaEm?.toISOString() ?? null,
    createdAt: chave.createdAt.toISOString(),
  }));

  return (
    <AppShell adminName={admin.nome} papel={admin.role} section="menu">
      <CabecalhoTela
        titulo="Empresa"
        descricao="Chaves para agentes e automações cadastrarem no painel."
        voltar={{ href: "/mais", rotulo: "Voltar para Mais" }}
      />

      <AbasDaEmpresa ativa="chaves-api" />

      <ChavesDeApi chaves={listadas} escopos={ESCOPOS} />
    </AppShell>
  );
}

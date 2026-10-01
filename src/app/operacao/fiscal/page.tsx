import Link from "next/link";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import CabecalhoTela from "@/components/sistema/CabecalhoTela";
import { contextoDaSecao } from "@/lib/navegacao";
import { getAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import FiscalCommandCenterClient from "./FiscalCommandCenterClient";
import type { CertificadoA1Info } from "@/lib/fiscal/types";

export default async function FiscalCommandCenterPage() {
  const admin = await getAdmin();
  if (!admin) redirect("/login");

  // Busca organizações ativas e conexões de certificado A1
  const organizacoes = await prisma.organization.findMany({
    select: {
      id: true,
      name: true,
      cpfCnpj: true,
      integrationConnections: {
        where: { provider: "sefaz_certificado_a1" },
        select: {
          status: true,
          metadata: true,
        },
      },
    },
    orderBy: { name: "asc" },
  });

  const organizacoesFormatadas = organizacoes.map((org) => {
    const conexao = org.integrationConnections[0];
    const meta = (conexao?.metadata as Record<string, unknown>) || {};
    const info = (meta.info as CertificadoA1Info) || null;
    const ultNSU = (meta.ultNSU as string) || "0";
    const maxNSU = (meta.maxNSU as string) || "0";
    const ultimaSincronizacaoEm = (meta.ultimaSincronizacaoEm as string) || null;
    const bloqueadoAte = (meta.bloqueadoAte as string) || null;

    return {
      id: org.id,
      name: org.name,
      document: org.cpfCnpj,
      certificadoInfo: info,
      ultNSU,
      maxNSU,
      ultimaSincronizacaoEm,
      bloqueadoAte,
    };
  });

  return (
    <AppShell adminName={admin.nome} papel={admin.role} section="fiscal">
      <CabecalhoTela
        titulo="Notas Fiscais & SEFAZ"
        descricao="Sincronização de Certificados Digitais A1 e captura contínua de Notas Fiscais Recebidas (DF-e)."
        {...contextoDaSecao("fiscal")}
        acoes={
          <>
          <div className="page-actions">
          <Link href="/financeiro" className="secondary-button">
          Financeiro & Contas
          </Link>
          <Link href="/operacao" className="secondary-button">
          Voltar à Operação
          </Link>
          </div>
          </>
        }
      />

      <section className="operations-grid">
        <FiscalCommandCenterClient organizacoesIniciais={organizacoesFormatadas} />
      </section>
    </AppShell>
  );
}

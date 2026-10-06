import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import CabecalhoTela from "@/components/sistema/CabecalhoTela";
import { Grupo, LinhaInfo } from "@/components/sistema/Lista";
import AbasDaEmpresa from "@/app/empresa/AbasDaEmpresa";
import { ehDono, getAdmin } from "@/lib/auth";
import { contar, formatDateTime } from "@/lib/format";
import { LIMITE_DO_HISTORICO, historicoDaCasa } from "@/lib/historico-da-casa";

export const dynamic = "force-dynamic";
export const metadata = { title: "Histórico - Ávila Ops" };

/**
 * Quem mexeu na configuração da casa, do mais recente para o mais antigo.
 *
 * Fica na Empresa, e só para o dono, porque a lista conta onde estão os
 * segredos e quem os viu. O que aparece é o registro de auditoria que cada
 * rota já gravava — nada aqui é calculado nem resumido.
 */
export default async function HistoricoDaEmpresaPage() {
  const admin = await getAdmin();
  if (!admin) redirect("/login");
  if (!ehDono(admin.role)) redirect("/mais");

  const eventos = await historicoDaCasa();

  return (
    <AppShell adminName={admin.nome} papel={admin.role} section="menu">
      <CabecalhoTela
        titulo="Empresa"
        descricao="Quem alterou dados, certificado, credenciais e chaves."
        voltar={{ href: "/mais", rotulo: "Voltar para Mais" }}
      />

      <AbasDaEmpresa ativa="historico" />

      <div className="pilha">
        <Grupo
          titulo={
            eventos.length === LIMITE_DO_HISTORICO
              ? `Últimos ${LIMITE_DO_HISTORICO} registros`
              : contar(eventos.length, "registro", "registros")
          }
        >
          {eventos.length === 0 ? (
            <LinhaInfo
              titulo="Nenhum registro ainda"
              descricao="Alterações em dados fiscais, certificado, credenciais e chaves de API aparecem aqui."
            />
          ) : (
            eventos.map((evento) => (
              <LinhaInfo
                key={evento.id}
                titulo={evento.titulo}
                descricao={[evento.detalhe, `por ${evento.autor}`].filter(Boolean).join(" · ")}
                icone="config"
                tom={evento.atencao ? "amarelo" : "neutro"}
                valor={formatDateTime(evento.quando)}
              />
            ))
          )}
        </Grupo>
      </div>
    </AppShell>
  );
}

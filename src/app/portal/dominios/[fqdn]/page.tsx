import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import PainelDns from "@/components/dominios/PainelDns";
import BotaoEvidencia from "@/components/hub-social/FolhaEvidencia";
import { CartaoLista, LINHA_ITEM, formatarDataHora } from "@/components/hub-social/comum";
import EstadoVazio from "@/components/hub-social/EstadoVazio";
import ListaChaveValor from "@/components/hub-social/ListaChaveValor";
import { ehDaCasa, ehDonoDoNegocio, getSessaoPortal } from "@/lib/auth";
import { carregarDominioDoCliente, type DominioDoCliente } from "@/lib/portal-dominio";
import { cn } from "@/lib/utils";

export const metadata = { title: "Domínio - Ávila Ops" };

const ROTULO_SITUACAO: Record<DominioDoCliente["situacao"], string> = {
  ATIVO: "Ativo",
  VENCENDO: "Vencendo",
  ATENCAO: "Precisa de atenção",
  ARQUIVADO: "Encerrado",
};

// DD/MM/AAAA: vencimento sem ano é dado pela metade.
const formatoData = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" });

function prazo(dias: number | null): string | null {
  if (dias === null) return null;
  if (dias < 0) return `venceu há ${Math.abs(dias)} ${Math.abs(dias) === 1 ? "dia" : "dias"}`;
  if (dias === 0) return "vence hoje";
  return `faltam ${dias} ${dias === 1 ? "dia" : "dias"}`;
}

/**
 * Um domínio do cliente: até quando vale, de onde veio essa data, e a zona de
 * DNS para ele mesmo editar.
 *
 * O endereço leva o domínio, mas quem decide se ele aparece é a sessão: o
 * domínio de outra empresa dá a mesma página de "não encontrado" de um que não
 * existe.
 */
export default async function DominioDoClientePage({ params }: { params: Promise<{ fqdn: string }> }) {
  const sessao = await getSessaoPortal();
  if (!sessao) redirect("/login");
  if (ehDaCasa(sessao.role)) redirect("/operacao");
  if (!sessao.organizationId) redirect("/portal");

  const { fqdn } = await params;
  const dominio = await carregarDominioDoCliente(sessao.id, sessao.organizationId, decodeURIComponent(fqdn));
  if (!dominio) notFound();

  const podeEditar = ehDonoDoNegocio(sessao.role) && dominio.servicoDns !== "NENHUM" && !dominio.dns.erro;
  const textoPrazo = prazo(dominio.diasRestantes);
  const fonteVencimento =
    dominio.vencimento.fonte === "registro"
      ? `consulta ao registro do domínio em ${formatarDataHora(dominio.vencimento.lidoEm)}`
      : "cadastro da Ávila Ops, ainda sem consulta ao registro";

  return (
    <main className="portal-frame">
      <header className="portal-header">
        <div className="min-w-0">
          <Link href="/portal#dominios" className="portal-eyebrow">← Seus domínios</Link>
          <h1 className="break-all">{dominio.fqdn}</h1>
          <p className="portal-muted">
            {ROTULO_SITUACAO[dominio.situacao]}
            {textoPrazo ? ` · ${textoPrazo}` : ""}
          </p>
        </div>
      </header>

      {dominio.semRegistro ? (
        <p role="alert" className="portal-erro">
          <strong>O registro do domínio não encontrou este endereço na última consulta.</strong> Fale com o seu
          atendimento antes de qualquer alteração: o site e o e-mail podem já estar fora do ar.
        </p>
      ) : null}

      <ListaChaveValor
        titulo="Registro"
        itens={[
          { rotulo: "Domínio", valor: dominio.fqdn, mono: true, copiar: dominio.fqdn },
          {
            rotulo: "Vencimento",
            valor: dominio.expiraEm ? (
              <span className="inline-flex items-center gap-1">
                {formatoData.format(new Date(dominio.expiraEm))}
                {textoPrazo ? ` · ${textoPrazo}` : ""}
                <BotaoEvidencia
                  rotulo="De onde vem o vencimento"
                  evidencia={{
                    rotulo: "Vencimento do domínio",
                    origem:
                      dominio.vencimento.fonte === "registro"
                        ? "Consulta pública ao registro do domínio"
                        : "Cadastro da Ávila Ops",
                    formula: "dias até o vencimento contados no fuso de São Paulo",
                    lidoEm: dominio.vencimento.lidoEm,
                    bruto: { expiraEm: dominio.expiraEm, diasRestantes: dominio.diasRestantes },
                    observacao:
                      dominio.vencimento.fonte === "cadastro"
                        ? "Esta data ainda não foi conferida no registro. Ela pode estar desatualizada."
                        : undefined,
                  }}
                />
              </span>
            ) : null,
            vazio: "ainda não consultado no registro",
          },
          ...(dominio.expiraEm ? [{ rotulo: "Fonte da data", valor: fonteVencimento }] : []),
          { rotulo: "Renovação automática", valor: dominio.renovacaoAutomatica ? "ligada" : "desligada" },
        ]}
      />

      <PainelDns
        fqdn={dominio.fqdn}
        temZona={dominio.servicoDns !== "NENHUM"}
        registros={dominio.dns.registros}
        erro={dominio.dns.erro}
        podeEditar={podeEditar}
        endpoint={`/api/portal/dominios/${encodeURIComponent(dominio.fqdn)}/dns`}
        semZona="O DNS deste domínio é servido fora da Ávila Ops. Para editar a zona por aqui, fale com o seu atendimento."
        descricao={
          dominio.dns.lidoEm
            ? `${dominio.dns.registros.length} ${dominio.dns.registros.length === 1 ? "registro" : "registros"} · lidos agora do servidor, ${formatarDataHora(dominio.dns.lidoEm)}${ehDonoDoNegocio(sessao.role) ? "" : " · só o responsável pela empresa altera"}`
            : undefined
        }
      />

      <CartaoLista titulo="Alterações no DNS" descricao="Tudo que foi feito nesta zona, por você ou pela equipe.">
        {dominio.historico.length === 0 ? (
          <div className="p-4">
            <EstadoVazio compacto titulo="Nenhuma alteração registrada" />
          </div>
        ) : (
          <ul className="m-0 list-none p-0">
            {dominio.historico.map((evento, indice) => (
              <li key={`${evento.quando}-${indice}`} className={cn(LINHA_ITEM, "px-4 py-3")}>
                <span className="block text-[15px] font-medium text-foreground">{evento.acao}</span>
                {evento.resumo ? (
                  <span className="mt-0.5 block [overflow-wrap:anywhere] font-mono text-[13px] text-muted-foreground">{evento.resumo}</span>
                ) : null}
                <span className="mt-0.5 block text-[13px] text-muted-foreground">
                  {formatarDataHora(evento.quando)} · {evento.quem}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CartaoLista>
    </main>
  );
}

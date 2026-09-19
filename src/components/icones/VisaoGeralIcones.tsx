import Link from "next/link";
import BadgeStatus from "@/components/sistema/Status";
import EstadoVazio from "@/components/hub-social/EstadoVazio";
import GradeMetricas, { Metrica } from "@/components/hub-social/Metricas";
import { CartaoLista, Chevron, LINHA_ITEM, LINHA_LINK, rotuloIntegracao } from "@/components/hub-social/comum";
import { aprovados, hrefDominio, type ItemDominio } from "@/components/icones/dados";
import { PROVIDER_ICONES } from "@/lib/icones/auditoria";
import { cn } from "@/lib/utils";

/**
 * Visão geral do padrão de ícones: quantos domínios já passam inteiro e o que
 * falta em cada um. A lista é a entrega — quem abre esta tela quer saber quais
 * sites estão fora do padrão, não a média.
 */
export default function VisaoGeralIcones({
  itens,
  lidoEm,
}: {
  itens: ItemDominio[];
  lidoEm: string;
}) {
  const auditados = itens.filter((i) => i.auditoria);
  const noPadrao = auditados.filter((i) => i.auditoria?.status === "ACTIVE");
  const semAuditoria = itens.filter((i) => !i.auditoria);
  const consulta = 'prisma.domainAsset.findMany({ where: { status: { not: "ARCHIVED" } } })';

  return (
    <div className="space-y-6">
      <GradeMetricas rotulo="Resumo do padrão de ícones">
        <Metrica
          rotulo="Domínios acompanhados"
          valor={itens.length}
          evidencia={{
            rotulo: "Domínios acompanhados",
            origem: "domainAsset (Postgres)",
            funcao: consulta,
            formula: "contagem de domainAsset com status ≠ ARCHIVED",
            lidoEm,
            bruto: { dominios: itens.map((i) => i.fqdn) },
          }}
        />
        <Metrica
          rotulo="Dentro do padrão"
          valor={`${noPadrao.length}/${auditados.length || 0}`}
          tom={auditados.length && noPadrao.length === auditados.length ? "bom" : "atencao"}
          evidencia={{
            rotulo: "Dentro do padrão",
            origem: "integrationConnection (Postgres)",
            funcao: `prisma.integrationConnection.findMany({ where: { provider: "${PROVIDER_ICONES}" } })`,
            formula: "domínios auditados cuja nota ficou em 90 ou mais (estadoDoPadrao = ACTIVE)",
            lidoEm,
            bruto: {
              noPadrao: noPadrao.map((i) => i.fqdn),
              fora: auditados.filter((i) => i.auditoria?.status !== "ACTIVE").map((i) => i.fqdn),
            },
          }}
        />
        <Metrica
          rotulo="Sem auditoria"
          valor={semAuditoria.length}
          tom={semAuditoria.length ? "atencao" : "bom"}
          evidencia={{
            rotulo: "Sem auditoria",
            origem: "integrationConnection (Postgres)",
            funcao: `domínios ativos sem linha com provider ${PROVIDER_ICONES}`,
            formula: "domínios ativos menos os que já têm auditoria gravada",
            lidoEm,
            bruto: { dominios: semAuditoria.map((i) => i.fqdn) },
          }}
        />
      </GradeMetricas>

      <CartaoLista
        titulo="Domínios"
        descricao="O padrão de entrega tem nove itens. A linha mostra quantos passaram e o que pesa mais do que falta."
      >
        {itens.length === 0 ? (
          <div className="p-4">
            <EstadoVazio
              compacto
              titulo="Nenhum domínio cadastrado"
              descricao="Os domínios vêm do cadastro de clientes; assim que houver um, ele aparece aqui."
              acao={{ href: "/hub-social/dominios", label: "Abrir Domínios" }}
            />
          </div>
        ) : (
          <ul className="m-0 list-none p-0">
            {itens.map((item) => {
              const contagem = aprovados(item.auditoria);
              return (
                <li key={item.fqdn} className={LINHA_ITEM}>
                  <Link href={hrefDominio(item.fqdn)} className={cn(LINHA_LINK, "justify-between")}>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold">{item.fqdn}</span>
                      <span className="mt-0.5 block truncate text-[13px] text-muted-foreground">
                        {item.auditoria
                          ? item.auditoria.pendencia
                            ? `${contagem.ok} de ${contagem.total} · falta ${item.auditoria.pendencia.toLowerCase()}`
                            : `${contagem.ok} de ${contagem.total} · no padrão`
                          : `${item.organizacao} · sem auditoria`}
                      </span>
                    </span>
                    <BadgeStatus
                      {...rotuloIntegracao(item.auditoria?.status, "Sem auditoria")}
                      texto={item.auditoria ? `${item.auditoria.nota}/100` : "Sem auditoria"}
                    />
                    <Chevron />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </CartaoLista>
    </div>
  );
}

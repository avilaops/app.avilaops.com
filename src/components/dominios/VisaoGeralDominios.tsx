import Link from "next/link";
import GradeMetricas, { Metrica } from "@/components/hub-social/Metricas";
import { CartaoLista, Chevron, LINHA_ITEM, LINHA_LINK } from "@/components/hub-social/comum";
import ListaDominios from "@/components/dominios/ListaDominios";
import Luz from "@/components/dominios/Luz";
import {
  BASE,
  hrefConsulta,
  hrefFuncao,
  type Capacidade,
  type DominioDaCarteira,
  type Filtro,
  type ResumoCarteira,
} from "@/components/dominios/dados";
import { cn } from "@/lib/utils";

/**
 * A central de domínios.
 *
 * A tela fala das FUNÇÕES que a casa oferece — registro, DNS, renovação e
 * consulta — e não de quem as fornece por baixo. Nome de fornecedor só
 * aparece no diagnóstico de cada função, que é onde ele serve para alguma
 * coisa.
 */
export default function VisaoGeralDominios({
  dominios,
  capacidades,
  resumo,
  lidoEm,
  filtroInicial,
  parametros,
}: {
  dominios: DominioDaCarteira[];
  capacidades: Capacidade[];
  resumo: ResumoCarteira;
  lidoEm: string;
  filtroInicial: Filtro;
  /** Resumo da camada de parâmetros: o que espera decisão do dono. */
  parametros: { pendentes: number; semValor: number; conflitos: number };
}) {
  const resumoParametros = parametros.conflitos
    ? `${parametros.conflitos} ${parametros.conflitos === 1 ? "política contraria" : "políticas contrariam"} regra externa`
    : parametros.pendentes
      ? `${parametros.pendentes} ${parametros.pendentes === 1 ? "pendente" : "pendentes"} de confirmação`
      : "Prazos e limites com fonte e vigência";
  const consulta = 'prisma.domainAsset.findMany({ where: { status: { not: "ARCHIVED" } } })';

  return (
    <div className="space-y-6">
      <GradeMetricas rotulo="Resumo da carteira">
        <Metrica
          rotulo="Domínios"
          valor={resumo.total}
          evidencia={{
            rotulo: "Domínios",
            origem: "domainAsset (Postgres)",
            funcao: consulta,
            formula: "contagem de domínios não arquivados, independente de onde o DNS esteja",
            lidoEm,
            bruto: { dominios: dominios.map((d) => d.fqdn) },
          }}
        />
        <Metrica
          rotulo="Ativos"
          valor={resumo.ativos}
          tom="bom"
          href={`?filtro=ativos`}
          evidencia={{
            rotulo: "Ativos",
            origem: "domainAsset (Postgres)",
            formula: "domínios com registro confirmado e vencimento a mais de 60 dias",
            lidoEm,
            bruto: { ativos: dominios.filter((d) => d.situacao === "ATIVO").map((d) => d.fqdn) },
          }}
        />
        <Metrica
          rotulo="Vencendo"
          valor={resumo.vencendo}
          tom={resumo.vencendo > 0 ? "atencao" : "neutro"}
          href={`?filtro=vencendo`}
          evidencia={{
            rotulo: "Vencendo",
            origem: "domainAsset.expires_at (Postgres)",
            formula: "domínios cujo vencimento cai dentro de 60 dias, incluindo os já vencidos",
            lidoEm,
            observacao:
              resumo.semData > 0
                ? `${resumo.semData} domínios ainda não têm data conhecida e não entram nesta conta.`
                : undefined,
            bruto: {
              vencendo: dominios
                .filter((d) => d.situacao === "VENCENDO")
                .map((d) => ({ fqdn: d.fqdn, dias: d.diasRestantes })),
            },
          }}
        />
        <Metrica
          rotulo="Atenção"
          valor={resumo.atencao}
          tom={resumo.atencao > 0 ? "ruim" : "neutro"}
          detalhe={resumo.semData > 0 ? `${resumo.semData} sem data` : undefined}
          href={`?filtro=atencao`}
          evidencia={{
            rotulo: "Atenção",
            origem: "domainAsset + última consulta ao registro",
            formula:
              "domínios que o registro diz não existir, ou que nunca tiveram o vencimento consultado; prazo curto conta em Vencendo, não aqui",
            lidoEm,
            bruto: {
              atencao: dominios
                .filter((d) => d.situacao === "ATENCAO")
                .map((d) => ({ fqdn: d.fqdn, veredito: d.vereditoRegistro })),
            },
          }}
        />
      </GradeMetricas>

      <CartaoLista titulo="Gestão" descricao="As funções da central e o estado de cada uma.">
        <ul className="m-0 list-none p-0">
          {capacidades.map((capacidade) => (
            <li key={capacidade.chave} className={LINHA_ITEM}>
              <Link href={hrefFuncao(capacidade.chave)} className={cn(LINHA_LINK, "justify-between")}>
                <Luz estado={capacidade.estado} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold">{capacidade.nome}</span>
                  <span className="mt-0.5 block truncate text-[13px] text-muted-foreground">
                    {capacidade.resumo}
                  </span>
                </span>
                <Chevron />
              </Link>
            </li>
          ))}
          <li className={LINHA_ITEM}>
            <Link href={`${BASE}/parametros`} className={cn(LINHA_LINK, "justify-between")}>
              <Luz estado={parametros.conflitos ? "INDISPONIVEL" : parametros.pendentes || parametros.semValor ? "ATENCAO" : "OPERACIONAL"} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-semibold">Políticas e prazos</span>
                <span className="mt-0.5 block truncate text-[13px] text-muted-foreground">{resumoParametros}</span>
              </span>
              <Chevron />
            </Link>
          </li>
        </ul>
      </CartaoLista>

      <ListaDominios
        dominios={dominios}
        lidoEm={lidoEm}
        filtroInicial={filtroInicial}
        hrefConsulta={hrefConsulta}
      />
    </div>
  );
}

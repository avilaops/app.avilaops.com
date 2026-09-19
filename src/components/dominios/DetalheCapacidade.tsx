import Link from "next/link";
import CabecalhoPagina from "@/components/hub-social/CabecalhoPagina";
import ListaChaveValor from "@/components/hub-social/ListaChaveValor";
import { BOTAO, MensagemErro, formatarDataHora } from "@/components/hub-social/comum";
import BadgeStatus from "@/components/sistema/Status";
import { rotuloEstado, tomEstado } from "@/lib/dominios/capacidades";
import { BASE, hrefConsulta, hrefDominio, type Capacidade, type DominioDaCarteira } from "@/components/dominios/dados";
import { cn } from "@/lib/utils";

/**
 * O detalhe de uma função da central: o que ela faz, se está de pé, quando foi
 * verificada e o que está travando quando não está.
 *
 * É aqui, e só aqui, que nome de fornecedor aparece, dentro de "Diagnóstico
 * técnico" — numa investigação, saber qual conector respondeu é justamente a
 * informação que resolve.
 */
export default function DetalheCapacidade({
  capacidade,
  dominios,
}: {
  capacidade: Capacidade;
  dominios: DominioDaCarteira[];
}) {
  const tom = tomEstado(capacidade.estado);
  const verificado = formatarDataHora(capacidade.verificadoEm);

  // Na renovação o que a pessoa quer é a lista de quem vence, não um texto.
  const proximos =
    capacidade.chave === "renovacao"
      ? dominios
          .filter((d) => d.diasRestantes !== null && d.diasRestantes <= 60)
          .sort((a, b) => (a.diasRestantes ?? 0) - (b.diasRestantes ?? 0))
          .slice(0, 10)
      : [];

  return (
    <div className="space-y-6">
      <CabecalhoPagina
        eyebrow="Domínios"
        titulo={capacidade.nome}
        subtitulo={capacidade.resumo}
        voltar={{ href: BASE, label: "Domínios" }}
        meta={<BadgeStatus status={capacidade.estado} texto={rotuloEstado(capacidade.estado)} tom={tom} />}
      />

      {capacidade.erro ? <MensagemErro>{capacidade.erro}</MensagemErro> : null}

      <ListaChaveValor
        titulo="Situação"
        descricao={verificado ? `Verificado ${verificado}` : "Ainda sem verificação"}
        itens={capacidade.detalhes.map((item) => ({
          rotulo: item.rotulo,
          valor: item.valor,
          mono: item.tecnico,
        }))}
      />

      {capacidade.chave === "consulta" ? (
        <div>
          <Link href={hrefConsulta} className={cn("primary-button", BOTAO)}>
            Consultar um domínio
          </Link>
        </div>
      ) : null}

      {proximos.length > 0 ? (
        <ListaChaveValor
          titulo="Próximos do vencimento"
          descricao="Os dez mais urgentes, do prazo mais curto ao mais longo."
          itens={proximos.map((dominio) => ({
            rotulo: dominio.fqdn,
            href: hrefDominio(dominio.fqdn),
            valor:
              dominio.diasRestantes === null
                ? "sem data"
                : dominio.diasRestantes < 0
                  ? `venceu há ${Math.abs(dominio.diasRestantes)} dias`
                  : dominio.diasRestantes === 0
                    ? "vence hoje"
                    : `${dominio.diasRestantes} dias`,
          }))}
        />
      ) : null}

      {capacidade.avancado.length > 0 ? (
        <details className="detalhes-tecnicos">
          <summary>Diagnóstico técnico</summary>
          <ListaChaveValor
            itens={capacidade.avancado.map((item) => ({
              rotulo: item.rotulo,
              valor: item.valor,
              mono: item.tecnico,
            }))}
          />
        </details>
      ) : null}
    </div>
  );
}

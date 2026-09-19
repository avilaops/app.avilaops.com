"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import BadgeStatus from "@/components/sistema/Status";
import EstadoVazio from "@/components/hub-social/EstadoVazio";
import BotaoAtualizar from "@/components/dominios/BotaoAtualizar";
import { CAMPO, CartaoLista, Chevron, LINHA_ITEM, LINHA_LINK } from "@/components/hub-social/comum";
import { Input } from "@/components/shadcn/input";
import { Label } from "@/components/shadcn/label";
import {
  FILTROS,
  contarPorFiltro,
  filtrar,
  hrefDominio,
  lerFiltro,
  resumoDaLinha,
  rotuloDaSituacao,
  tomDaSituacao,
  type DominioDaCarteira,
  type Filtro,
} from "@/components/dominios/dados";
import { cn } from "@/lib/utils";

/**
 * A carteira. Uma linha por domínio, não por zona de DNS: domínio que a casa
 * administra sem hospedar o DNS aqui aparece igual, porque continua sendo um
 * domínio sob gestão.
 */
export default function ListaDominios({
  dominios,
  lidoEm,
  filtroInicial,
  hrefConsulta,
}: {
  dominios: DominioDaCarteira[];
  lidoEm: string;
  filtroInicial: Filtro;
  hrefConsulta: string;
}) {
  const [busca, setBusca] = useState("");
  const parametros = useSearchParams();
  const filtro = lerFiltro(parametros.get("filtro") ?? filtroInicial);

  function aplicarFiltro(novo: Filtro) {
    const url = new URL(window.location.href);
    if (novo === "todos") url.searchParams.delete("filtro");
    else url.searchParams.set("filtro", novo);
    window.history.replaceState(null, "", url);
  }

  const visiveis = filtrar(dominios, busca, filtro);
  const contagem = contarPorFiltro(dominios);

  return (
    <CartaoLista
      titulo="Seus domínios"
      descricao={
        visiveis.length === dominios.length
          ? `${dominios.length} sob gestão.`
          : `${visiveis.length} de ${dominios.length}.`
      }
      acao={<BotaoAtualizar />}
    >
      <div className="flex flex-col gap-3 border-b border-border px-4 py-3 min-[821px]:flex-row min-[821px]:items-center">
        <div className="min-w-0 min-[821px]:w-[300px]">
          <Label htmlFor="busca-dominios" className="sr-only">
            Buscar domínio ou cliente
          </Label>
          <Input
            id="busca-dominios"
            type="search"
            value={busca}
            onChange={(evento) => setBusca(evento.target.value)}
            placeholder="Buscar domínio ou cliente"
            autoComplete="off"
            className={CAMPO}
          />
        </div>

        {/* `.filter-tabs` é o chip da casa: no celular vira fileira rolável
            com 44px de alvo. Estilo próprio aqui nasceria com 36px, que é
            abaixo do mínimo e foi defeito em produção esta semana. */}
        <div role="group" aria-label="Filtrar domínios" className="filter-tabs min-w-0">
          {FILTROS.map((opcao) => {
            const ativo = filtro === opcao.valor;
            return (
              <button
                key={opcao.valor}
                type="button"
                aria-pressed={ativo}
                onClick={() => aplicarFiltro(opcao.valor)}
                className={ativo ? "active" : undefined}
              >
                {opcao.rotulo}
                <span className="ml-1.5 tabular-nums opacity-70">{contagem[opcao.valor]}</span>
              </button>
            );
          })}
        </div>
      </div>

      {dominios.length === 0 ? (
        <div className="p-4">
          <EstadoVazio
            compacto
            titulo="Nenhum domínio sob gestão"
            descricao="Domínios entram pela ficha do cliente ou pela sincronização de DNS."
            acao={{ href: hrefConsulta, label: "Consultar um domínio" }}
          />
        </div>
      ) : visiveis.length === 0 ? (
        <div className="p-4">
          <EstadoVazio
            compacto
            titulo="Nenhum domínio com esse filtro"
            acao={
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setBusca("");
                  aplicarFiltro("todos");
                }}
              >
                Limpar filtros
              </button>
            }
          />
        </div>
      ) : (
        <ul className="m-0 list-none p-0" data-lido-em={lidoEm}>
          {visiveis.map((dominio) => (
            <li key={dominio.id} className={LINHA_ITEM}>
              <Link href={hrefDominio(dominio.fqdn)} className={cn(LINHA_LINK, "justify-between")}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-[15px] font-semibold">{dominio.fqdn}</span>
                  <span className="mt-0.5 block text-[13px] leading-[1.35] text-muted-foreground [overflow-wrap:anywhere] min-[821px]:truncate">
                    {resumoDaLinha(dominio)}
                  </span>
                </span>
                <BadgeStatus
                  status={dominio.situacao}
                  texto={rotuloDaSituacao(dominio)}
                  tom={tomDaSituacao(dominio)}
                />
                <Chevron />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </CartaoLista>
  );
}

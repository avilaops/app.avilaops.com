import type { DominioDaCarteira, ResumoCarteira } from "@/lib/dominios/central";
import type { Capacidade, CapacidadesDeEscrita, ChaveCapacidade } from "@/lib/dominios/tipos";

/**
 * Tipos e derivações da central de domínios, compartilhados entre a página
 * (que consulta o banco) e os componentes que desenham cada vista. Nada aqui
 * toca banco nem rede, no mesmo arranjo de `components/icones/dados.ts`.
 */

export const BASE = "/hub-social/dominios";

export type Params = {
  domain?: string;
  funcao?: string;
  registrar?: string;
  consultar?: string;
  filtro?: string;
};

export type { DominioDaCarteira, ResumoCarteira, Capacidade, CapacidadesDeEscrita };

export const hrefDominio = (fqdn: string) => `${BASE}?domain=${encodeURIComponent(fqdn)}`;
export const hrefFuncao = (chave: ChaveCapacidade) => `${BASE}?funcao=${chave}`;
export const hrefConsulta = `${BASE}?consultar=1`;
export const hrefRegistrar = `${BASE}?registrar=1`;

export type Filtro = "todos" | "ativos" | "vencendo" | "atencao";

export const FILTROS: { valor: Filtro; rotulo: string }[] = [
  { valor: "todos", rotulo: "Todos" },
  { valor: "ativos", rotulo: "Ativos" },
  { valor: "vencendo", rotulo: "Vencendo" },
  { valor: "atencao", rotulo: "Atenção" },
];

export function lerFiltro(valor: string | null | undefined): Filtro {
  return valor === "ativos" || valor === "vencendo" || valor === "atencao" ? valor : "todos";
}

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export function filtrar(dominios: DominioDaCarteira[], busca: string, filtro: Filtro): DominioDaCarteira[] {
  const termo = normalizar(busca);
  return dominios.filter((dominio) => {
    if (filtro === "ativos" && dominio.situacao !== "ATIVO") return false;
    if (filtro === "vencendo" && dominio.situacao !== "VENCENDO") return false;
    if (filtro === "atencao" && dominio.situacao !== "ATENCAO") return false;
    if (!termo) return true;
    return normalizar(dominio.fqdn).includes(termo) || normalizar(dominio.cliente).includes(termo);
  });
}

export function contarPorFiltro(dominios: DominioDaCarteira[]): Record<Filtro, number> {
  return {
    todos: dominios.length,
    ativos: dominios.filter((d) => d.situacao === "ATIVO").length,
    vencendo: dominios.filter((d) => d.situacao === "VENCENDO").length,
    atencao: dominios.filter((d) => d.situacao === "ATENCAO").length,
  };
}

const formatoData = new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeZone: "America/Sao_Paulo" });

export function formatarData(iso: string | null): string | null {
  if (!iso) return null;
  const data = new Date(iso);
  return Number.isNaN(data.getTime()) ? null : formatoData.format(data);
}

/**
 * A segunda linha de um domínio na lista. Curta de propósito: cliente, prazo
 * e quantos registros de DNS. Nada de fornecedor, nada de id de zona.
 */
export function resumoDaLinha(dominio: DominioDaCarteira): string {
  const partes: string[] = [dominio.cliente];

  if (dominio.vereditoRegistro === "LIVRE") {
    partes.push("sem registro encontrado");
  } else if (dominio.expiraEm) {
    const data = formatarData(dominio.expiraEm);
    const dias = dominio.diasRestantes;
    if (dias !== null && dias < 0) partes.push(`venceu ${data}`);
    else if (dias === 0) partes.push("vence hoje");
    else if (dias !== null && dias <= 60) partes.push(`vence ${data} · ${dias} dias`);
    else partes.push(`vence ${data}`);
  } else {
    partes.push("sem data de vencimento");
  }

  if (dominio.dnsAqui) {
    partes.push(dominio.registrosDns === 1 ? "1 registro DNS" : `${dominio.registrosDns} registros DNS`);
  }

  return partes.join(" · ");
}

export function tomDaSituacao(dominio: DominioDaCarteira): "bom" | "atencao" | "ruim" | "neutro" {
  if (dominio.situacao === "ATENCAO") return "ruim";
  if (dominio.situacao === "VENCENDO") {
    return dominio.diasRestantes !== null && dominio.diasRestantes <= 14 ? "ruim" : "atencao";
  }
  return "bom";
}

export function rotuloDaSituacao(dominio: DominioDaCarteira): string {
  if (dominio.situacao === "ATENCAO") return "Atenção";
  if (dominio.situacao === "VENCENDO") return "Vencendo";
  if (dominio.situacao === "ARQUIVADO") return "Arquivado";
  return "Ativo";
}

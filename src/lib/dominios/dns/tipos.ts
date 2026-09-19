import type { EntradaProvedor } from "@/lib/dominios/capacidades";

/**
 * O contrato do DNS, independente de quem serve.
 *
 * A central fala de "DNS". Qual motor está do outro lado é assunto dos
 * adaptadores em `externo.ts` e `avila.ts`, e o nome deles só aparece na área
 * de diagnóstico.
 */

export type RegistroDns = {
  /**
   * Identificador estável do registro dentro da zona.
   *
   * Nem todo serviço de DNS dá id por registro: alguns trabalham por conjunto
   * (nome + tipo), e ali um "registro" é uma linha dentro do conjunto. Quem
   * não tem id de verdade sintetiza um a partir de nome, tipo e conteúdo, que
   * é o que identifica a linha de forma única dentro da zona.
   */
  id: string;
  tipo: string;
  nome: string;
  conteudo: string;
  ttl: number;
  proxy: boolean;
  prioridade: number | null;
};

export type EntradaRegistroDns = {
  tipo: string;
  nome: string;
  conteudo: string;
  ttl?: number;
  proxy?: boolean;
  prioridade?: number;
};

export interface DnsProvider {
  /** Nome interno do adaptador. Aparece só em diagnóstico. */
  readonly adaptador: string;
  configurado(): boolean;
  podeEditar(): boolean;
  verificar(): Promise<EntradaProvedor>;
  listar(zonaId: string): Promise<RegistroDns[]>;
  criar(zonaId: string, entrada: EntradaRegistroDns): Promise<RegistroDns>;
  atualizar(zonaId: string, registroId: string, entrada: EntradaRegistroDns): Promise<RegistroDns>;
  remover(zonaId: string, registroId: string): Promise<void>;
}

/** Tipos que a tela oferece. Fora desta lista, a rota recusa. */
export const TIPOS_DNS = ["A", "AAAA", "CNAME", "MX", "TXT", "NS", "SRV", "CAA"] as const;
export type TipoDns = (typeof TIPOS_DNS)[number];

export function tipoDnsValido(valor: string): valor is TipoDns {
  return (TIPOS_DNS as readonly string[]).includes(valor.toUpperCase());
}

/** Quem serve o DNS de um domínio. Grava em `domains.dns_provider`. */
export type ServicoDeDns = "NENHUM" | "EXTERNO" | "AVILA";

export function lerServicoDeDns(valor: string | null | undefined): ServicoDeDns {
  return valor === "EXTERNO" || valor === "AVILA" ? valor : "NENHUM";
}

import { ProvedorRegistroEpp } from "@/lib/dominios/registry/epp";
import type { RegistryProvider } from "@/lib/dominios/registry/tipos";

export type { RegistryProvider, PedidoRegistro, ResultadoOperacao } from "@/lib/dominios/registry/tipos";

/**
 * Qual adaptador de registro a casa usa. Hoje há um só; a função existe para
 * que a camada de domínio nunca importe um fornecedor pelo nome, e para que
 * trocar ou somar adaptador não vire busca-e-substitui pelo código.
 */
export function provedorDeRegistro(): RegistryProvider {
  return new ProvedorRegistroEpp();
}

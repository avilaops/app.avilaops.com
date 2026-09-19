import type { EntradaProvedor } from "@/lib/dominios/capacidades";

/**
 * Contrato do provedor de REGISTRO: criar, renovar e transferir domínio.
 *
 * A camada de domínio conversa só com esta interface. Qual protocolo está do
 * outro lado é problema do adaptador, e o nome dele não sobe para a tela
 * principal.
 *
 * Operação de escrita em registro é irreversível na prática (um registro
 * criado é cobrado, uma transferência iniciada tem prazo). Por isso o
 * contrato exige `confirmadoPor` e `idempotencia` em vez de deixar como
 * detalhe de implementação.
 */

export type DiagnosticoRegistry = EntradaProvedor;

export type CapacidadesRegistry = {
  registrar: boolean;
  renovar: boolean;
  transferir: boolean;
};

export type PedidoRegistro = {
  fqdn: string;
  /** Anos de registro. */
  periodo: number;
  /** Organização dona, no nosso cadastro. */
  organizationId: string;
  /** Nameservers que o domínio vai usar. */
  nameservers: string[];
  /** Id de quem confirmou na tela. Sem isto o adaptador recusa. */
  confirmadoPor: string;
  /** Chave de idempotência, para o retry não registrar duas vezes. */
  idempotencia: string;
};

export type ResultadoOperacao =
  | { ok: true; transacao: string; detalhe?: string }
  | { ok: false; codigo: string; mensagem: string };

export interface RegistryProvider {
  /** Nome interno do adaptador. Aparece só em diagnóstico. */
  readonly adaptador: string;
  /** Verdadeiro quando há credencial e endereço configurados. */
  configurado(): boolean;
  capacidades(): CapacidadesRegistry;
  /** Estado atual, para a luz da função. Nunca lança. */
  verificar(): Promise<DiagnosticoRegistry>;
  registrar(pedido: PedidoRegistro): Promise<ResultadoOperacao>;
  renovar(pedido: Omit<PedidoRegistro, "nameservers">): Promise<ResultadoOperacao>;
}

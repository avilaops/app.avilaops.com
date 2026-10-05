/**
 * O corpo do pedido de envio de cobrança que a tela manda ao servidor.
 *
 * São dois caminhos separados de propósito, um botão para cada: "teste" (vai
 * para um endereço do operador) e "cliente" (vai para o cliente de verdade).
 * Um nunca vira o outro por omissão — destino de teste em branco NÃO é envio
 * ao cliente, é nada enviado.
 */

export type ModoEnvio = "teste" | "cliente";

export type PedidoEnvio = {
  canal: "email" | "whatsapp";
  conteudo: "cobranca" | "fatura" | "ambos";
  teste: boolean;
  destinoTeste?: string;
};

/**
 * `null` quando não há o que enviar: teste sem destino. O envio real leva
 * `teste: false` explícito, que é o que o servidor exige para sair do modo de
 * teste, e nunca leva `destinoTeste`.
 */
export function pedidoDeEnvio(
  modo: ModoEnvio,
  canal: PedidoEnvio["canal"],
  conteudo: PedidoEnvio["conteudo"],
  destinoTeste?: string | null,
): PedidoEnvio | null {
  if (modo === "cliente") return { canal, conteudo, teste: false };
  const destino = (destinoTeste ?? "").trim();
  if (!destino) return null;
  return { canal, conteudo, teste: true, destinoTeste: destino };
}

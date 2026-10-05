import { describe, expect, it } from "vitest";
import { pedidoDeEnvio } from "@/lib/envio-cobranca-pedido";

/**
 * O pedido que a tela de operação manda ao servidor. Antes, um campo de
 * destino vazio virava envio ao cliente real; agora são dois botões, e o
 * vazio do teste não envia nada.
 */
describe("pedidoDeEnvio", () => {
  it("teste leva o destino do operador e teste: true", () => {
    expect(pedidoDeEnvio("teste", "email", "cobranca", "  eu@avilaops.com ")).toEqual({
      canal: "email",
      conteudo: "cobranca",
      teste: true,
      destinoTeste: "eu@avilaops.com",
    });
  });

  it("teste sem destino NÃO vira envio ao cliente: não há pedido", () => {
    expect(pedidoDeEnvio("teste", "email", "cobranca", "")).toBeNull();
    expect(pedidoDeEnvio("teste", "whatsapp", "ambos", "   ")).toBeNull();
    expect(pedidoDeEnvio("teste", "email", "fatura", null)).toBeNull();
    expect(pedidoDeEnvio("teste", "email", "fatura")).toBeNull();
  });

  it("envio ao cliente leva teste: false explícito e nenhum destino de teste", () => {
    const pedido = pedidoDeEnvio("cliente", "whatsapp", "ambos", "5511999990000");

    expect(pedido).toEqual({ canal: "whatsapp", conteudo: "ambos", teste: false });
    expect(pedido).not.toHaveProperty("destinoTeste");
  });
});

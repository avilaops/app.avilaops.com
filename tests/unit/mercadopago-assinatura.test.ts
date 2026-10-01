import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verificarAssinatura } from "@/lib/mercadopago-assinatura";

/**
 * A conta que decide se uma notificação é do Mercado Pago ou de qualquer um.
 *
 * Testada com o manifesto montado à mão — que é o ponto: se o formato do
 * manifesto estiver errado, a verificação recusa notificação legítima e a baixa
 * das faturas para. Os casos abaixo são os que distinguem "formato certo" de
 * "formato parecido".
 */

const SEGREDO = "segredo-de-teste-da-aplicacao";

/** Assina como o Mercado Pago assina. */
function assinar(manifesto: string, segredo = SEGREDO): string {
  return createHmac("sha256", segredo).update(manifesto).digest("hex");
}

function cabecalho(manifesto: string, ts: string, segredo = SEGREDO): string {
  return `ts=${ts},v1=${assinar(manifesto, segredo)}`;
}

describe("verificarAssinatura", () => {
  it("aceita a notificação completa, com id e request-id", () => {
    const ts = "1760000000000";
    const manifesto = `id:123456789;request-id:req-abc;ts:${ts};`;

    expect(
      verificarAssinatura({
        cabecalho: cabecalho(manifesto, ts),
        requestId: "req-abc",
        dataId: "123456789",
        segredo: SEGREDO,
      }),
    ).toEqual({ valida: true });
  });

  it("minúscula o id antes de assinar: o Mercado Pago manda assim", () => {
    const ts = "1760000000001";
    // O manifesto usa o id em minúsculas mesmo quando a query traz maiúsculas.
    const manifesto = `id:abc123def;request-id:req-1;ts:${ts};`;

    expect(
      verificarAssinatura({
        cabecalho: cabecalho(manifesto, ts),
        requestId: "req-1",
        dataId: "ABC123DEF",
        segredo: SEGREDO,
      }),
    ).toEqual({ valida: true });
  });

  it("omite do manifesto a parte que não veio, em vez de mandá-la vazia", () => {
    const ts = "1760000000002";
    // Sem `data.id` na query, o manifesto começa direto no request-id — e NÃO
    // com "id:;". É o detalhe que mais custa a descobrir em produção.
    const manifesto = `request-id:req-2;ts:${ts};`;

    expect(
      verificarAssinatura({
        cabecalho: cabecalho(manifesto, ts),
        requestId: "req-2",
        dataId: null,
        segredo: SEGREDO,
      }),
    ).toEqual({ valida: true });
  });

  it("aceita quando só o ts existe", () => {
    const ts = "1760000000003";

    expect(
      verificarAssinatura({
        cabecalho: cabecalho(`ts:${ts};`, ts),
        requestId: null,
        dataId: null,
        segredo: SEGREDO,
      }),
    ).toEqual({ valida: true });
  });

  it("recusa assinatura feita com outro segredo", () => {
    const ts = "1760000000004";
    const manifesto = `id:999;request-id:req-3;ts:${ts};`;

    const veredicto = verificarAssinatura({
      cabecalho: cabecalho(manifesto, ts, "segredo-do-atacante"),
      requestId: "req-3",
      dataId: "999",
      segredo: SEGREDO,
    });

    expect(veredicto).toEqual({ valida: false, motivo: "assinatura não confere" });
  });

  it("recusa quando o id do manifesto não é o id notificado", () => {
    const ts = "1760000000005";
    // Assinatura válida para o pagamento 111, reaproveitada para notificar 222:
    // é o ataque que a verificação precisa barrar.
    const manifesto = `id:111;request-id:req-4;ts:${ts};`;

    const veredicto = verificarAssinatura({
      cabecalho: cabecalho(manifesto, ts),
      requestId: "req-4",
      dataId: "222",
      segredo: SEGREDO,
    });

    expect(veredicto.valida).toBe(false);
  });

  it("recusa sem cabeçalho, sem ts, sem v1 e com v1 que não é hexadecimal", () => {
    const comum = { requestId: "req-5", dataId: "123", segredo: SEGREDO };

    expect(verificarAssinatura({ ...comum, cabecalho: null }).valida).toBe(false);
    expect(verificarAssinatura({ ...comum, cabecalho: "v1=abc123" }).valida).toBe(false);
    expect(verificarAssinatura({ ...comum, cabecalho: "ts=1760000000000" }).valida).toBe(false);
    expect(
      verificarAssinatura({ ...comum, cabecalho: "ts=1760000000000,v1=não-é-hex" }).valida,
    ).toBe(false);
  });

  it("recusa, em vez de lançar, quando o v1 tem tamanho diferente do esperado", () => {
    // `timingSafeEqual` lança com buffers de tamanhos diferentes, e hash curto é
    // exatamente o que um atacante manda. Recusar é o certo; quebrar não.
    const veredicto = verificarAssinatura({
      cabecalho: "ts=1760000000000,v1=abcd",
      requestId: "req-6",
      dataId: "123",
      segredo: SEGREDO,
    });

    expect(veredicto).toEqual({ valida: false, motivo: "assinatura não confere" });
  });

  it("recusa quando o ambiente não tem segredo: não se verifica com nada", () => {
    expect(
      verificarAssinatura({
        cabecalho: "ts=1,v1=aa",
        requestId: null,
        dataId: null,
        segredo: "",
      }),
    ).toEqual({ valida: false, motivo: "segredo do webhook não configurado" });
  });

  it("tolera espaço em volta das partes do cabeçalho", () => {
    const ts = "1760000000006";
    const manifesto = `id:555;request-id:req-7;ts:${ts};`;

    expect(
      verificarAssinatura({
        cabecalho: `ts=${ts} , v1=${assinar(manifesto)} `,
        requestId: "req-7",
        dataId: "555",
        segredo: SEGREDO,
      }),
    ).toEqual({ valida: true });
  });
});

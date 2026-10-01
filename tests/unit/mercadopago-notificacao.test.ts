import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { limparCacheDeCredenciais } from "@/lib/credenciais";
import { urlDeNotificacao } from "@/lib/mercadopago";

/**
 * O endereço que cada cobrança manda ao Mercado Pago para ser avisada de volta.
 *
 * Duas coisas podem dar errado aqui, e as duas custam dinheiro:
 *
 * 1. mandar endereço errado — a fatura nunca fecha sozinha;
 * 2. mandar endereço local — o Mercado Pago recusa o PAGAMENTO INTEIRO, e aí
 *    não se emite cobrança nenhuma em desenvolvimento.
 */

const original = { APP_URL: process.env.APP_URL, MP_WEBHOOK_TOKEN: process.env.MP_WEBHOOK_TOKEN };

beforeEach(() => {
  delete process.env.APP_URL;
  delete process.env.MP_WEBHOOK_TOKEN;
  // O cofre guarda o que leu por 60 segundos. Sem limpar, o segundo caso
  // enxergaria o token do primeiro e o teste passaria pelo motivo errado.
  limparCacheDeCredenciais();
});

afterEach(() => {
  if (original.APP_URL === undefined) delete process.env.APP_URL;
  else process.env.APP_URL = original.APP_URL;
  if (original.MP_WEBHOOK_TOKEN === undefined) delete process.env.MP_WEBHOOK_TOKEN;
  else process.env.MP_WEBHOOK_TOKEN = original.MP_WEBHOOK_TOKEN;
});

describe("urlDeNotificacao", () => {
  it("usa o endereço de produção quando APP_URL não está no ambiente", async () => {
    expect(await urlDeNotificacao()).toBe("https://app.avilaops.com/api/webhooks/mercadopago");
  });

  it("respeita APP_URL e não duplica a barra final", async () => {
    process.env.APP_URL = "https://painel.avilaops.com/";
    expect(await urlDeNotificacao()).toBe("https://painel.avilaops.com/api/webhooks/mercadopago");
  });

  it("leva o token na query quando ele existe", async () => {
    process.env.MP_WEBHOOK_TOKEN = "um token/com espaço";
    expect(await urlDeNotificacao()).toBe(
      "https://app.avilaops.com/api/webhooks/mercadopago?token=um+token%2Fcom+espa%C3%A7o",
    );
  });

  it("devolve vazio para endereço que o Mercado Pago não alcança", async () => {
    for (const base of [
      "http://localhost:3000",
      "https://localhost:3000",
      "http://127.0.0.1:3000",
      "https://192.168.0.10",
      "https://10.1.2.3",
      "https://172.16.0.9",
      "https://app.local",
      "https://web",
      // HTTP simples, mesmo em domínio público: o Mercado Pago quer HTTPS.
      "http://app.avilaops.com",
      "não é uma url",
    ]) {
      process.env.APP_URL = base;
      expect(await urlDeNotificacao(), `deveria ser vazio para ${base}`).toBe("");
    }
  });

  it("não confunde endereço público que começa com 17 com faixa privada", async () => {
    // 172.16/12 é privada; 172.15 e 173 não são. Um regex frouxo aqui tiraria
    // o webhook de um servidor público sem ninguém notar.
    process.env.APP_URL = "https://172.15.0.1";
    expect(await urlDeNotificacao()).toBe("https://172.15.0.1/api/webhooks/mercadopago");
    process.env.APP_URL = "https://173.16.0.1";
    limparCacheDeCredenciais();
    expect(await urlDeNotificacao()).toBe("https://173.16.0.1/api/webhooks/mercadopago");
  });
});

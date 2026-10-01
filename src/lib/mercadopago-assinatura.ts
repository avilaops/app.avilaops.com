import { createHmac, timingSafeEqual } from "node:crypto";
import { obterCredencial } from "@/lib/credenciais";

/**
 * A assinatura que o Mercado Pago põe em `x-signature`.
 *
 * Até aqui o webhook se defendia com um token na query string e, sem
 * `MP_WEBHOOK_TOKEN` configurado, aceitava qualquer chamada. A reconsulta à API
 * protegia o dinheiro — nenhum POST forjado inventa pagamento aprovado —, mas
 * não protegia o endpoint: qualquer um podia fazer o app consultar ids à
 * vontade. O webhook do PayPal, na mesma casa, sempre recusou notificação sem o
 * id dele. Este módulo fecha essa diferença.
 *
 * O formato é do Mercado Pago, não nosso: o cabeçalho vem como
 * `ts=1704908010,v1=618c85345248dd820d5fd456117c2ab2ef8c1a0f0a1c...`, e o que se
 * assina é um manifesto montado em ordem fixa:
 *
 *     id:<data.id da query, minúsculo>;request-id:<x-request-id>;ts:<ts>;
 *
 * Quando `data.id` ou `x-request-id` não vêm na notificação, a parte
 * correspondente **sai do manifesto** em vez de entrar vazia — está na
 * documentação e é o detalhe que faz a conta bater ou não.
 *
 * Função pura de propósito: recebe o que leu do pedido e devolve o veredito,
 * sem tocar em `process.env` nem em rede. É o que permite testá-la sem banco,
 * sem servidor e sem segredo de verdade.
 */

export type VeredictoAssinatura = { valida: true } | { valida: false; motivo: string };

/** Só dígitos hexadecimais: o `v1` é um HMAC-SHA256 em hex. */
const HEX = /^[0-9a-f]+$/i;

function partesDoCabecalho(cabecalho: string): { ts: string | null; v1: string | null } {
  let ts: string | null = null;
  let v1: string | null = null;

  for (const parte of cabecalho.split(",")) {
    const igual = parte.indexOf("=");
    if (igual === -1) continue;
    const chave = parte.slice(0, igual).trim();
    const valor = parte.slice(igual + 1).trim();
    if (chave === "ts") ts = valor;
    if (chave === "v1") v1 = valor;
  }

  return { ts, v1 };
}

/**
 * Compara em tempo constante.
 *
 * `timingSafeEqual` **lança** quando os buffers têm tamanhos diferentes, e um
 * hash de tamanho errado é exatamente o que um atacante manda. Por isso o
 * tamanho é conferido antes — e conferir tamanho não vaza nada, porque o
 * tamanho do HMAC é público (64 hex).
 */
function iguais(esperado: string, recebido: string): boolean {
  const a = Buffer.from(esperado, "utf8");
  const b = Buffer.from(recebido, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function verificarAssinatura(entrada: {
  /** Cabeçalho `x-signature` como veio, ou nulo se não veio. */
  cabecalho: string | null;
  /** Cabeçalho `x-request-id`, que entra no manifesto quando existe. */
  requestId: string | null;
  /** `data.id` da QUERY STRING — não o do corpo. */
  dataId: string | null;
  segredo: string;
}): VeredictoAssinatura {
  if (!entrada.segredo) return { valida: false, motivo: "segredo do webhook não configurado" };
  if (!entrada.cabecalho) return { valida: false, motivo: "sem cabeçalho x-signature" };

  const { ts, v1 } = partesDoCabecalho(entrada.cabecalho);
  if (!ts || !v1) return { valida: false, motivo: "x-signature sem ts ou v1" };
  if (!HEX.test(v1)) return { valida: false, motivo: "v1 não é hexadecimal" };

  const partes: string[] = [];
  // O Mercado Pago manda o id em minúsculas no manifesto mesmo quando a query
  // traz maiúsculas. Não é cosmético: muda o HMAC.
  if (entrada.dataId) partes.push(`id:${entrada.dataId.toLowerCase()}`);
  if (entrada.requestId) partes.push(`request-id:${entrada.requestId}`);
  partes.push(`ts:${ts}`);
  const manifesto = partes.join(";") + ";";

  const calculado = createHmac("sha256", entrada.segredo).update(manifesto).digest("hex");

  /*
    Sem janela de tempo, de propósito.

    A tentação é recusar `ts` antigo para barrar repetição. Mas o Mercado Pago
    REENVIA a notificação que não recebeu 200, e recusar um reenvio legítimo é
    deixar fatura paga em aberto — dinheiro na conta e cliente sem acesso. A
    repetição, aqui, não faz estrago: o endpoint é idempotente e quem diz se
    entrou dinheiro é a consulta à API, não este cabeçalho. Trocar um risco que
    não existe por um prejuízo que existe seria mau negócio.
  */
  return iguais(calculado, v1)
    ? { valida: true }
    : { valida: false, motivo: "assinatura não confere" };
}

/**
 * O segredo da aplicação do Mercado Pago.
 *
 * Lido pelo cofre, que cai no `process.env` quando a chave ainda não foi
 * guardada por lá. É o que permite trocar a assinatura do webhook pela tela de
 * Empresa › Credenciais, junto com o token — os dois vêm da mesma aplicação, e
 * trocar um sem o outro deixa a baixa das faturas parada.
 */
export async function segredoDoWebhook(): Promise<string> {
  return (await obterCredencial("MP_WEBHOOK_SECRET"))?.trim() ?? "";
}

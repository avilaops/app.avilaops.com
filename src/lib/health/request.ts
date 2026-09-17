import { randomUUID } from "node:crypto";

/**
 * Request id da cadeia tela → API → coleta → banco.
 *
 * Aceita o que veio no cabeçalho `x-request-id` (o coletor do host manda o
 * seu) desde que seja curto e sem caracteres estranhos; senão gera um novo.
 * O mesmo id volta no cabeçalho da resposta, é gravado nas linhas e sai no
 * log JSON, então um número da tela leva direto à linha de log.
 */
export function requestIdFrom(headers: Headers): string {
  const incoming = headers.get("x-request-id")?.trim() ?? "";
  return /^[A-Za-z0-9._:-]{8,80}$/.test(incoming) ? incoming : randomUUID();
}

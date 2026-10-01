/**
 * Ponte entre o assistente de cadastro e a ficha logo abaixo dele. São dois
 * componentes irmãos na página; a lista do que falta só serve se levar ao
 * campo, e a ficha é quem sabe em qual aba cada campo mora.
 */
export const EVENTO_IR_PARA_CAMPO = "ficha:ir-para-campo";

export function irParaCampo(nome: string) {
  window.dispatchEvent(new CustomEvent<string>(EVENTO_IR_PARA_CAMPO, { detail: nome }));
}

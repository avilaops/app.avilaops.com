/**
 * O que a rota devolve para a tela saber que precisa pedir a senha.
 *
 * Mora num arquivo só dele porque os dois lados leem: a rota, no servidor, e a
 * folha de senha, no navegador. Deixá-lo junto de `confirmacao-recente` puxaria
 * Prisma e cookie de servidor para dentro do pacote do cliente.
 */
export const CODIGO_CONFIRMACAO_NECESSARIA = "CONFIRMACAO_NECESSARIA";

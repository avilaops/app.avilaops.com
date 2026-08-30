/**
 * Slug de plano, produto ou página: minúsculo, sem acento, só letras,
 * números e hífen. A tela sugere e a API grava com a MESMA função — se
 * divergissem, o que a pessoa vê no formulário não seria o que fica no banco.
 */
export function slugify(valor: string, limite = 80) {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, limite);
}

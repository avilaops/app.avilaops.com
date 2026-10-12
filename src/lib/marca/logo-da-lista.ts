import { MIMES_ORIGEM } from "./especificacoes";

/**
 * Qual arquivo da marca representa o cliente num quadrado pequeno (lista de
 * clientes), do melhor para o que ainda serve.
 *
 * Os ícones gerados vêm primeiro: já são quadrados, com a folga certa. Depois
 * o símbolo e as logos, que cabem pior num quadrado mas ainda identificam. A
 * horizontal fica por último — em 32 px ela vira um risco.
 */
export const TIPOS_PARA_A_LISTA = [
  "Ícone 192x192",
  "Apple Touch Icon",
  "Ícone 512x512",
  "Símbolo",
  "Logo principal",
  "Logo vertical",
  "Logo horizontal",
] as const;

export type AtivoParaALista = {
  id: string;
  assetType: string;
  mimeType: string | null;
  storageKey: string | null;
};

/** O id do ativo a exibir, ou null quando o cliente não tem imagem que sirva. */
export function logoDaLista(ativos: AtivoParaALista[]): string | null {
  const exibiveis = ativos.filter((a) => a.storageKey && a.mimeType && MIMES_ORIGEM.has(a.mimeType));
  for (const tipo of TIPOS_PARA_A_LISTA) {
    const achado = exibiveis.find((a) => a.assetType === tipo);
    if (achado) return achado.id;
  }
  return null;
}

/**
 * Chamada única às rotas /api/newsletter/*: devolve o JSON ou lança o
 * `error` que a API mandou. Mesma função que vivia dentro do NewsletterStudio.
 */
export async function call<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? "Operação não concluída.");
  return payload;
}

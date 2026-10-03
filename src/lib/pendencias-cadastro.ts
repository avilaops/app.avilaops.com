/**
 * O mínimo para atender o cliente sem voltar a perguntar.
 *
 * Lê só o que já está no banco. O que falta aparece como pendência na área do
 * cliente em vez de virar campo obrigatório no cadastro rápido: com dez
 * clientes num dia, quem cadastra não pode travar em campo que o próprio
 * cliente vai mandar depois.
 */
export type ClienteParaPendencias = {
  cpfCnpj?: string | null;
  segment?: string | null;
  contacts?: Array<{
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    whatsapp?: string | null;
  }>;
  /** Ficha em PDF sem responsável grava e-mail e telefone só aqui, sem contato. */
  profile?: {
    ownerName?: string | null;
    email?: string | null;
    phone?: string | null;
    whatsapp?: string | null;
  } | null;
  webPresence?: { hasCurrentSite?: boolean | null; primaryDomain?: string | null } | null;
};

export function pendenciasDoCadastro(cliente: ClienteParaPendencias): string[] {
  const contato = cliente.contacts?.[0];
  const perfil = cliente.profile;
  const web = cliente.webPresence;
  const faltando: string[] = [];
  if (!contato?.name && !perfil?.ownerName) faltando.push("contato principal");
  const temCanal = [contato?.email, contato?.phone, contato?.whatsapp, perfil?.email, perfil?.phone, perfil?.whatsapp]
    .some(Boolean);
  if (!temCanal) faltando.push("e-mail ou telefone");
  if (!cliente.cpfCnpj) faltando.push("CPF ou CNPJ");
  if (!cliente.segment) faltando.push("segmento");
  if (web?.hasCurrentSite == null) faltando.push("situação do site");
  else if (web.hasCurrentSite && !web.primaryDomain) faltando.push("domínio");
  return faltando;
}

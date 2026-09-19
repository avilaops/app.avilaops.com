/**
 * Linha de domínio como a tela de Domínios usa. Os campos de organização,
 * zona e renovação vêm só da página (prisma direto): o GET
 * /api/integrations/cloudflare/domains não os devolve, então depois de
 * "Sincronizar agora" eles são preservados pelo id da linha anterior.
 */
export type DomainRow = {
  id: string;
  fqdn: string;
  cloudflarePlan: string | null;
  cloudflareStatus: string | null;
  dnsLastSyncedAt: string | null;
  dnsRecordCount: number;
  organizationName: string;
  organizationId: string | null;
  cloudflareZoneId: string | null;
  registrar: string | null;
  expiresAt: string | null;
  autoRenew: boolean | null;
  nextActionAt: string | null;
  /** Quando o Registro.br foi consultado para este domínio. Nulo: nunca foi. */
  registroBrLidoEm: string | null;
  /** Titular publicado pelo RDAP do Registro.br, quando houver. */
  registroBrTitular: string | null;
  /** Último veredito do Registro.br: REGISTRADO, LIVRE, BLOQUEADO, INVALIDO, DESCONHECIDO. */
  registroBrStatus: string | null;
};

export type FiltroStatus = "todas" | "ativas" | "pendentes" | "vencendo";

/** A partir daqui a renovação vira assunto. É a mesma régua de `/operacao`. */
export const JANELA_ATENCAO_DIAS = 60;

export function lerFiltro(valor: string | null | undefined): FiltroStatus {
  return valor === "ativas" || valor === "pendentes" || valor === "vencendo" ? valor : "todas";
}

export function estaAtiva(dominio: Pick<DomainRow, "cloudflareStatus">): boolean {
  return dominio.cloudflareStatus === "active";
}

/**
 * Dias inteiros até o vencimento. Nulo quando ninguém publicou data, que é
 * diferente de "vence hoje" e a tela precisa saber a diferença.
 */
export function diasAteVencer(expiresAt: string | null, agora: Date = new Date()): number | null {
  if (!expiresAt) return null;
  const data = new Date(expiresAt);
  if (Number.isNaN(data.getTime())) return null;
  return Math.ceil((data.getTime() - agora.getTime()) / (24 * 60 * 60 * 1000));
}

export function estaVencendo(dominio: Pick<DomainRow, "expiresAt">, agora: Date = new Date()): boolean {
  const dias = diasAteVencer(dominio.expiresAt, agora);
  return dias !== null && dias <= JANELA_ATENCAO_DIAS;
}

function normalizar(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

export function filtrarDominios(
  dominios: DomainRow[],
  busca: string,
  filtro: FiltroStatus,
  agora: Date = new Date(),
): DomainRow[] {
  const termo = normalizar(busca);
  return dominios.filter((dominio) => {
    if (filtro === "ativas" && !estaAtiva(dominio)) return false;
    if (filtro === "pendentes" && estaAtiva(dominio)) return false;
    if (filtro === "vencendo" && !estaVencendo(dominio, agora)) return false;
    if (!termo) return true;
    return normalizar(dominio.fqdn).includes(termo) || normalizar(dominio.organizationName).includes(termo);
  });
}

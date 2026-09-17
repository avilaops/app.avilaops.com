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
};

export type FiltroStatus = "todas" | "ativas" | "pendentes";

export function lerFiltro(valor: string | null | undefined): FiltroStatus {
  return valor === "ativas" || valor === "pendentes" ? valor : "todas";
}

export function estaAtiva(dominio: Pick<DomainRow, "cloudflareStatus">): boolean {
  return dominio.cloudflareStatus === "active";
}

function normalizar(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

export function filtrarDominios(dominios: DomainRow[], busca: string, filtro: FiltroStatus): DomainRow[] {
  const termo = normalizar(busca);
  return dominios.filter((dominio) => {
    if (filtro === "ativas" && !estaAtiva(dominio)) return false;
    if (filtro === "pendentes" && estaAtiva(dominio)) return false;
    if (!termo) return true;
    return normalizar(dominio.fqdn).includes(termo) || normalizar(dominio.organizationName).includes(termo);
  });
}

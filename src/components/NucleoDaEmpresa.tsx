import { carregarNucleoDaEmpresa } from "@/lib/nucleo/queries";
import { formatDateTime } from "@/lib/format";
import Link from "next/link";

const estados: Record<string, string> = {
  PENDING: "Aguardando autorização", AUTHORIZED: "Autorizada", CURRENT: "Atualizada",
  UNKNOWN: "Sem sincronização confirmada", STALE: "Sincronização atrasada",
  EXPIRED: "Autorização expirada", REVOKED: "Autorização revogada", ERROR: "Falha de sincronização",
};

export default async function NucleoDaEmpresa({ identityId, organizationId }: { identityId: string; organizationId: string }) {
  const nucleo = await carregarNucleoDaEmpresa(identityId, organizationId);
  const providers: Record<string, string> = { meta_business: "Meta Business", meta: "Meta", google: "Google", whatsapp: "WhatsApp", dns: "Domínios" };
  return <section className="portal-card nucleo-panel">
    <div className="portal-card-topo"><div><span className="portal-eyebrow">Vínculos da empresa</span><h2>Contas e acessos</h2></div><Link href={`/clientes/${organizationId}?section=services`}>Gerenciar serviços →</Link></div>
    <dl className="nucleo-stats">
      <div><dt>Pessoas com acesso</dt><dd>{nucleo.participacoes.length}</dd></div>
      <div><dt>Produtos vinculados</dt><dd>{nucleo.produtos.length}</dd></div>
      <div><dt>Ativos registrados</dt><dd>{nucleo.ativos.length}</dd></div>
    </dl>
    {nucleo.conexoes.length ? <ul className="portal-list">
      {nucleo.conexoes.map(c => <li key={`${c.id}-${c.resource ?? ""}`}>
        <span>{providers[c.provider] ?? c.provider}{c.resource ? ` · ${c.resource}` : ""}<small>Última sincronização: {formatDateTime(c.last_success_at)}</small></span>
        <em className={`nucleo-status ${c.health === "CURRENT" ? "is-current" : "is-pending"}`}>{estados[c.health] ?? c.health}</em>
      </li>)}
    </ul> : <div className="nucleo-empty"><strong>Nenhuma conta externa vinculada</strong><p>Confira os serviços da empresa para iniciar a configuração. Os acessos só serão exibidos como autorizados após a confirmação.</p></div>}
    <p className="portal-muted">Ativos registrados não significam autorização para operar a conta. A autorização e a última sincronização aparecem acima.</p>
  </section>;
}

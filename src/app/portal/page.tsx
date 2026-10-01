import Link from "next/link";
import { redirect } from "next/navigation";
import EquipeDoCliente from "@/components/EquipeDoCliente";
import FaturasDoCliente from "@/components/FaturasDoCliente";
import { getSessaoPortal, ehDaCasa, ehDonoDoNegocio } from "@/lib/auth";
import { formatCurrency, formatShortDate } from "@/lib/format";
import { carregarPainelDoCliente } from "@/lib/portal-cliente";
import { listarUsuariosDaEmpresa } from "@/lib/usuarios-do-cliente";
import { rotuloDoCiclo } from "@/lib/nucleo/format";
import { participaDaEmpresa } from "@/lib/nucleo/acesso";

export const metadata = { title: "Sua conta - Ávila Ops" };

const ROTULO_STATUS_EMPRESA: Record<string, string> = {
  ACTIVE: "Ativo",
  ONBOARDING: "Em implantação",
  PAUSED: "Pausado",
  ARCHIVED: "Encerrado",
};

const ROTULO_ETAPA: Record<string, string> = {
  PENDING: "A fazer",
  IN_PROGRESS: "Em andamento",
  DONE: "Concluída",
  BLOCKED: "Parada",
};

const ROTULO_ENTREGA: Record<string, string> = {
  DRAFT: "Em preparação",
  SENT: "Enviada",
  PAID: "Paga",
  RELEASED: "Liberada",
  CANCELLED: "Cancelada",
};

/**
 * Area do cliente, servida pelo app.avilaops.com. Quem e cliente ve apenas a propria empresa: o
 * id vem da sessao, nunca da URL.
 */
export default async function PortalDoCliente() {
  const sessao = await getSessaoPortal();
  if (!sessao) redirect("/login");
  if (ehDaCasa(sessao.role)) redirect("/operacao");

  const painel = sessao.organizationId ? await carregarPainelDoCliente(sessao.id, sessao.organizationId) : null;
  // Só o dono do negócio administra gente; a equipe usa o produto e não vê esta parte.
  const equipe = painel && ehDonoDoNegocio(sessao.role) && await participaDaEmpresa(sessao.id, painel.empresa.id, true)
    ? await listarUsuariosDaEmpresa(painel.empresa.id) : null;
  const primeiroNome = sessao.nome.split(" ")[0];

  if (!painel) {
    return (
      <main className="portal-frame">
        <header className="portal-header">
          <div>
            <span className="portal-eyebrow">Ávila Ops</span>
            <h1>Olá, {primeiroNome}.</h1>
          </div>
          <form action="/api/auth/logout" method="post">
            <button type="submit" className="secondary-button">Sair</button>
          </form>
        </header>
        <section className="portal-card">
          <h2>Sua conta ainda não está ligada a uma empresa</h2>
          <p>Não há uma participação vigente em empresa para esta conta. Responda ao e-mail do seu atendimento para solicitar a revisão do acesso.</p>
          <p className="portal-muted">Conta: {sessao.email}</p>
        </section>
      </main>
    );
  }

  const { empresa, contatos, dominios, assinaturas, faturas, entregas, etapas } = painel;
  const etapasConcluidas = etapas.filter((e) => e.status === "DONE").length;
  const emAberto = painel.totais.filter(t => t.emAberto > 0);

  return (
    <main className="portal-frame">
      <header className="portal-header">
        <div>
          <span className="portal-eyebrow">Ávila Ops</span>
          <h1>{empresa.nome}</h1>
          <p className="portal-muted">
            {ROTULO_STATUS_EMPRESA[empresa.status] ?? empresa.status} · cliente desde {formatShortDate(empresa.desde)}
          </p>
        </div>
        <form action="/api/auth/logout" method="post">
          <button type="submit" className="secondary-button">Sair</button>
        </form>
      </header>

      <nav className="portal-shortcuts" aria-label="Nesta página">
        <a href="#faturas">Faturas e pagamentos</a>
        <a href="#assinaturas">Assinaturas</a>
        <a href="#dominios">Domínios</a>
        <a href="#dados">Seus dados</a>
      </nav>

      <section className="portal-metrics">
        <div className="portal-metric">
          <small>Assinaturas ativas</small>
          {painel.recorrencia.length ? painel.recorrencia.map(r => (
            <div className="portal-metric-value" key={`${r.moeda}-${r.ciclo}`}><strong>{formatCurrency(r.valor, r.moeda)}</strong><span>{rotuloDoCiclo(r.ciclo)}</span></div>
          )) : <strong>nenhuma</strong>}
        </div>
        <div className="portal-metric">
          <small>Em aberto</small>
          {emAberto.length ? emAberto.map(t => (
            <div className="portal-metric-value" key={t.moeda}><strong>{formatCurrency(t.emAberto, t.moeda)}</strong>{t.vencido > 0 && <span className="portal-overdue">{formatCurrency(t.vencido, t.moeda)} vencidos</span>}</div>
          )) : <strong>Em dia</strong>}
          {emAberto.length > 0 && <a href="#faturas">Ver faturas →</a>}
        </div>
        <div className="portal-metric">
          <small>Entregas</small>
          <strong>{entregas.length}</strong>
        </div>
        <div className="portal-metric">
          <small>Implantação</small>
          <strong>{etapas.length ? `${etapasConcluidas}/${etapas.length}` : "a começar"}</strong>
          {etapas.length > 0 && <progress value={etapasConcluidas} max={etapas.length} aria-label="Etapas de implantação concluídas" />}
        </div>
      </section>

      {etapas.length > 0 && (
        <section className="portal-card">
          <h2>Onde estamos</h2>
          <ul className="portal-list">
            {etapas.map((etapa) => (
              <li key={etapa.rotulo}>
                <span>{etapa.rotulo}</span>
                <em>
                  {ROTULO_ETAPA[etapa.status] ?? etapa.status}
                  {etapa.concluidaEm ? ` · ${formatShortDate(etapa.concluidaEm)}` : etapa.prazo ? ` · até ${formatShortDate(etapa.prazo)}` : ""}
                </em>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="portal-card" id="assinaturas">
        <h2>Sua assinatura</h2>
        {assinaturas.length === 0 ? (
          <p className="portal-muted">Nenhuma assinatura registrada.</p>
        ) : (
          <ul className="portal-list">
            {assinaturas.map((a) => (
              <li key={a.id}>
                <span>{a.descricao}</span>
                <em>
                  {formatCurrency(a.valor, a.moeda)} · {rotuloDoCiclo(a.ciclo)}{a.ciclo === "MONTHLY" ? ` · dia ${a.diaDaCobranca}` : ""} · {a.status === "ACTIVE" ? "ativa" : a.status.toLowerCase()}
                </em>
              </li>
            ))}
          </ul>
        )}
      </section>

      <FaturasDoCliente
        pais={empresa.pais}
        iniciais={faturas.map((f) => ({
          id: f.id,
          descricao: f.descricao,
          competencia: f.competencia,
          tipo: f.tipo,
          valor: f.valor,
          saldo: f.saldo,
          moeda: f.moeda,
          vencimento: f.vencimento.toISOString().slice(0, 10),
          status: f.status,
          pagaEm: f.pagaEm?.toISOString() ?? null,
          cobranca: f.cobranca
            ? {
                metodo: f.cobranca.metodo,
                pixCopiaECola: f.cobranca.pixCopiaECola,
                boletoUrl: f.cobranca.boletoUrl,
                checkoutUrl: f.cobranca.checkoutUrl,
                expiraEm: f.cobranca.expiraEm?.toISOString() ?? null,
              }
            : null,
        }))}
      />

      <section className="portal-card" id="dominios">
        <h2>Seus domínios</h2>
        {dominios.length === 0 ? (
          <p className="portal-muted">Nenhum domínio sob nossa gestão.</p>
        ) : (
          <ul className="portal-list">
            {dominios.map((d) => (
              <li key={d.fqdn}>
                <span>{d.fqdn}</span>
                <em>
                  {d.expiraEm ? `renova em ${formatShortDate(d.expiraEm)}` : "sem data de renovação"}
                  {d.renovacaoAutomatica ? " · automático" : ""}
                </em>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="portal-card">
        <h2>Suas entregas</h2>
        {entregas.length === 0 ? (
          <p className="portal-muted">Nada entregue ainda.</p>
        ) : (
          <ul className="portal-list">
            {entregas.map((e) => (
              <li key={e.id}>
                <span>
                  <Link href={`/entrega/${e.token}`}>{e.titulo}</Link>
                </span>
                <em>
                  {ROTULO_ENTREGA[e.status] ?? e.status} · {formatCurrency(e.valor)} · {formatShortDate(e.criadoEm)}
                </em>
              </li>
            ))}
          </ul>
        )}
      </section>

      {equipe && (
        <EquipeDoCliente
          iniciais={equipe.map((u) => ({
            id: u.id,
            nome: u.nome,
            email: u.email,
            telefone: u.telefone,
            papel: u.papel,
            ativo: u.ativo,
            senhaProvisoria: u.senhaProvisoria,
            ultimoAcessoEm: u.ultimoAcessoEm?.toISOString() ?? null,
          }))}
        />
      )}

      <section className="portal-card" id="dados">
        <h2>Seus dados</h2>
        <ul className="portal-list">
          {empresa.razaoSocial && (
            <li><span>Razão social</span><em>{empresa.razaoSocial}</em></li>
          )}
          {empresa.documento && (
            <li><span>CNPJ/CPF</span><em>{empresa.documento}</em></li>
          )}
          {empresa.site && (
            <li><span>Site</span><em>{empresa.site}</em></li>
          )}
          {contatos.map((c) => (
            <li key={`${c.nome}-${c.email ?? ""}`}>
              <span>{c.principal ? "Contato principal" : "Contato"}</span>
              <em>{[c.nome, c.email, c.telefone].filter(Boolean).join(" · ")}</em>
            </li>
          ))}
        </ul>
        <p className="portal-muted">
          Precisa corrigir alguma informação? Responda o e-mail do seu atendimento que a gente ajusta.
        </p>
      </section>
    </main>
  );
}

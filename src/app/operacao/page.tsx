import Link from "next/link";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import CabecalhoTela from "@/components/sistema/CabecalhoTela";
import { Grupo, IconeTile, LinhaInfo, LinhaLink } from "@/components/sistema/Lista";
import Status from "@/components/sistema/Status";
import { Icone } from "@/components/ui/Icones";
import { getAdmin } from "@/lib/auth";
import { formatCurrency, formatShortDate, nomeProprio, saudacao } from "@/lib/format";
import { getOperationsDashboard } from "@/lib/operations";

export const dynamic = "force-dynamic";

function prazo(value: Date | null) {
  return value ? formatShortDate(value) : "Sem prazo";
}

/**
 * Visão central.
 *
 * Reescrita em 17/09/2026 na linguagem do sistema: uma superfície por assunto,
 * linha por informação, nada de seis cartões com zero dentro. A ordem responde
 * às perguntas do celular na mesma sequência em que elas aparecem — o que
 * precisa de mim, o que eu abro todo dia, como está a carteira.
 *
 * Todo número vem de `getOperationsDashboard()`; não há métrica de exemplo.
 * Quando não há o que mostrar, o bloco some ou diz que está vazio.
 */
export default async function OperationsPage() {
  const admin = await getAdmin();
  if (!admin) redirect("/login");
  const data = await getOperationsDashboard();
  const ehDono = admin.role === "OWNER";

  const atencao = [
    ...data.priorityTasks.map((task) => ({
      chave: `tarefa-${task.id}`,
      titulo: task.title,
      descricao: `${nomeProprio(task.organization.name)}${task.project ? ` · ${task.project.title}` : ""}`,
      status: task.status,
      quando: prazo(task.dueAt),
      href: task.project ? `/projetos/${task.project.id}` : `/clientes/${task.organization.id}`,
      icone: "entregas" as const,
    })),
    ...data.upcomingDomains.map((domain) => ({
      chave: `dominio-${domain.id}`,
      titulo: domain.fqdn,
      descricao: nomeProprio(domain.organization.name),
      status: "renewal_due",
      quando: prazo(domain.expiresAt),
      href: `/clientes/${domain.organization.id}`,
      icone: "dominios" as const,
    })),
  ];

  const resumo = [
    { label: "Clientes ativos", valor: data.metrics.organizationCount, detalhe: `${data.metrics.onboardingCount} em onboarding`, href: "/clientes", icone: "clientes" as const },
    { label: "Projetos abertos", valor: data.metrics.activeProjectCount, detalhe: "Planejamento, execução ou espera", href: "/projetos", icone: "entregas" as const },
    { label: "Tarefas abertas", valor: data.metrics.openTaskCount, detalhe: `${data.metrics.overdueTaskCount} vencidas`, href: "/projetos", icone: "operacao" as const },
    { label: "Aprovações", valor: data.metrics.pendingApprovalCount, detalhe: "Aguardando decisão", href: "/projetos", icone: "fiscal" as const },
    { label: "Leads abertos", valor: data.metrics.openLeadCount, detalhe: "Da entrada à proposta", href: "/leads", icone: "hub" as const },
    { label: "Domínios em 60 dias", valor: data.metrics.domainAttentionCount, detalhe: "Próximos do vencimento", href: "/hub-social/dominios", icone: "dominios" as const },
  ];

  // Atalhos: só destinos que existem e que esta pessoa pode abrir.
  const atalhos = [
    { href: "/clientes", label: "Clientes", icone: "clientes" as const, tom: "azul" as const },
    { href: "/projetos", label: "Entregas", icone: "entregas" as const, tom: "azul" as const },
    { href: "/hub-social/whatsapp", label: "WhatsApp", icone: "whatsapp" as const, tom: "vermelho" as const },
    ehDono
      ? { href: "/financeiro", label: "Financeiro", icone: "financeiro" as const, tom: "azul" as const }
      : { href: "/hub-social/seo", label: "SEO", icone: "seo" as const, tom: "amarelo" as const },
  ];

  return (
    <AppShell adminName={admin.nome} papel={admin.role} section="operations">
      <CabecalhoTela
        titulo={`${saudacao()}, ${admin.nome.split(" ")[0]}`}
        descricao={
          atencao.length
            ? `${atencao.length} ${atencao.length === 1 ? "item pede" : "itens pedem"} atenção hoje.`
            : "Nada vencendo agora."
        }
      />

      <div className="home-grid">
        <div className="pilha">
          <Grupo
            titulo="Atalhos"
          >
            <div className="atalhos">
              {atalhos.map((atalho) => (
                <Link className="atalho" href={atalho.href} key={atalho.href}>
                  <IconeTile nome={atalho.icone} tom={atalho.tom} />
                  <span>{atalho.label}</span>
                </Link>
              ))}
            </div>
          </Grupo>

          <Grupo titulo="Precisa de atenção">
            {atencao.length === 0 ? (
              <LinhaInfo
                titulo="Nada urgente por aqui"
                descricao="A fila mostra tarefas com prazo e domínios vencendo."
                icone="saude"
                tom="neutro"
              />
            ) : (
              atencao.map((item) => (
                <LinhaLink
                  key={item.chave}
                  href={item.href}
                  titulo={item.titulo}
                  descricao={item.descricao}
                  icone={item.icone}
                  tom={item.icone === "dominios" ? "amarelo" : "azul"}
                  valor={
                    <span className="linha-valor-composto">
                      <Status status={item.status} />
                      <time>{item.quando}</time>
                    </span>
                  }
                />
              ))
            )}
          </Grupo>

          <Grupo
            titulo="Clientes recentes"
            acao={
              <Link href="/clientes" className="text-link">
                Ver todos
              </Link>
            }
          >
            {data.recentOrganizations.length === 0 ? (
              <LinhaInfo
                titulo="A carteira ainda está vazia"
                descricao="Cadastre o primeiro cliente para iniciar o onboarding."
                icone="clientes"
                tom="neutro"
              />
            ) : (
              data.recentOrganizations.map((organization) => (
                <LinhaLink
                  key={organization.id}
                  href={`/clientes/${organization.id}`}
                  titulo={nomeProprio(organization.name)}
                  descricao={`${organization.segment ?? "Segmento não definido"} · ${organization._count.projects} projetos · ${organization._count.domains} domínios`}
                  icone="clientes"
                  valor={<Status status={organization.status} />}
                />
              ))
            )}
          </Grupo>
        </div>

        <div className="pilha">
          <Grupo titulo="Resumo">
            {resumo.map((item) => (
              <LinhaLink
                key={item.label}
                href={item.href}
                titulo={item.label}
                descricao={item.detalhe}
                icone={item.icone}
                valor={<strong className="linha-numero">{item.valor}</strong>}
              />
            ))}
          </Grupo>

          {ehDono ? (
            <Grupo titulo="Financeiro">
              <LinhaInfo
                titulo="Saldo disponível"
                descricao={data.latestBalance ? "Última captura da conta Efí" : "Sem captura da conta Efí ainda"}
                icone="financeiro"
                valor={
                  <strong className="linha-numero">
                    {data.latestBalance ? formatCurrency(data.latestBalance.availableBalance.toString()) : "—"}
                  </strong>
                }
              />
              <LinhaLink
                href="/financeiro?status=PENDING"
                titulo="Conciliações em atenção"
                descricao="Lançamentos esperando conferência"
                icone="fiscal"
                valor={<strong className="linha-numero">{data.metrics.financeAttentionCount}</strong>}
              />
              <LinhaLink href="/financeiro" titulo="Abrir controle financeiro" icone="credito" />
            </Grupo>
          ) : null}
        </div>
      </div>

      <p className="home-rodape">
        <Icone nome="saude" tamanho={14} /> Números lidos do banco a cada abertura desta tela.
      </p>
    </AppShell>
  );
}

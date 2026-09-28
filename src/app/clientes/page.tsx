import { redirect } from "next/navigation";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import CabecalhoTela from "@/components/sistema/CabecalhoTela";
import { contextoDaSecao } from "@/lib/navegacao";
import OrganizationForm from "@/components/OrganizationForm";
import { Icone } from "@/components/ui/Icones";
import { getAdmin } from "@/lib/auth";
import { nomeProprio } from "@/lib/format";
import { getOrganizations } from "@/lib/operations";

const statusLabels: Record<string, string> = {
  ACTIVE: "Ativo",
  ONBOARDING: "Onboarding",
  PAUSED: "Pausado",
  ARCHIVED: "Arquivado",
};

export default async function ClientsPage() {
  const admin = await getAdmin();
  if (!admin) redirect("/login");
  const organizations = await getOrganizations();

  return (
    <AppShell adminName={admin.nome} papel={admin.role} section="clients">
      <CabecalhoTela
        titulo="Clientes"
        descricao="Organizações, marcas e o que está aberto em cada uma."
        {...contextoDaSecao("clients")}
        acoes={
          <>
          <OrganizationForm />
          </>
        }
      />

      {/* Quatro números que antes viravam quatro linhas empilhadas no celular
          — 350px antes do primeiro cliente, quase todos zerados. Viram uma
          tira de quatro colunas: o mesmo dado, uma linha de altura. */}
      <section className="client-summary-strip">
        <span>
          <i>Organizações</i>
          <strong>{organizations.length}</strong>
        </span>
        <span>
          <i>Onboarding</i>
          <strong>
            {organizations.filter((item) => item.status === "ONBOARDING").length}
          </strong>
        </span>
        <span>
          <i>Marcas</i>
          <strong>
            {organizations.reduce((sum, item) => sum + item._count.brands, 0)}
          </strong>
        </span>
        <span>
          <i>Projetos</i>
          <strong>
            {organizations.reduce((sum, item) => sum + item._count.projects, 0)}
          </strong>
        </span>
      </section>

      <section className="operations-panel clients-panel">
        <div className="operations-panel-heading">
          <div>
            <h2>Organizações cadastradas</h2>
          </div>
        </div>

        {organizations.length === 0 ? (
          <div className="operations-empty clients-empty">
            <span className="empty-index">00</span>
            <strong>Nenhum cliente cadastrado.</strong>
          </div>
        ) : (
          <div className="clients-list">
            {organizations.map((organization, index) => {
              const nome = nomeProprio(organization.name);
              // `data-zero` é o que some no celular: numa carteira em que quase
              // todo contador está em 0, "M 0 P 0 T 0 D 2" era ruído ocupando o
              // espaço do nome. No desktop, onde a grade tem colunas fixas, os
              // quatro continuam visíveis para comparar um cliente com o outro.
              const sinais = [
                { rotulo: "Marcas", unidade: ["marca", "marcas"], valor: organization._count.brands },
                { rotulo: "Projetos", unidade: ["projeto", "projetos"], valor: organization._count.projects },
                { rotulo: "Tarefas", unidade: ["tarefa", "tarefas"], valor: organization._count.tasks },
                { rotulo: "Domínios", unidade: ["domínio", "domínios"], valor: organization._count.domains },
              ];
              return (
                <article className="client-row org-row" key={organization.id}>
                  <span className="client-index">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div className="client-identity">
                    <span>{nome.slice(0, 2).toLocaleUpperCase("pt-BR")}</span>
                    <div>
                      <Link className="client-name-link" href={`/clientes/${organization.id}`}>
                        {nome}
                      </Link>
                      {/* A razão social sai no celular: ela repete o nome com
                          mais palavras, e o espaço dela na segunda linha é o
                          que faz caber "3 projetos · 2 domínios" ali. */}
                      <small>
                        Nº {organization.clientNumber}
                        {(organization.legalName ?? organization.segment) ? (
                          <span className="client-legal">
                            {` · ${organization.legalName ?? organization.segment}`}
                          </span>
                        ) : null}
                      </small>
                    </div>
                  </div>
                  {/* O rótulo aparece por extenso e em minúscula no celular
                      ("3 projetos"), e volta a ser coluna de tabela no desktop.
                      A sigla de uma letra que existia aqui só era legível para
                      quem já sabia o que ela media. */}
                  <dl className="client-signals org-signals">
                    {sinais.map((sinal) => (
                      <div
                        key={sinal.rotulo}
                        data-unidade={sinal.unidade[sinal.valor === 1 ? 0 : 1]}
                        data-zero={sinal.valor === 0 ? "sim" : undefined}
                      >
                        <dt>{sinal.rotulo}</dt>
                        <dd>{sinal.valor}</dd>
                      </div>
                    ))}
                  </dl>
                  <span className={`status-pill status-${organization.status.toLowerCase()}`}>
                    {statusLabels[organization.status] ?? organization.status}
                  </span>
                  <Icone nome="chevron" tamanho={16} className="chevron" />
                </article>
              );
            })}
          </div>
        )}
      </section>
    </AppShell>
  );
}

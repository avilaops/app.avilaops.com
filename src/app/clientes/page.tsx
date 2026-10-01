import { redirect } from "next/navigation";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import AcoesCliente from "@/components/clientes/AcoesCliente";
import FiltroClientes from "@/components/clientes/FiltroClientes";
import CabecalhoTela from "@/components/sistema/CabecalhoTela";
import BadgeStatus from "@/components/sistema/Status";
import { contextoDaSecao } from "@/lib/navegacao";
import OrganizationForm from "@/components/OrganizationForm";
import { ehDono, getAdmin } from "@/lib/auth";
import { buscarClientes, lerFiltro, resumoDosClientes } from "@/lib/clientes-busca";
import { nomeProprio } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { listaDeSegmentos } from "@/lib/segmentos";

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const admin = await getAdmin();
  if (!admin) redirect("/login");
  const filtro = lerFiltro(await searchParams);
  const [resultado, resumo, segmentosEmUso] = await Promise.all([
    buscarClientes(filtro),
    resumoDosClientes(),
    // Segmento criado no cadastro de um cliente aparece para os próximos.
    prisma.organization.findMany({
      where: { segment: { not: null } },
      distinct: ["segment"],
      select: { segment: true },
    }),
  ]);
  const podeExcluir = ehDono(admin.role);
  const fim = resultado.inicio + resultado.itens.length - 1;

  function linkDaPagina(pagina: number) {
    const params = new URLSearchParams();
    if (filtro.q) params.set("q", filtro.q);
    if (filtro.status !== "abertos") params.set("status", filtro.status);
    if (filtro.ordem !== "nome") params.set("ordem", filtro.ordem);
    if (pagina > 1) params.set("pagina", String(pagina));
    const query = params.toString();
    return query ? `/clientes?${query}` : "/clientes";
  }

  return (
    <AppShell adminName={admin.nome} papel={admin.role} section="clients">
      <CabecalhoTela
        titulo="Clientes"
        descricao="Organizações, marcas e o que está aberto em cada uma."
        {...contextoDaSecao("clients")}
        acoes={<OrganizationForm segmentos={listaDeSegmentos(segmentosEmUso.map((o) => o.segment))} />}
      />

      {/* Contados no banco: somar na página exigia carregar a carteira inteira
          só para mostrar quatro números. */}
      <section className="client-summary-strip">
        <span>
          <i>Em aberto</i>
          <strong>{resumo.abertos}</strong>
        </span>
        <span>
          <i>Em implantação</i>
          <strong>{resumo.implantacao}</strong>
        </span>
        <span>
          <i>Marcas</i>
          <strong>{resumo.marcas}</strong>
        </span>
        <span>
          <i>Arquivados</i>
          <strong>{resumo.arquivados}</strong>
        </span>
      </section>

      <section className="operations-panel clients-panel">
        <FiltroClientes q={filtro.q} status={filtro.status} ordem={filtro.ordem} />

        <p className="lista-clientes-contagem" aria-live="polite">
          {resultado.total === 0
            ? "Nenhum cliente"
            : `${resultado.inicio.toLocaleString("pt-BR")}–${fim.toLocaleString("pt-BR")} de ${resultado.total.toLocaleString("pt-BR")} ${resultado.total === 1 ? "cliente" : "clientes"}`}
          {filtro.q ? <> para <strong>“{filtro.q}”</strong></> : null}
        </p>

        {resultado.total === 0 ? (
          <div className="operations-empty clients-empty">
            <strong>{filtro.q ? "Nada bate com essa busca." : "Nenhum cliente nesta situação."}</strong>
            <p>
              {filtro.status === "abertos"
                ? "Clientes arquivados não aparecem aqui. Troque o filtro para “Todos” para incluí-los."
                : "Troque o filtro de situação ou limpe a busca."}
            </p>
          </div>
        ) : (
          <ul className="lista-clientes">
            {resultado.itens.map((cliente) => {
              const nome = nomeProprio(cliente.name);
              const documento = formatarDocumento(cliente.cpfCnpj);
              const detalhe = [cliente.legalName, documento, cliente.segment].filter(Boolean).join(" · ");
              const sinais = [
                cliente._count.brands ? `${cliente._count.brands} ${cliente._count.brands === 1 ? "marca" : "marcas"}` : "",
                cliente._count.projects ? `${cliente._count.projects} ${cliente._count.projects === 1 ? "projeto" : "projetos"}` : "",
                cliente._count.domains ? `${cliente._count.domains} ${cliente._count.domains === 1 ? "domínio" : "domínios"}` : "",
                cliente._count.subscriptions ? `${cliente._count.subscriptions} ${cliente._count.subscriptions === 1 ? "assinatura" : "assinaturas"}` : "",
              ].filter(Boolean);
              return (
                <li key={cliente.id} className="linha-cliente">
                  <span className="linha-cliente-numero">{cliente.clientNumber}</span>
                  <div className="linha-cliente-identidade">
                    <Link href={`/clientes/${cliente.id}`} className="linha-cliente-nome">
                      {nome}
                    </Link>
                    <small>{detalhe || "Sem razão social nem documento"}</small>
                  </div>
                  <span className="linha-cliente-sinais">{sinais.join(" · ")}</span>
                  <BadgeStatus status={cliente.status} />
                  <AcoesCliente
                    id={cliente.id}
                    nome={cliente.name}
                    status={cliente.status}
                    podeExcluir={podeExcluir}
                  />
                </li>
              );
            })}
          </ul>
        )}

        {resultado.paginas > 1 ? (
          <nav className="paginacao-clientes" aria-label="Páginas">
            {resultado.pagina > 1 ? (
              <Link className="secondary-button" href={linkDaPagina(resultado.pagina - 1)} rel="prev">
                Anterior
              </Link>
            ) : (
              <span />
            )}
            <span>
              Página {resultado.pagina.toLocaleString("pt-BR")} de {resultado.paginas.toLocaleString("pt-BR")}
            </span>
            {resultado.pagina < resultado.paginas ? (
              <Link className="secondary-button" href={linkDaPagina(resultado.pagina + 1)} rel="next">
                Próxima
              </Link>
            ) : (
              <span />
            )}
          </nav>
        ) : null}
      </section>
    </AppShell>
  );
}

/** 33000167000101 → 33.000.167/0001-01; CPF idem. Outro formato sai como veio. */
function formatarDocumento(valor: string | null) {
  if (!valor) return "";
  if (/^\d{14}$/.test(valor)) return valor.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  if (/^\d{11}$/.test(valor)) return valor.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  return valor;
}

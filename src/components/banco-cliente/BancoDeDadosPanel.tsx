import Link from "next/link";
import AnotacaoBanco from "@/components/banco-cliente/AnotacaoBanco";
import BadgeStatus from "@/components/sistema/Status";
import EstadoVazio from "@/components/hub-social/EstadoVazio";
import ListaChaveValor from "@/components/hub-social/ListaChaveValor";
import GradeMetricas, { Metrica } from "@/components/hub-social/Metricas";
import TabelaResponsiva from "@/components/hub-social/TabelaResponsiva";
import { Button } from "@/components/shadcn/button";
import { Input } from "@/components/shadcn/input";
import { carregarCatalogo, preenchimento, type FiltroCatalogo } from "@/lib/banco-cliente";
import type { Evidencia } from "@/lib/evidencia";
import { frescor } from "@/lib/evidencia";

const numero = new Intl.NumberFormat("pt-BR");
const MOTOR: Record<string, string> = {
  SQLSERVER: "SQL Server",
  POSTGRES: "PostgreSQL",
  MYSQL: "MySQL",
  FIREBIRD: "Firebird",
  ORACLE: "Oracle",
  OUTRO: "Outro",
};

function endereco(clientId: string, params: Record<string, string | undefined>) {
  const query = new URLSearchParams({ section: "database" });
  for (const [chave, valor] of Object.entries(params)) if (valor) query.set(chave, valor);
  return `/clientes/${clientId}?${query}`;
}

export default async function BancoDeDadosPanel({ organizationId, filtro }: { organizationId: string; filtro: FiltroCatalogo }) {
  const catalogo = await carregarCatalogo(organizationId, filtro);

  if (!catalogo.banco) {
    return (
      <EstadoVazio
        titulo="Nenhum banco de dados catalogado"
        descricao="O Ávila OS não conecta no banco do cliente. A estrutura é lida por um script numa máquina com acesso à rede dele e enviada para cá."
        acao={<code className="rounded bg-muted px-2 py-1 text-[13px]">POST /api/organizations/{organizationId}/bancos/sync</code>}
      />
    );
  }

  const { banco, bancos, totais, tabelas, tabela, referenciadaPor } = catalogo;
  const sincronizadoEm = banco.lastSyncedAt?.toISOString() ?? null;
  const deTeste = banco.environment === "TEST";
  const base = { banco: banco.key };

  // Todo número daqui saiu da mesma leitura; o que muda é a fórmula.
  const evidencia = (rotulo: string, formula: string, bruto?: unknown): Evidencia => ({
    rotulo,
    origem: `${MOTOR[banco.engine] ?? banco.engine} · ${banco.databaseName} (INFORMATION_SCHEMA), copiado para operations.client_database_*`,
    funcao: "carregarCatalogo() em src/lib/banco-cliente.ts",
    formula,
    lidoEm: sincronizadoEm,
    gravadoEm: sincronizadoEm,
    referencia: banco.id,
    bruto,
    observacao: deTeste
      ? "Lido de uma cópia de teste: a estrutura vale, as contagens de linha não representam a operação."
      : undefined,
  });

  return (
    <div className="flex flex-col gap-6">
      {bancos.length > 1 ? (
        <nav aria-label="Bancos do cliente" className="flex flex-wrap gap-2">
          {bancos.map((item) => (
            <Button key={item.id} asChild size="sm" variant={item.id === banco.id ? "default" : "outline"}>
              <Link href={endereco(organizationId, { banco: item.key })}>{item.name}</Link>
            </Button>
          ))}
        </nav>
      ) : null}

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-[20px] font-semibold tracking-[-0.01em]">{banco.name}</h2>
          <BadgeStatus status={banco.environment} texto={deTeste ? "Base de teste" : "Produção"} tom={deTeste ? "atencao" : "bom"} />
        </div>
        {deTeste ? (
          <p className="max-w-[720px] text-sm leading-[1.5] text-muted-foreground">
            Esta estrutura foi lida de uma cópia de teste. Tabelas, colunas e relacionamentos valem para a produção;
            contagens de linha e estatísticas, não.
          </p>
        ) : null}
        {tabela ? null : <>
        <ListaChaveValor
          compacto
          itens={[
            { rotulo: "Motor", valor: [MOTOR[banco.engine] ?? banco.engine, banco.engineVersion].filter(Boolean).join(" · ") },
            { rotulo: "Servidor", valor: banco.host ? `${banco.host}${banco.port ? `,${banco.port}` : ""}` : null, mono: true, copiar: banco.host ? `${banco.host}${banco.port ? `,${banco.port}` : ""}` : undefined },
            { rotulo: "Base", valor: banco.databaseName, mono: true },
            { rotulo: "Sincronizado", valor: sincronizadoEm ? `${frescor(sincronizadoEm).texto}${banco.syncedFrom ? ` · de ${banco.syncedFrom}` : ""}` : null, vazio: "nunca" },
          ]}
        />
        {banco.accessNotes ? <p className="max-w-[720px] text-sm leading-[1.5] text-muted-foreground"><span className="font-medium text-foreground">Acesso:</span> {banco.accessNotes}</p> : null}
        </>}
      </section>

      {tabela ? null : <GradeMetricas rotulo="Tamanho do banco">
        <Metrica rotulo="Tabelas" valor={numero.format(totais.tabelas)} detalhe={`${numero.format(totais.tabelasComDados)} com dados`} evidencia={evidencia("Tabelas", "contagem de client_database_tables deste banco; 'com dados' = row_count > 0", { tabelas: totais.tabelas, comDados: totais.tabelasComDados })} />
        <Metrica rotulo="Colunas" valor={numero.format(totais.colunas)} evidencia={evidencia("Colunas", "contagem de client_database_columns das tabelas deste banco")} />
        <Metrica rotulo="Linhas" valor={numero.format(totais.linhas)} evidencia={evidencia("Linhas", "soma de row_count; cada row_count é a contagem que a origem informou na sincronização (no SQL Server, sys.partitions — exata fora de carga em andamento)")} />
        <Metrica rotulo="Relacionamentos" valor={numero.format(totais.chavesEstrangeiras)} detalhe="colunas com chave estrangeira" evidencia={evidencia("Relacionamentos", "colunas com references_table preenchido; só as FKs declaradas na origem — relação implícita por nome não conta")} />
        <Metrica rotulo="Colunas anotadas" valor={numero.format(totais.anotadas)} detalhe={`de ${numero.format(totais.colunas)} colunas`} evidencia={evidencia("Colunas anotadas", "colunas com description preenchido pela equipe")} />
      </GradeMetricas>}

      {tabela ? (
        <DetalheDaTabela
          organizationId={organizationId}
          base={base}
          tabela={tabela}
          referenciadaPor={referenciadaPor}
          ausenteDesde={banco.lastSyncedAt}
          evidencia={evidencia}
        />
      ) : (
        <section className="flex flex-col gap-4">
          <form action={`/clientes/${organizationId}`} method="get" className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="section" value="database" />
            <input type="hidden" name="banco" value={banco.key} />
            <Input name="q" defaultValue={filtro.q ?? ""} placeholder="Buscar tabela, coluna ou anotação" aria-label="Buscar no catálogo" className="max-w-[360px]" />
            <Button type="submit" size="sm">Buscar</Button>
            {filtro.q ? <Button asChild size="sm" variant="ghost"><Link href={endereco(organizationId, base)}>Limpar</Link></Button> : null}
          </form>

          {filtro.q ? (
            <p className="text-sm text-muted-foreground">
              {numero.format(tabelas.length)} {tabelas.length === 1 ? "tabela casa" : "tabelas casam"} com “{filtro.q}” no nome, na anotação ou em alguma coluna.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              {filtro.vazias
                ? <>Mostrando todas as {numero.format(totais.tabelas)} tabelas. <Link className="underline underline-offset-4" href={endereco(organizationId, base)}>Ocultar vazias</Link></>
                : <>{numero.format(totais.tabelas - totais.tabelasComDados)} tabelas vazias ocultas. <Link className="underline underline-offset-4" href={endereco(organizationId, { ...base, vazias: "1" })}>Mostrar todas</Link></>}
            </p>
          )}

          {tabelas.length ? (
            <TabelaResponsiva
              rotulo="Tabelas do banco"
              colunas={[
                { chave: "tabela", rotulo: "Tabela", principal: true, mono: true },
                { chave: "linhas", rotulo: "Linhas", alinhar: "direita", mono: true },
                { chave: "colunas", rotulo: "Colunas", alinhar: "direita", mono: true },
                { chave: "anotacao", rotulo: "Anotação" },
              ]}
              linhas={tabelas.map((item) => ({
                id: item.id,
                href: endereco(organizationId, { ...base, tabela: `${item.schemaName}.${item.name}` }),
                celulas: {
                  tabela: item.name,
                  linhas: item.rowCount === null ? null : numero.format(item.rowCount),
                  colunas: numero.format(item._count.columns),
                  anotacao: item.description,
                },
              }))}
            />
          ) : (
            <EstadoVazio compacto titulo="Nada encontrado" descricao="Nenhuma tabela, coluna ou anotação casa com a busca." acao={{ label: "Limpar busca", href: endereco(organizationId, base) }} />
          )}
        </section>
      )}
    </div>
  );
}

type Catalogo = Awaited<ReturnType<typeof carregarCatalogo>>;

function DetalheDaTabela({
  organizationId,
  base,
  tabela,
  referenciadaPor,
  ausenteDesde,
  evidencia,
}: {
  organizationId: string;
  base: { banco: string };
  tabela: NonNullable<Catalogo["tabela"]>;
  referenciadaPor: NonNullable<Catalogo["referenciadaPor"]>;
  ausenteDesde: Date | null;
  evidencia: (rotulo: string, formula: string, bruto?: unknown) => Evidencia;
}) {
  const sumiu = (vistoEm: Date) => Boolean(ausenteDesde && vistoEm < ausenteDesde);
  const temEstatistica = tabela.columns.some((c) => c.filledCount !== null);

  return (
    <section className="flex flex-col gap-4">
      <Link href={endereco(organizationId, base)} className="-ml-1 inline-flex min-h-11 items-center gap-1 px-1 text-[15px] text-primary min-[821px]:text-sm">
        <span aria-hidden="true">‹</span> Todas as tabelas
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="font-mono text-[18px] font-semibold">{tabela.schemaName}.{tabela.name}</h3>
        {sumiu(tabela.lastSeenAt) ? <BadgeStatus status="AUSENTE" texto="Ausente na origem" tom="ruim" titulo="Não veio na última sincronização; ficou por ter anotação." /> : null}
        <span className="text-sm text-muted-foreground">
          {tabela.rowCount === null ? "linhas não contadas" : `${numero.format(tabela.rowCount)} linhas`} · {numero.format(tabela.columns.length)} colunas
        </span>
      </div>
      <div className="max-w-[720px]">
        <AnotacaoBanco organizationId={organizationId} tipo="tabela" alvoId={tabela.id} nomeDoAlvo={tabela.name} inicial={tabela.description} />
      </div>

      <TabelaResponsiva
        rotulo={`Colunas de ${tabela.name}`}
        colunas={[
          { chave: "coluna", rotulo: "Coluna", principal: true, mono: true },
          { chave: "tipo", rotulo: "Tipo", mono: true },
          { chave: "referencia", rotulo: "Referência", mono: true },
          ...(temEstatistica
            ? [
                { chave: "preenchida", rotulo: "Preenchida", alinhar: "direita" as const, mono: true },
                { chave: "distintos", rotulo: "Distintos", alinhar: "direita" as const, mono: true },
                { chave: "faixa", rotulo: "Faixa", mono: true },
              ]
            : []),
          { chave: "anotacao", rotulo: "Anotação" },
        ]}
        linhas={tabela.columns.map((coluna) => {
          const percentual = preenchimento(coluna.filledCount, tabela.rowCount);
          return {
            id: coluna.id,
            evidencia: coluna.filledCount === null
              ? undefined
              : evidencia(`${tabela.name}.${coluna.name}`, "preenchida = linhas com valor (não nulo e, em texto, não vazio) ÷ linhas da tabela; distintos = COUNT(DISTINCT coluna); faixa = MIN e MAX, só em coluna numérica ou de data", {
                  linhas: tabela.rowCount?.toString() ?? null,
                  preenchidas: coluna.filledCount.toString(),
                  distintos: coluna.distinctCount?.toString() ?? null,
                  minimo: coluna.minValue,
                  maximo: coluna.maxValue,
                }),
            celulas: {
              coluna: (
                <span className="inline-flex flex-wrap items-center gap-2">
                  {coluna.name}
                  {coluna.isPrimaryKey ? <BadgeStatus status="PK" texto="PK" tom="info" titulo="Chave primária" /> : null}
                  {sumiu(coluna.lastSeenAt) ? <BadgeStatus status="AUSENTE" texto="Ausente" tom="ruim" titulo="Não veio na última sincronização; ficou por ter anotação." /> : null}
                </span>
              ),
              tipo: coluna.nullable ? coluna.dataType : `${coluna.dataType} NOT NULL`,
              referencia: coluna.referencesTable ? (
                <Link className="relative z-10 block max-w-[150px] break-all whitespace-normal underline underline-offset-4" href={endereco(organizationId, { ...base, tabela: coluna.referencesTable })}>
                  {coluna.referencesTable}.{coluna.referencesColumn}
                </Link>
              ) : null,
              preenchida: percentual === null ? null : `${percentual.toLocaleString("pt-BR")}%`,
              distintos: coluna.distinctCount === null ? null : numero.format(coluna.distinctCount),
              faixa: coluna.minValue !== null || coluna.maxValue !== null ? <span className="block max-w-[170px] whitespace-normal">{coluna.minValue ?? "?"} → {coluna.maxValue ?? "?"}</span> : null,
              anotacao: <AnotacaoBanco organizationId={organizationId} tipo="coluna" alvoId={coluna.id} nomeDoAlvo={`${tabela.name}.${coluna.name}`} inicial={coluna.description} />,
            },
          };
        })}
      />

      {referenciadaPor.length ? (
        <div className="flex flex-col gap-2">
          <h4 className="text-[15px] font-semibold">Quem aponta para {tabela.name}</h4>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[13px]">
            {referenciadaPor.map((origem) => (
              <li key={`${origem.table.name}.${origem.name}`}>
                <Link className="underline underline-offset-4" href={endereco(organizationId, { ...base, tabela: `${origem.table.schemaName}.${origem.table.name}` })}>
                  {origem.table.name}.{origem.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

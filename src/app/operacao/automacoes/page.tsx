import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import CabecalhoTela from "@/components/sistema/CabecalhoTela";
import { Grupo, LinhaInfo, LinhaLink } from "@/components/sistema/Lista";
import Status from "@/components/sistema/Status";
import { ehDono, getAdmin } from "@/lib/auth";
import { lerAutomacoes, quandoFoi } from "@/lib/n8n-operacao";

export const dynamic = "force-dynamic";

/**
 * Automações: o n8n dentro do painel.
 *
 * A tela antiga chamava-se "Automações" e mostrava só o cofre de credenciais —
 * quem entrava procurando fluxo não achava nada. Agora a visão geral responde
 * o que está ligado, o que rodou e o que falhou nas últimas 24 h; o cofre virou
 * uma tela abaixo desta, e as execuções ganharam a sua.
 *
 * Todo número vem da API do n8n. Sem chave ou sem resposta, a tela diz isso.
 */
export default async function AutomacoesPage() {
  const admin = await getAdmin();
  if (!admin) redirect("/login");
  // Chave de terceiro é do dono; o sócio nem vê o item no menu.
  if (!ehDono(admin.role)) redirect("/operacao");

  const dados = await lerAutomacoes();
  // A idade é contada a partir do instante da leitura, não do render.
  const agora = new Date(dados.lidoEm).getTime();
  const comFalha = dados.fluxos.filter((fluxo) => fluxo.falhas24h > 0);
  const ligados = dados.fluxos.filter((fluxo) => fluxo.ativo && fluxo.falhas24h === 0);
  const desligados = dados.fluxos.filter((fluxo) => !fluxo.ativo);

  return (
    <AppShell adminName={admin.nome} papel={admin.role} section="automacoes">
      <CabecalhoTela
        titulo="Automações"
        descricao="Os fluxos do n8n, o que eles rodaram e as credenciais que usam."
        icone="automacoes"
        acoes={
          <a className="secondary-button" href={dados.base.replace("/api/v1", "")} target="_blank" rel="noreferrer">
            Abrir o n8n
          </a>
        }
      />

      {!dados.conectado ? (
        <div className="pilha">
          <Grupo titulo="Sem conexão com o n8n">
            <LinhaInfo
              titulo="Não consegui ler os fluxos"
              descricao={dados.motivo ?? "Motivo não informado."}
              icone="automacoes"
              tom="neutro"
            />
            <LinhaInfo titulo="Endereço consultado" descricao={dados.base} icone="dominios" tom="neutro" />
          </Grupo>
        </div>
      ) : (
        <div className="pilha">
          <section className="servicos-resumo" aria-label="Resumo das automações">
            <div>
              <span>Fluxos ativos</span>
              <strong>{dados.totais.ativos}</strong>
            </div>
            <div>
              <span>Execuções em 24 h</span>
              <strong>{dados.totais.execucoes24h}</strong>
            </div>
            <div>
              <span>Falhas em 24 h</span>
              <strong>{dados.totais.falhas24h}</strong>
            </div>
            <div>
              <span>Fluxos com falha</span>
              <strong>{dados.totais.fluxosComFalha}</strong>
            </div>
          </section>

          <Grupo titulo="Atalhos">
            <LinhaLink
              href="/operacao/automacoes/execucoes"
              titulo="Execuções"
              descricao="Últimas rodadas, com erro em primeiro lugar"
              icone="operacao"
            />
            <LinhaLink
              href="/operacao/automacoes/credenciais"
              titulo="Credenciais do n8n"
              descricao="O que os fluxos usam para entrar em cada serviço"
              icone="config"
            />
            <LinhaLink
              href="/operacao/credenciais"
              titulo="Cofre da plataforma"
              descricao="Chaves das integrações do próprio app"
              icone="credito"
              tom="amarelo"
            />
          </Grupo>

          {comFalha.length > 0 ? (
            <Grupo titulo="Precisa de atenção">
              {comFalha.map((fluxo) => (
                <LinhaLink
                  key={fluxo.id}
                  href={`/operacao/automacoes/execucoes?fluxo=${fluxo.id}`}
                  titulo={fluxo.nome}
                  descricao={`${fluxo.falhas24h} de ${fluxo.execucoes24h} execuções falharam · última ${quandoFoi(fluxo.ultimaExecucao?.inicio ?? null, agora)}`}
                  icone="automacoes"
                  tom="vermelho"
                  valor={<Status status="error" />}
                />
              ))}
            </Grupo>
          ) : null}

          <Grupo titulo={`Ligados (${ligados.length})`}>
            {ligados.length === 0 ? (
              <LinhaInfo titulo="Nenhum fluxo ligado" descricao="Todos estão desativados no n8n." icone="automacoes" tom="neutro" />
            ) : (
              ligados.map((fluxo) => (
                <LinhaLink
                  key={fluxo.id}
                  href={`/operacao/automacoes/execucoes?fluxo=${fluxo.id}`}
                  titulo={fluxo.nome}
                  descricao={
                    fluxo.execucoes24h > 0
                      ? `${fluxo.execucoes24h} execuções em 24 h · última ${quandoFoi(fluxo.ultimaExecucao?.inicio ?? null, agora)}`
                      : `Sem execução nas últimas 24 h · última ${quandoFoi(fluxo.ultimaExecucao?.inicio ?? null, agora)}`
                  }
                  icone="automacoes"
                  valor={<Status status="active" />}
                />
              ))
            )}
          </Grupo>

          {desligados.length > 0 ? (
            <Grupo titulo={`Desligados (${desligados.length})`}>
              {desligados.map((fluxo) => (
                <LinhaLink
                  key={fluxo.id}
                  href={fluxo.url}
                  titulo={fluxo.nome}
                  descricao={`Última execução ${quandoFoi(fluxo.ultimaExecucao?.inicio ?? null, agora)}`}
                  icone="automacoes"
                  tom="neutro"
                  valor={<Status status="inactive" />}
                />
              ))}
            </Grupo>
          ) : null}

          <p className="home-rodape">
            Lido da API do n8n em {new Date(dados.lidoEm).toLocaleString("pt-BR")} · {dados.base}
          </p>
        </div>
      )}
    </AppShell>
  );
}

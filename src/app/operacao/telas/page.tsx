import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import CabecalhoPagina from "@/components/hub-social/CabecalhoPagina";
import EstadoVazio from "@/components/hub-social/EstadoVazio";
import GradeMetricas, { Metrica } from "@/components/hub-social/Metricas";
import { Grupo, LinhaDobravel, LinhaInfo } from "@/components/sistema/Lista";
import BadgeStatus from "@/components/sistema/Status";
import AcoesDaTela from "@/components/telas/AcoesDaTela";
import AcoesDoAgente from "@/components/telas/AcoesDoAgente";
import VincularTela from "@/components/telas/VincularTela";
import { ehDono, getAdmin } from "@/lib/auth";
import { AgenteIndisponivel, agenteConfigurado, lerPainelDeTelas } from "@/lib/avila-tv";
import { formatDateTime } from "@/lib/format";
import {
  alertasDaTela,
  aparelhosDoAgente,
  ehAgente,
  evidenciaDoAgente,
  descricaoDaTela,
  formatarDisponibilidade,
  formatarUptime,
  juntarTelasComSaude,
  minutosParaExpirar,
  ordenarTelas,
  resumirTelas,
  tomDaTela,
  versaoDaTela,
  versaoMaisNova,
  DIAS_PARA_ROTACIONAR,
  PISO_DISPONIBILIDADE,
  TETO_QUEDAS,
  type TelaNoPainel,
  type TomDaTela,
} from "@/lib/telas-painel";

/**
 * Telas (Ávila TV) — a parede de telas vista de longe.
 *
 * O painel do próprio agente (tv.avilaops.com) continua existindo e é onde se
 * mexe na TV da sala. Esta tela é a de operação: ela mora onde a equipe já
 * está o dia inteiro, entra pelo mesmo login e responde uma pergunta só —
 * **qual tela precisa de mim agora?**.
 *
 * Nada aqui é copiado para o banco. O agente é dono do estado das telas; se
 * ele estiver fora do ar, a página diz isso em vez de mostrar um retrato
 * velho como se fosse o agora.
 */
export const dynamic = "force-dynamic";

const JANELA_DIAS = 7;

const TOM_DO_BADGE: Record<TomDaTela, "bom" | "atencao" | "ruim" | "neutro"> = {
  azul: "bom",
  amarelo: "atencao",
  vermelho: "ruim",
  cinza: "neutro",
};

function rotuloDoEstado(tela: TelaNoPainel): string {
  if (tela.revogadoEm) return "Revogada";
  return tela.estado === "online" ? "No ar" : "Sem pulso";
}

/** Agente e tela chegam pela mesma conexão; o ícone é o que separa os dois. */
function iconeDaTela(tela: TelaNoPainel) {
  return ehAgente(tela) ? ("infra" as const) : ("telas" as const);
}

/**
 * Um par rótulo/valor da ficha que abre junto com a linha.
 *
 * É a forma que `LinhaDobravel` espera: cada `<div>` vira uma célula da grade
 * que se ajusta à largura (`.linha-dobra`). Campo vazio continua aparecendo —
 * "nada no ar" informa; a ausência da linha só deixa a pessoa em dúvida se
 * perguntou errado.
 */
function Campo({ rotulo, valor, vazio = "—", mono = false }: { rotulo: string; valor?: string | number | null; vazio?: string; mono?: boolean }) {
  const vago = valor === null || valor === undefined || valor === "";
  return (
    <div>
      <span className="rotulo">{rotulo}</span>
      <span className={`valor${mono ? " font-mono" : ""}`}>{vago ? vazio : valor}</span>
    </div>
  );
}

/** A ficha da tela: o que o operador precisa para decidir o que fazer. */
function FichaDaTela({ tela, origensPadrao }: { tela: TelaNoPainel; origensPadrao: string[] }) {
  const s = tela.saude;
  const heranca = tela.origens.length ? "própria" : origensPadrao.length ? "herdada do agente" : "nenhuma";
  return (
    <>
      {ehAgente(tela) ? (
        <Campo rotulo="Aparelhos na LAN" valor={aparelhosDoAgente(tela).length || null} vazio="nenhum declarado" />
      ) : (
        <Campo rotulo="Exibindo" valor={tela.estado === "online" ? tela.pulso?.exibindo : null} vazio="nada no ar" />
      )}
      <Campo rotulo="No ar sem reiniciar" valor={formatarUptime(tela.pulso?.uptime_s)} />
      <Campo rotulo="Cliente" valor={tela.cliente ? `${tela.cliente.tipo} ${versaoDaTela(tela) ?? tela.cliente.versao}` : null} vazio="não anunciou" />
      <Campo rotulo="Memória" valor={tela.pulso?.memoria_mb ? `${tela.pulso.memoria_mb} MB` : null} />
      <Campo
        rotulo={`Disponibilidade (${JANELA_DIAS} d)`}
        valor={s?.amostras ? formatarDisponibilidade(s.disponibilidade) : null}
        vazio="ainda sem amostra"
      />
      <Campo
        rotulo={`Quedas (${JANELA_DIAS} d)`}
        valor={s?.amostras ? (s.quedas ? `${s.quedas} · maior parada ${s.maiorQuedaMin} min` : "nenhuma") : null}
      />
      <Campo rotulo="Pico de memória" valor={s?.memoriaPicoMb ? `${s.memoriaPicoMb} MB` : null} />
      <Campo rotulo="Visto pela última vez" valor={tela.vistoEm ? formatDateTime(tela.vistoEm) : null} vazio="nunca" />
      <Campo rotulo="Vinculada em" valor={formatDateTime(tela.criadoEm)} />
      <Campo rotulo="Token trocado em" valor={formatDateTime(tela.tokenTrocadoEm)} />
      <Campo rotulo="Identificador" valor={tela.id} mono />
      {ehAgente(tela) ? (
        /* Um agente não abre endereço nenhum: o que vale mostrar é o que ele
           alcança. Esta é a lista que o pulso dele carrega, e é ela que prova
           que a LAN do cliente está visível daqui sem túnel. */
        <div className="dobra-largura">
          <span className="rotulo">A LAN que este agente alcança</span>
          <span className="valor">
            {aparelhosDoAgente(tela).length
              ? aparelhosDoAgente(tela).map((a) => `${a.id} (${a.tipo})`).join(" · ")
              : "o agente ainda não declarou nenhum aparelho"}
          </span>
        </div>
      ) : (
        <div className="dobra-largura">
          <span className="rotulo">Allowlist do comando exibir ({heranca})</span>
          <span className="valor">
            {tela.origensEfetivas.length ? tela.origensEfetivas.join(" · ") : "nenhuma: exibir vai recusar qualquer endereço"}
          </span>
        </div>
      )}
    </>
  );
}

export default async function TelasPage() {
  const admin = await getAdmin();
  if (!admin) redirect("/login");

  const cabecalho = (meta?: string) => (
    <CabecalhoPagina
      eyebrow="ÁVILA TV"
      titulo="Telas"
      subtitulo="As telas que discam para cá pelo Ávila Link: quem está no ar, quem caiu e quem está esperando um nome."
      meta={meta}
    />
  );

  if (!agenteConfigurado()) {
    return (
      <AppShell adminName={admin.nome} papel={admin.role} section="telas">
        {cabecalho()}
        <EstadoVazio
          titulo="Este ambiente não fala com o agente"
          descricao="Falta AVILA_TV_API_KEY (e, fora de produção, AVILA_TV_API_URL). Sem a chave o painel não lê nem comanda tela nenhuma, e isso é proposital: a chave abre a operação inteira das telas."
        />
      </AppShell>
    );
  }

  let painel: Awaited<ReturnType<typeof lerPainelDeTelas>>;
  try {
    painel = await lerPainelDeTelas(JANELA_DIAS);
  } catch (erro) {
    // Agente fora do ar não é erro desta página: ele mora num PC atrás de
    // túnel. Mostrar o que aconteceu vale mais que uma tela de erro genérica.
    const motivo = erro instanceof AgenteIndisponivel ? erro.message : "Não consegui falar com o agente Ávila TV.";
    return (
      <AppShell adminName={admin.nome} papel={admin.role} section="telas">
        {cabecalho()}
        <EstadoVazio
          titulo="O agente não respondeu"
          descricao={`${motivo} As telas continuam exibindo o que já estava nelas; o agente só é necessário para comandar e para medir.`}
        />
      </AppShell>
    );
  }

  const agora = new Date(painel.lidoEm);
  const telas = ordenarTelas(juntarTelasComSaude(painel.link, painel.saude), agora);
  const pendentes = painel.link.pendentes;
  const resumo = resumirTelas(telas, pendentes, agora);
  const maisNova = versaoMaisNova(telas);
  // Revogar é irreversível e a rota recusa quem não é o dono: o botão some
  // para o sócio, em vez de oferecer uma porta que vai dizer não.
  const podeRevogar = ehDono(admin.role);
  // Sem a saúde, "ainda sem amostra" seria mentira: a amostra pode existir e
  // só a leitura dela ter falhado. A página diz qual dos dois é.
  const semSaude = painel.saude === null;

  return (
    <AppShell adminName={admin.nome} papel={admin.role} section="telas">
      {cabecalho(`lido às ${formatDateTime(painel.lidoEm)}`)}

      <GradeMetricas rotulo="Resumo das telas">
        <Metrica
          rotulo="No ar"
          valor={`${resumo.online}/${resumo.total}`}
          detalhe={resumo.revogadas ? `${resumo.revogadas} revogada(s)` : undefined}
          tom={resumo.offline ? "ruim" : "bom"}
          destaque
          evidencia={evidenciaDoAgente("No ar", {
            caminho: "GET /api/link",
            lidoEm: painel.lidoEm,
            formula: "telas não revogadas com estado online, sobre o total de não revogadas. O gateway marca offline depois de 2 min sem pulso.",
            bruto: painel.link.telas.map((t) => ({ id: t.id, nome: t.nome, estado: t.estado, revogadoEm: t.revogadoEm, pulsoEm: t.pulsoEm })),
          })}
        />
        <Metrica
          rotulo="Pedindo atenção"
          valor={resumo.pedindoAtencao}
          detalhe={resumo.aguardando ? `${resumo.aguardando} esperando nome` : undefined}
          tom={resumo.pedindoAtencao ? "atencao" : "bom"}
          evidencia={evidenciaDoAgente("Pedindo atenção", {
            caminho: "GET /api/link + GET /api/link/saude",
            lidoEm: painel.lidoEm,
            formula: `telas ativas com pelo menos um alerta: sem pulso, comando que falhou, disponibilidade abaixo de ${PISO_DISPONIBILIDADE}%, mais de ${TETO_QUEDAS} quedas, sem allowlist, versão atrás das outras ou token com mais de ${DIAS_PARA_ROTACIONAR} dias.`,
            bruto: telas.filter((t) => !t.revogadoEm).map((t) => ({ nome: t.nome, alertas: alertasDaTela(t, agora, maisNova) })),
          })}
        />
        <Metrica
          rotulo={`Disponibilidade (${JANELA_DIAS} d)`}
          valor={resumo.disponibilidade === null ? "—" : formatarDisponibilidade(resumo.disponibilidade)}
          detalhe={semSaude ? "o agente não devolveu a saúde" : resumo.disponibilidade === null ? "ainda sem amostra" : "média das telas ativas"}
          tom={resumo.disponibilidade !== null && resumo.disponibilidade < PISO_DISPONIBILIDADE ? "atencao" : "neutro"}
          evidencia={evidenciaDoAgente(`Disponibilidade (${JANELA_DIAS} d)`, {
            caminho: `GET /api/link/saude?dias=${JANELA_DIAS}`,
            lidoEm: painel.lidoEm,
            formula: `média simples da disponibilidade das telas ativas que já têm amostra. Cada tela vale o mesmo, independente de há quanto tempo existe. O agente amostra cada tela a cada ${(painel.saude?.amostra_s ?? 60) / 60} min.`,
            bruto: painel.saude?.telas ?? null,
          })}
        />
        <Metrica
          rotulo={`Quedas (${JANELA_DIAS} d)`}
          // Zero quedas sem a leitura de saúde seria número inventado.
          valor={semSaude ? "—" : resumo.quedas}
          detalhe={semSaude ? "o agente não devolveu a saúde" : "somadas"}
          tom={!semSaude && resumo.quedas ? "atencao" : "neutro"}
          evidencia={evidenciaDoAgente(`Quedas (${JANELA_DIAS} d)`, {
            caminho: `GET /api/link/saude?dias=${JANELA_DIAS}`,
            lidoEm: painel.lidoEm,
            formula: "soma das quedas de todas as telas ativas. Uma queda é uma transição de online para offline entre duas amostras de um minuto. Piscada mais curta que os 2 min do protocolo não vira queda.",
            bruto: (painel.saude?.telas ?? []).map((t) => ({ dispositivo: t.dispositivo, quedas: t.quedas, maiorQuedaMin: t.maiorQuedaMin, ultimaQuedaEm: t.ultimaQuedaEm })),
          })}
        />
      </GradeMetricas>

      {pendentes.length > 0 && (
        <Grupo titulo="Esperando um nome">
          {pendentes.map((p) => {
            const minutos = minutosParaExpirar(p, agora);
            return (
              <LinhaDobravel
                key={p.codigo}
                titulo={p.codigo}
                icone="telas"
                tom="amarelo"
                descricao={`${p.cliente ? `${p.cliente.tipo} ${p.cliente.versao}` : "cliente desconhecido"} · ${p.ip}`}
                valor={<BadgeStatus status="aguardando" texto={minutos ? `expira em ${minutos} min` : "expirando"} tom="atencao" />}
              >
                <Campo rotulo="Resolução" valor={p.tela?.largura ? `${p.tela.largura}×${p.tela.altura}` : null} vazio="não informada" />
                <Campo rotulo="Sistema" valor={p.so} vazio="não informado" />
                <Campo rotulo="Esperando desde" valor={formatDateTime(p.desde)} />
                <Campo rotulo="Endereço de onde conectou" valor={p.ip} mono />
                <div className="dobra-largura">
                  <div className="dobra-acoes">
                    <VincularTela
                      codigo={p.codigo}
                      dica={`Confira que o código ${p.codigo} é o que está aparecendo na tela antes de vincular: aprovar o código errado entrega o controle da tela de outra pessoa.`}
                    />
                  </div>
                </div>
              </LinhaDobravel>
            );
          })}
        </Grupo>
      )}

      <Grupo titulo="Telas e agentes vinculados">
        {telas.length === 0 ? (
          <LinhaInfo
            titulo="Nenhuma tela vinculada"
            descricao="Abra tv.avilaops.com/tela no navegador do aparelho: ele mostra um código de 6 letras e ele aparece aqui para aprovação."
            icone="telas"
            tom="neutro"
          />
        ) : (
          telas.map((tela) => {
            const alertas = alertasDaTela(tela, agora, maisNova);
            const tom = tomDaTela(tela, agora, maisNova);
            return (
              <LinhaDobravel
                key={tela.id}
                titulo={tela.nome}
                icone={iconeDaTela(tela)}
                tom={tom === "cinza" ? "neutro" : tom === "vermelho" ? "vermelho" : tom === "amarelo" ? "amarelo" : "azul"}
                descricao={descricaoDaTela(tela)}
                valor={<BadgeStatus status={tela.estado} texto={rotuloDoEstado(tela)} tom={TOM_DO_BADGE[tom]} />}
              >
                {alertas.length > 0 && (
                  <div className="dobra-largura">
                    <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                      {alertas.map((a) => (
                        <li key={a.texto} className="flex items-center gap-2 text-[13px] leading-snug">
                          <BadgeStatus
                            status={a.gravidade}
                            texto={a.gravidade === "erro" ? "agora" : "olhar"}
                            tom={a.gravidade === "erro" ? "ruim" : "atencao"}
                          />
                          {a.texto}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <FichaDaTela tela={tela} origensPadrao={painel.link.origens_padrao} />

                {!tela.revogadoEm && (
                  <div className="dobra-largura">
                    {ehAgente(tela) ? (
                      /* Recarregar e avisar são comandos de tela. Num agente
                         eles voltariam `comando_desconhecido`, e oferecer um
                         botão que sempre falha é pior que não oferecer. */
                      <AcoesDoAgente id={tela.id} nome={tela.nome} podeRevogar={podeRevogar} />
                    ) : (
                      <AcoesDaTela id={tela.id} nome={tela.nome} online={tela.estado === "online"} podeRevogar={podeRevogar} />
                    )}
                  </div>
                )}
              </LinhaDobravel>
            );
          })
        )}
      </Grupo>
    </AppShell>
  );
}

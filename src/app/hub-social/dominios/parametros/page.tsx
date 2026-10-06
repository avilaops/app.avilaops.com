import Link from "next/link";
import { redirect } from "next/navigation";
import CabecalhoPagina from "@/components/hub-social/CabecalhoPagina";
import EstadoVazio from "@/components/hub-social/EstadoVazio";
import ListaChaveValor from "@/components/hub-social/ListaChaveValor";
import TabelaResponsiva from "@/components/hub-social/TabelaResponsiva";
import { CartaoLista, MensagemErro } from "@/components/hub-social/comum";
import NovaVersaoParametro from "@/components/dominios/NovaVersaoParametro";
import BadgeStatus from "@/components/sistema/Status";
import { BASE } from "@/components/dominios/dados";
import { nomesDosAtores } from "@/lib/atores";
import { ehDono, getAdmin } from "@/lib/auth";
import { carregarVersoes, dataDoEvento } from "@/lib/parametros";
import { CAMADAS, valorEmTexto, type EstadoParametro, type TipoDeValor } from "@/lib/parametros/catalogo";
import { dataBr, montarPainel, ROTULO_CAMADA, ROTULO_ESTADO, type ParametroNaTela, type VersaoNaTela } from "@/lib/parametros/painel";
import type { Evidencia } from "@/lib/evidencia";

export const metadata = {
  title: "Políticas e prazos | Domínios",
  description: "Prazos, limites e listas que decidem algo sobre domínio, com fonte, dono e vigência.",
};

const AQUI = `${BASE}/parametros`;

const TOM_ESTADO: Record<EstadoParametro, "bom" | "atencao" | "neutro"> = {
  VIGENTE: "bom",
  PENDENTE_DE_CONFIRMACAO: "atencao",
  MONITORADA: "neutro",
};

const DICA: Record<TipoDeValor, string> = {
  inteiro: "Um número inteiro.",
  listaDeInteiros: "Números separados por vírgula: 30, 7, 1.",
  intervalo: "Mínimo e máximo: 26 a 35.",
  booleano: "sim ou não.",
};

function valorParaDigitar(tipo: TipoDeValor, valor: unknown): string {
  if (tipo === "intervalo" && valor && typeof valor === "object") {
    const i = valor as { min: number; max: number };
    return `${i.min} a ${i.max}`;
  }
  return valorEmTexto(tipo, valor);
}

function evidenciaDo(p: ParametroNaTela, hoje: string): Evidencia {
  const versao = p.hoje.tipo === "ausente" ? null : p.hoje.versao;
  return {
    rotulo: p.definicao.chave,
    origem: "operations.policy_parameter_versions (Postgres)",
    funcao: "resolver() em src/lib/parametros/resolver.ts",
    formula:
      "Versão de maior 'vigente desde' até hoje, no escopo global, pela data de São Paulo. Pendente não decide; monitorada não é lida.",
    lidoEm: new Date().toISOString(),
    gravadoEm: versao?.registradaEm ?? null,
    referencia: versao?.id ?? null,
    bruto: { hoje, versoes: p.versoes },
    observacao: versao?.nota ?? (p.hoje.tipo === "ausente" ? "Nenhuma versão em vigor hoje." : undefined),
  };
}

function Estado({ estado }: { estado: EstadoParametro | null }) {
  if (!estado) return <BadgeStatus status="AUSENTE" texto="Sem valor" tom="ruim" />;
  return (
    <BadgeStatus
      status={estado}
      texto={ROTULO_ESTADO[estado]}
      tom={TOM_ESTADO[estado]}
      titulo={estado === "PENDENTE_DE_CONFIRMACAO" ? "Pendente de confirmação: não decide nada" : undefined}
    />
  );
}

export default async function ParametrosPage({ searchParams }: { searchParams: Promise<{ chave?: string }> }) {
  const admin = await getAdmin();
  if (!admin) redirect("/login");

  const { chave } = await searchParams;
  const hoje = dataDoEvento(new Date());
  const painel = montarPainel(await carregarVersoes(), hoje);

  if (chave) {
    const p = painel.find((item) => item.definicao.chave === chave);
    if (!p) {
      return (
        <div className="space-y-6">
          <CabecalhoPagina eyebrow="Domínios" titulo="Parâmetro não encontrado" voltar={{ href: AQUI, label: "Políticas e prazos" }} />
          <EstadoVazio titulo="Esta chave não existe no catálogo" descricao={chave} acao={{ label: "Ver todos", href: AQUI }} />
        </div>
      );
    }
    return <Detalhe p={p} hoje={hoje} podeRegistrar={ehDono(admin.role)} />;
  }

  const pendentes = painel.filter((p) => p.hoje.tipo === "pendente").length;
  const conflitos = painel.flatMap((p) => p.conflitos);

  return (
    <div className="space-y-6">
      <CabecalhoPagina
        eyebrow="Domínios"
        titulo="Políticas e prazos"
        subtitulo="Todo prazo, limite ou lista que decide algo sobre domínio, com fonte, dono e data de vigência. O sistema usa a versão em vigor na data de cada evento."
        voltar={{ href: BASE, label: "Domínios" }}
      />

      {conflitos.length ? (
        <MensagemErro>
          {conflitos.length === 1 ? "Uma política do produto contraria" : `${conflitos.length} políticas do produto contrariam`}{" "}
          regra externa: {conflitos.map((c) => `${c.chave} (${c.escopo}, a partir de ${dataBr(c.data)})`).join("; ")}.
        </MensagemErro>
      ) : null}

      {pendentes ? (
        <p className="text-[15px] text-muted-foreground">
          {pendentes === 1 ? "Um parâmetro está pendente" : `${pendentes} parâmetros estão pendentes`} de confirmação. Pendente
          não decide nada: o caso que depender dele vai para a operação.
        </p>
      ) : null}

      {CAMADAS.map((camada) => {
        const daCamada = painel.filter((p) => p.definicao.camada === camada);
        if (!daCamada.length) return null;
        return (
          <CartaoLista key={camada} titulo={ROTULO_CAMADA[camada]}>
            <TabelaResponsiva
              rotulo={ROTULO_CAMADA[camada]}
              colunas={[
                { chave: "chave", rotulo: "Parâmetro", principal: true },
                { chave: "valor", rotulo: "Hoje", mono: true },
                { chave: "estado", rotulo: "Estado" },
                { chave: "desde", rotulo: "Desde" },
                { chave: "fonte", rotulo: "Fonte" },
              ]}
              linhas={daCamada.map((p) => {
                const versao = p.hoje.tipo === "ausente" ? null : p.hoje.versao;
                return {
                  id: p.definicao.chave,
                  href: `${AQUI}?chave=${encodeURIComponent(p.definicao.chave)}`,
                  evidencia: evidenciaDo(p, hoje),
                  celulas: {
                    chave: (
                      <span className="block min-w-0 whitespace-normal">
                        <span className="block font-mono text-[13px] break-all">{p.definicao.chave}</span>
                        <span className="mt-0.5 block text-[13px] text-muted-foreground">{p.definicao.descricao}</span>
                      </span>
                    ),
                    valor: p.valorHoje ? `${p.valorHoje}` : "—",
                    estado: <Estado estado={versao?.estado ?? null} />,
                    desde: dataBr(versao?.vigenteDesde ?? null) ?? "—",
                    fonte: versao?.fontes.join(", ") || "—",
                  },
                };
              })}
            />
          </CartaoLista>
        );
      })}
    </div>
  );
}

async function Detalhe({ p, hoje, podeRegistrar }: { p: ParametroNaTela; hoje: string; podeRegistrar: boolean }) {
  const versao = p.hoje.tipo === "ausente" ? null : p.hoje.versao;
  const nome = await nomesDosAtores(p.versoes.map((v) => v.quem), { mascararCasa: false });
  const quem = (v: VersaoNaTela) => (v.quem ? nome(v.quem, "conta removida") : "semente da migração");

  return (
    <div className="space-y-6">
      <CabecalhoPagina
        eyebrow={ROTULO_CAMADA[p.definicao.camada]}
        // Chave longa sem espaço estourava o título no celular: quebra nos pontos.
        titulo={p.definicao.chave.replaceAll(".", ".\u200b")}
        subtitulo={p.definicao.descricao}
        voltar={{ href: AQUI, label: "Políticas e prazos" }}
      />

      {p.conflitos.map((c) => (
        <MensagemErro key={`${c.escopo}-${c.data}`}>
          No escopo {c.escopo}, a partir de {dataBr(c.data)}: {c.problema}
        </MensagemErro>
      ))}

      <ListaChaveValor
        titulo="Hoje, no escopo global"
        itens={[
          { rotulo: "Valor", valor: p.valorHoje ? `${p.valorHoje} (${p.definicao.unidade})` : null, vazio: "nenhuma versão em vigor" },
          { rotulo: "Estado", valor: <Estado estado={versao?.estado ?? null} /> },
          { rotulo: "Vigente desde", valor: dataBr(versao?.vigenteDesde ?? null) },
          { rotulo: "Revisar em", valor: dataBr(versao?.revisarEm ?? null) },
          { rotulo: "Fonte", valor: versao?.fontes.join(", ") },
          { rotulo: "Dono", valor: versao?.dono },
          { rotulo: "Nota", valor: versao?.nota },
          { rotulo: "Usado em", valor: p.definicao.usadoEm.join("; ") },
          { rotulo: "Versão", valor: versao?.id, mono: true, copiar: versao?.id },
        ]}
      />

      <CartaoLista titulo="Histórico" descricao="Toda versão já registrada. Nenhuma é alterada ou apagada: cada evento usa a da sua data.">
        <TabelaResponsiva
          rotulo="Histórico do parâmetro"
          colunas={[
            { chave: "valor", rotulo: "Valor", principal: true, mono: true },
            { chave: "escopo", rotulo: "Escopo", mono: true },
            { chave: "estado", rotulo: "Estado" },
            { chave: "vigencia", rotulo: "Vigência" },
            { chave: "quem", rotulo: "Registrada" },
          ]}
          linhas={p.versoes.map((v) => ({
            id: v.id,
            evidencia: {
              rotulo: `Versão de ${p.definicao.chave}`,
              origem: "operations.policy_parameter_versions (Postgres)",
              gravadoEm: v.registradaEm,
              referencia: v.id,
              bruto: v,
              observacao: v.nota ?? undefined,
            },
            celulas: {
              valor: valorEmTexto(p.definicao.tipo, v.valor),
              escopo: v.escopo,
              estado: (
                <span className="flex flex-wrap gap-1">
                  <Estado estado={v.estado} />
                  {v.emVigorHoje ? <BadgeStatus status="EM_VIGOR" texto="Em vigor hoje" tom="info" /> : null}
                  {v.agendada ? <BadgeStatus status="AGENDADA" texto="Agendada" tom="neutro" /> : null}
                </span>
              ),
              vigencia: `${dataBr(v.vigenteDesde)}${v.vigenteAte ? ` a ${dataBr(v.vigenteAte)}` : " em diante"}`,
              quem: `${quem(v)}, ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(v.registradaEm))}`,
            },
          }))}
        />
      </CartaoLista>

      {podeRegistrar ? (
        <NovaVersaoParametro
          inicial={{
            chave: p.definicao.chave,
            valor: versao ? valorParaDigitar(p.definicao.tipo, versao.valor) : "",
            unidade: p.definicao.unidade,
            dica: DICA[p.definicao.tipo],
            estado: versao?.estado ?? "VIGENTE",
            fontes: versao?.fontes.join(", ") ?? "",
            dono: versao?.dono ?? "Dono do serviço",
            hoje,
            atual: p.valorHoje ? `${p.valorHoje} (${versao ? ROTULO_ESTADO[versao.estado].toLowerCase() : ""})` : null,
          }}
        />
      ) : (
        <p className="text-[13px] text-muted-foreground">
          Só o dono do serviço registra versão nova. <Link href={AQUI}>Voltar à lista</Link>.
        </p>
      )}
    </div>
  );
}

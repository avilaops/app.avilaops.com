"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import BadgeStatus from "@/components/sistema/Status";
import CabecalhoPagina from "@/components/hub-social/CabecalhoPagina";
import EstadoVazio from "@/components/hub-social/EstadoVazio";
import BotaoEvidencia from "@/components/hub-social/FolhaEvidencia";
import GradeMetricas, { Metrica } from "@/components/hub-social/Metricas";
import { Button } from "@/components/shadcn/button";
import Segmented from "@/components/ui/Segmented";
import Sheet from "@/components/ui/Sheet";
import { DIMENSOES, TEMPLATES, templatePorId, type Formato } from "@/lib/estudio/templates";
import { ROTULO_STATUS, type PecaDTO, type StatusRender } from "@/lib/estudio/tipos";
import type { TomStatus } from "@/lib/status-rotulos";
import { cn } from "@/lib/utils";

const FORMATOS = (Object.keys(DIMENSOES) as Formato[]).map((f) => [f, f] as const);

const ORIGEM = "listarPecas() em src/lib/estudio/servidor.ts";

/** Status do render mais recente → tom do badge. "SEM_RENDER" é a peça que nunca foi à fila. */
const TOM_POR_STATUS: Record<StatusRender, TomStatus> = {
  DONE: "bom",
  FAILED: "ruim",
  RUNNING: "info",
  PENDING: "info",
};

const STATUS_EM_ANDAMENTO: StatusRender[] = ["PENDING", "RUNNING"];

type Filtro = "TODAS" | StatusRender | "SEM_RENDER";

const OPCOES_FILTRO: { valor: Filtro; rotulo: string }[] = [
  { valor: "TODAS", rotulo: "Todas" },
  ...(Object.keys(ROTULO_STATUS) as StatusRender[]).map((s) => ({ valor: s, rotulo: ROTULO_STATUS[s] })),
  { valor: "SEM_RENDER", rotulo: "Sem renderização" },
];

function dataCurta(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function ultimoRender(p: PecaDTO) {
  return p.renders[0];
}

function passaNoFiltro(p: PecaDTO, filtro: Filtro) {
  if (filtro === "TODAS") return true;
  const ultimo = ultimoRender(p);
  if (filtro === "SEM_RENDER") return !ultimo;
  return ultimo?.status === filtro;
}

export type ClienteResumo = { id: string; nome: string };

export default function EstudioLista({
  pecas,
  clientes,
  lidoEm,
}: {
  pecas: PecaDTO[];
  clientes: ClienteResumo[];
  lidoEm: string;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [templateId, setTemplateId] = useState(TEMPLATES[0].id);
  const [formato, setFormato] = useState<Formato>("9:16");
  const [titulo, setTitulo] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [criando, setCriando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("TODAS");

  const resumo = useMemo(() => {
    const porStatus: Record<StatusRender | "SEM_RENDER", number> = { PENDING: 0, RUNNING: 0, DONE: 0, FAILED: 0, SEM_RENDER: 0 };
    for (const p of pecas) {
      const ultimo = ultimoRender(p);
      porStatus[ultimo ? ultimo.status : "SEM_RENDER"] += 1;
    }
    return {
      total: pecas.length,
      prontas: porStatus.DONE,
      emRenderizacao: STATUS_EM_ANDAMENTO.reduce((soma, s) => soma + porStatus[s], 0),
      comErro: porStatus.FAILED,
      porStatus,
    };
  }, [pecas]);

  const visiveis = useMemo(() => pecas.filter((p) => passaNoFiltro(p, filtro)), [pecas, filtro]);

  const bruto = { total: resumo.total, porStatus: resumo.porStatus };

  async function criar() {
    setCriando(true);
    setErro(null);
    try {
      const r = await fetch("/api/estudio/pecas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId, formato, titulo, organizationId: clienteId || null }),
      });
      const dados = await r.json();
      if (!r.ok) throw new Error(dados.error ?? "Não deu para criar a peça.");
      router.push(`/hub-social/estudio/${dados.peca.id}`);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não deu para criar a peça.");
      setCriando(false);
    }
  }

  const botaoNovaPeca = (
    <Button type="button" onClick={() => setAberto(true)} className="min-h-11 px-5 text-[15px] min-[821px]:min-h-9 min-[821px]:text-sm">
      Nova peça
    </Button>
  );

  return (
    <section className="flex flex-col gap-6">
      <CabecalhoPagina
        titulo="Estúdio"
        subtitulo="Peças de vídeo e imagem para as redes e o mural, montadas a partir dos templates da casa."
        acoes={botaoNovaPeca}
      />

      <GradeMetricas rotulo="Resumo das peças">
        <Metrica
          rotulo="Peças"
          valor={resumo.total}
          evidencia={{
            rotulo: "Peças",
            origem: ORIGEM,
            formula: "total de peças devolvidas por listarPecas()",
            lidoEm,
            bruto,
          }}
        />
        <Metrica
          rotulo="Prontas"
          valor={resumo.prontas}
          tom="bom"
          evidencia={{
            rotulo: "Prontas",
            origem: ORIGEM,
            formula: "peças cujo render mais recente (renders[0]) tem status DONE",
            lidoEm,
            bruto,
          }}
        />
        <Metrica
          rotulo="Em renderização"
          valor={resumo.emRenderizacao}
          tom="neutro"
          evidencia={{
            rotulo: "Em renderização",
            origem: ORIGEM,
            formula: "peças cujo render mais recente (renders[0]) tem status PENDING ou RUNNING",
            lidoEm,
            bruto,
          }}
        />
        <Metrica
          rotulo="Com erro"
          valor={resumo.comErro}
          tom={resumo.comErro > 0 ? "ruim" : "neutro"}
          evidencia={{
            rotulo: "Com erro",
            origem: ORIGEM,
            formula: "peças cujo render mais recente (renders[0]) tem status FAILED",
            lidoEm,
            bruto,
          }}
        />
      </GradeMetricas>

      {pecas.length === 0 ? (
        <EstadoVazio
          titulo="Nenhuma peça ainda."
          descricao="Crie a primeira a partir de um template da casa."
          acao={
            <Button type="button" onClick={() => setAberto(true)} className="min-h-11 w-full px-5 text-[15px] min-[821px]:min-h-10 min-[821px]:text-sm">
              Nova peça
            </Button>
          }
        />
      ) : (
        <>
          <div role="group" aria-label="Filtrar por status" className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {OPCOES_FILTRO.map((o) => {
              const ativo = o.valor === filtro;
              return (
                <button
                  key={o.valor}
                  type="button"
                  aria-pressed={ativo}
                  onClick={() => setFiltro(o.valor)}
                  className={cn(
                    "inline-flex h-9 shrink-0 items-center rounded-full px-4 text-[14px] font-medium whitespace-nowrap transition-transform duration-[60ms] active:scale-[0.985] motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                    ativo ? "bg-primary text-primary-foreground" : "bg-muted text-foreground hover:bg-accent",
                  )}
                >
                  {o.rotulo}
                </button>
              );
            })}
          </div>

          {visiveis.length === 0 ? (
            <EstadoVazio
              compacto
              titulo="Nenhuma peça com esse status."
              acao={
                <Button type="button" variant="outline" onClick={() => setFiltro("TODAS")} className="min-h-11 w-full px-5 text-[15px] min-[821px]:min-h-10 min-[821px]:text-sm">
                  Ver todas
                </Button>
              }
            />
          ) : (
            <ul className="m-0 list-none overflow-hidden rounded-2xl border border-border bg-card p-0">
              {visiveis.map((p) => {
                const t = templatePorId(p.templateId);
                const ultimo = ultimoRender(p);
                const badge = (
                  <BadgeStatus
                    status={ultimo?.status}
                    texto={ultimo ? ROTULO_STATUS[ultimo.status] : "Sem renderização"}
                    tom={ultimo ? TOM_POR_STATUS[ultimo.status] : "neutro"}
                  />
                );
                return (
                  <li
                    key={p.id}
                    className="relative flex min-h-14 items-center gap-3 border-b border-border px-4 py-2 transition-transform duration-[60ms] hover:bg-accent active:scale-[0.985] motion-reduce:transition-none motion-reduce:active:scale-100 last:border-b-0 has-[a:focus-visible]:ring-[3px] has-[a:focus-visible]:ring-ring/50 has-[a:focus-visible]:ring-inset"
                  >
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/hub-social/estudio/${p.id}`}
                        className="block truncate text-[15px] font-medium text-foreground no-underline outline-none after:absolute after:inset-0 after:content-['']"
                      >
                        {p.titulo}
                      </Link>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted-foreground">
                        <span className="truncate">
                          {p.cliente?.nome ?? "Ávila Ops"} · {t?.nome ?? p.templateId} · {p.formato}
                          {ultimo ? ` · ${dataCurta(ultimo.criadoEm)}` : ""}
                        </span>
                        <span className="min-[561px]:hidden">{badge}</span>
                      </div>
                    </div>
                    <span className="max-[560px]:hidden">{badge}</span>
                    <span className="relative z-10 -my-2 -mr-2">
                      <BotaoEvidencia
                        rotulo={`Evidência de ${p.titulo}`}
                        evidencia={{
                          rotulo: p.titulo,
                          origem: "peça + render mais recente (listarPecas)",
                          referencia: p.id,
                          gravadoEm: ultimo?.criadoEm,
                          bruto: { peca: p },
                        }}
                      />
                    </span>
                    <span aria-hidden="true" className="text-lg leading-none text-muted-foreground">
                      ›
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      {aberto && (
        <Sheet
          titulo="Nova peça"
          aoFechar={() => !criando && setAberto(false)}
          rodape={
            <Button type="button" onClick={criar} disabled={criando} className="min-h-[50px] w-full px-5 text-[15px] min-[821px]:min-h-10 min-[821px]:text-sm">
              {criando ? "Criando…" : "Criar e editar"}
            </Button>
          }
        >
          <div className="estudio-templates">
            {TEMPLATES.map((t) => (
              <label key={t.id} className={`estudio-template-card${t.id === templateId ? " ativo" : ""}`}>
                <input type="radio" name="template" value={t.id} checked={t.id === templateId} onChange={() => setTemplateId(t.id)} />
                <strong>{t.nome}</strong>
                <span className="estudio-tipo">{t.tipo === "video" ? "vídeo" : "imagem"}</span>
                <small>{t.descricao}</small>
              </label>
            ))}
          </div>
          <label className="field">
            <span>Cliente</span>
            <select value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
              <option value="">Ávila Ops (peça da casa)</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
            <small className="estudio-ajuda">
              {clienteId
                ? "A peça sai com a logo e as cores do cadastro de identidade do cliente."
                : "Sem cliente, a peça sai com a marca da casa."}
            </small>
          </label>
          <label className="field">
            <span>Título (interno)</span>
            <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder={templatePorId(templateId)?.nome} maxLength={120} />
          </label>
          <div className="field">
            <span>Formato</span>
            <Segmented opcoes={FORMATOS} valor={formato} aoMudar={setFormato} rotulo="Formato" />
            <small className="estudio-ajuda">{DIMENSOES[formato].rotulo} · {DIMENSOES[formato].largura}×{DIMENSOES[formato].altura}</small>
          </div>
          {erro && <p role="alert" className="text-[15px] text-[color:var(--red)]">{erro}</p>}
        </Sheet>
      )}
    </section>
  );
}

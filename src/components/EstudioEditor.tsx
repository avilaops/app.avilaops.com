"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Segmented from "@/components/ui/Segmented";
import { DIMENSOES, MARCA_PADRAO, templatePorId, type Campo, type Formato } from "@/lib/estudio/templates";
import { ROTULO_STATUS, TRILHA_PADRAO, type PecaDTO, type RenderDTO } from "@/lib/estudio/tipos";

const FORMATOS = (Object.keys(DIMENSOES) as Formato[]).map((f) => [f, f] as const);

function tamanho(bytes: number | null) {
  if (!bytes) return "";
  return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} kB`;
}

function quando(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function EstudioEditor({ pecaInicial }: { pecaInicial: PecaDTO }) {
  const [peca, setPeca] = useState<PecaDTO>(pecaInicial);
  const [sujo, setSujo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [logAberto, setLogAberto] = useState<string | null>(null);
  const template = templatePorId(peca.templateId);
  const video = template?.tipo === "video";
  const duracao = video ? peca.duracao ?? template?.duracaoPadrao ?? 5 : 0;

  /* ---------- pré-visualização ---------- */
  const html = useMemo(
    () => (template ? template.html(peca.valores, peca.formato, MARCA_PADRAO, duracao) : "<p>template desconhecido</p>"),
    [template, peca.valores, peca.formato, duracao],
  );
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const caixaRef = useRef<HTMLDivElement>(null);
  const [escala, setEscala] = useState(0.3);
  const [tempo, setTempo] = useState(0);
  const [tocando, setTocando] = useState(false);
  const dims = DIMENSOES[peca.formato];

  useEffect(() => {
    const caixa = caixaRef.current;
    if (!caixa) return;
    const medir = () => setEscala(Math.min(1, caixa.clientWidth / dims.largura));
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(caixa);
    return () => ro.disconnect();
  }, [dims.largura]);

  const aplicarTempo = useCallback((t: number) => {
    const w = iframeRef.current?.contentWindow as (Window & { render?: (t: number) => void }) | null;
    w?.render?.(t);
  }, []);

  useEffect(() => {
    if (!tocando) return;
    let inicio = performance.now() - tempo * 1000;
    let quadro = 0;
    const passo = (agora: number) => {
      let t = (agora - inicio) / 1000;
      if (t >= duracao) { t = 0; inicio = agora; }
      setTempo(t);
      aplicarTempo(t);
      quadro = requestAnimationFrame(passo);
    };
    quadro = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(quadro);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tocando, duracao, aplicarTempo]);

  /* ---------- edição ---------- */
  const mudar = (parcial: Partial<PecaDTO>) => { setPeca((p) => ({ ...p, ...parcial })); setSujo(true); };
  const mudarValor = (chave: string, valor: string) => mudar({ valores: { ...peca.valores, [chave]: valor } });

  async function salvar(): Promise<PecaDTO | null> {
    setSalvando(true);
    setAviso(null);
    try {
      const r = await fetch(`/api/estudio/pecas/${peca.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titulo: peca.titulo, formato: peca.formato, valores: peca.valores, duracao: peca.duracao, narracao: peca.narracao, trilha: peca.trilha }),
      });
      const dados = await r.json();
      if (!r.ok) throw new Error(dados.error ?? "Não deu para salvar.");
      setPeca(dados.peca);
      setSujo(false);
      return dados.peca as PecaDTO;
    } catch (e) {
      setAviso(e instanceof Error ? e.message : "Não deu para salvar.");
      return null;
    } finally {
      setSalvando(false);
    }
  }

  async function renderizar() {
    const salva = sujo ? await salvar() : peca;
    if (!salva) return;
    const r = await fetch(`/api/estudio/pecas/${peca.id}/renderizar`, { method: "POST" });
    const dados = await r.json();
    if (!r.ok) { setAviso(dados.error ?? "Não deu para pôr na fila."); return; }
    setPeca((p) => ({ ...p, renders: [dados.render as RenderDTO, ...p.renders] }));
  }

  async function enviarImagem(chave: string, arquivo: File) {
    const form = new FormData();
    form.set("file", arquivo);
    const r = await fetch("/api/estudio/imagens", { method: "POST", body: form });
    const dados = await r.json();
    if (!r.ok) { setAviso(dados.error ?? "Não deu para enviar a imagem."); return; }
    mudarValor(chave, dados.url);
  }

  /* ---------- acompanhar a fila ---------- */
  const emAndamento = peca.renders.some((r) => r.status === "PENDING" || r.status === "RUNNING");
  useEffect(() => {
    if (!emAndamento) return;
    const id = setInterval(async () => {
      const r = await fetch(`/api/estudio/pecas/${peca.id}`, { cache: "no-store" });
      if (!r.ok) return;
      const dados = await r.json();
      setPeca((p) => ({ ...p, renders: (dados.peca as PecaDTO).renders }));
    }, 4000);
    return () => clearInterval(id);
  }, [emAndamento, peca.id]);

  if (!template) return <p className="estudio-erro">Template &quot;{peca.templateId}&quot; não existe mais.</p>;

  return (
    <div className="estudio-editor">
      <header className="page-header estudio-cabecalho">
        <div>
          <Link href="/hub-social/estudio" className="estudio-voltar">‹ Estúdio</Link>
          <input className="estudio-titulo" value={peca.titulo} onChange={(e) => mudar({ titulo: e.target.value })} maxLength={120} aria-label="Título da peça" />
          <p>{template.nome} · {video ? "vídeo" : "imagem"} · {dims.largura}×{dims.altura}</p>
        </div>
        <div className="estudio-botoes">
          <button type="button" className="secondary-button" onClick={salvar} disabled={salvando || !sujo}>{salvando ? "Salvando…" : sujo ? "Salvar" : "Salvo"}</button>
          <button type="button" className="primary-button" onClick={renderizar} disabled={salvando || emAndamento}>{emAndamento ? "Na fila…" : video ? "Renderizar vídeo" : "Gerar imagem"}</button>
        </div>
      </header>
      {aviso && <p className="estudio-erro">{aviso}</p>}

      <div className="estudio-colunas">
        <section className="estudio-preview-col">
          <div ref={caixaRef} className="estudio-preview" style={{ height: dims.altura * escala }}>
            <iframe
              ref={iframeRef}
              title="Pré-visualização"
              srcDoc={html}
              sandbox="allow-scripts allow-same-origin"
              style={{ width: dims.largura, height: dims.altura, transform: `scale(${escala})`, transformOrigin: "top left" }}
              onLoad={() => aplicarTempo(tempo)}
            />
          </div>
          {video && (
            <div className="estudio-player">
              <button type="button" className="secondary-button" onClick={() => setTocando((v) => !v)}>{tocando ? "Pausar" : "Tocar"}</button>
              <input type="range" min={0} max={duracao} step={1 / 24} value={tempo} onChange={(e) => { const t = Number(e.target.value); setTocando(false); setTempo(t); aplicarTempo(t); }} aria-label="Tempo" />
              <span className="estudio-tempo">{tempo.toFixed(2)}s / {duracao.toFixed(1)}s</span>
            </div>
          )}
        </section>

        <section className="estudio-campos">
          <div className="field">
            <span>Formato</span>
            <Segmented opcoes={FORMATOS} valor={peca.formato} aoMudar={(f) => mudar({ formato: f })} rotulo="Formato" />
            <small className="estudio-ajuda">{dims.rotulo}</small>
          </div>

          {template.campos.map((c) => (
            <CampoEditor key={c.chave} campo={c} valor={peca.valores[c.chave] ?? ""} aoMudar={(v) => mudarValor(c.chave, v)} aoEnviarImagem={(f) => enviarImagem(c.chave, f)} />
          ))}

          {video && (
            <>
              <label className="field">
                <span>Duração (segundos)</span>
                <input type="number" min={1} max={60} step={0.5} value={peca.duracao ?? ""} onChange={(e) => mudar({ duracao: Number(e.target.value) || null })} />
              </label>
              <label className="field estudio-check">
                <input type="checkbox" checked={peca.narracao} onChange={(e) => mudar({ narracao: e.target.checked })} />
                <span>Narrar com a voz Kokoro (PT-BR, {peca.voz})</span>
              </label>
              <label className="field estudio-check">
                <input type="checkbox" checked={peca.trilha !== null} onChange={(e) => mudar({ trilha: e.target.checked ? TRILHA_PADRAO : null })} />
                <span>Trilha de fundo gerada por código</span>
              </label>
              {peca.trilha && (
                <div className="field-grid estudio-trilha">
                  <label className="field"><span>BPM</span><input type="number" min={60} max={180} value={peca.trilha.bpm} onChange={(e) => mudar({ trilha: { ...peca.trilha!, bpm: Number(e.target.value) } })} /></label>
                  <label className="field"><span>Variação</span><input type="number" min={0} value={peca.trilha.semente} onChange={(e) => mudar({ trilha: { ...peca.trilha!, semente: Number(e.target.value) } })} /></label>
                  <label className="field"><span>Volume (dB)</span><input type="number" min={-30} max={0} value={peca.trilha.db} onChange={(e) => mudar({ trilha: { ...peca.trilha!, db: Number(e.target.value) } })} /></label>
                </div>
              )}
            </>
          )}
        </section>
      </div>

      <section className="estudio-renders">
        <h2>Renderizações</h2>
        {peca.renders.length === 0 ? (
          <p className="estudio-vazio">Nada renderizado ainda. Ajuste a peça e clique em {video ? "Renderizar vídeo" : "Gerar imagem"}.</p>
        ) : (
          <ul className="ios-list">
            {peca.renders.map((r) => (
              <li key={r.id} className="estudio-render-row">
                <div className="ios-row">
                  <div className="ios-row-label">
                    <strong>{r.tipo === "video" ? "Vídeo" : "Imagem"} {r.largura}×{r.altura} · <span className={`estudio-status ${r.status.toLowerCase()}`}>{ROTULO_STATUS[r.status]}</span></strong>
                    <small>{quando(r.criadoEm)}{r.tamanho ? ` · ${tamanho(r.tamanho)}` : ""}</small>
                  </div>
                  <div className="estudio-render-acoes">
                    {r.arquivoUrl && <a className="row-action" href={`${r.arquivoUrl}?baixar=1`}>Baixar</a>}
                    {r.log && <button type="button" className="row-action" onClick={() => setLogAberto(logAberto === r.id ? null : r.id)}>Log</button>}
                  </div>
                </div>
                {r.arquivoUrl && r.status === "DONE" && (
                  <div className="estudio-resultado">
                    {r.tipo === "video" ? <video src={r.arquivoUrl} controls playsInline preload="metadata" /> : <img src={r.arquivoUrl} alt="" />}
                  </div>
                )}
                {logAberto === r.id && r.log && <pre className="estudio-log">{r.log}</pre>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function CampoEditor({ campo, valor, aoMudar, aoEnviarImagem }: { campo: Campo; valor: string; aoMudar: (v: string) => void; aoEnviarImagem: (f: File) => void }) {
  const arquivoRef = useRef<HTMLInputElement>(null);
  return (
    <label className="field">
      <span>{campo.rotulo}</span>
      {campo.tipo === "textoLongo" && <textarea rows={3} value={valor} onChange={(e) => aoMudar(e.target.value)} />}
      {campo.tipo === "texto" && <input value={valor} onChange={(e) => aoMudar(e.target.value)} />}
      {campo.tipo === "numero" && <input type="number" value={valor} onChange={(e) => aoMudar(e.target.value)} />}
      {campo.tipo === "cor" && (
        <span className="estudio-cor">
          <input type="color" value={/^#[0-9a-f]{6}$/i.test(valor) ? valor : "#ffffff"} onChange={(e) => aoMudar(e.target.value)} aria-label={`${campo.rotulo} (seletor)`} />
          <input value={valor} onChange={(e) => aoMudar(e.target.value)} />
        </span>
      )}
      {campo.tipo === "opcao" && (
        <select className="field-select" value={valor} onChange={(e) => aoMudar(e.target.value)}>
          {campo.opcoes?.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
        </select>
      )}
      {campo.tipo === "imagem" && (
        <span className="estudio-imagem">
          <input value={valor} onChange={(e) => aoMudar(e.target.value)} placeholder="/api/estudio/imagens/… ou URL" />
          <button type="button" className="secondary-button" onClick={() => arquivoRef.current?.click()}>Enviar</button>
          <input ref={arquivoRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) aoEnviarImagem(f); e.target.value = ""; }} />
        </span>
      )}
      {campo.ajuda && <small className="estudio-ajuda">{campo.ajuda}</small>}
    </label>
  );
}

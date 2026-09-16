"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Sheet from "@/components/ui/Sheet";
import Segmented from "@/components/ui/Segmented";
import { DIMENSOES, TEMPLATES, templatePorId, type Formato } from "@/lib/estudio/templates";
import { ROTULO_STATUS, type PecaDTO } from "@/lib/estudio/tipos";

const FORMATOS = (Object.keys(DIMENSOES) as Formato[]).map((f) => [f, f] as const);

function dataCurta(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export default function EstudioLista({ pecas }: { pecas: PecaDTO[] }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [templateId, setTemplateId] = useState(TEMPLATES[0].id);
  const [formato, setFormato] = useState<Formato>("9:16");
  const [titulo, setTitulo] = useState("");
  const [criando, setCriando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function criar() {
    setCriando(true);
    setErro(null);
    try {
      const r = await fetch("/api/estudio/pecas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId, formato, titulo }),
      });
      const dados = await r.json();
      if (!r.ok) throw new Error(dados.error ?? "Não deu para criar a peça.");
      router.push(`/hub-social/estudio/${dados.peca.id}`);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não deu para criar a peça.");
      setCriando(false);
    }
  }

  return (
    <section className="estudio-lista">
      <div className="estudio-acoes">
        <button type="button" className="primary-button" onClick={() => setAberto(true)}>Nova peça</button>
      </div>

      {pecas.length === 0 ? (
        <p className="estudio-vazio">Nenhuma peça ainda. Crie a primeira a partir de um template.</p>
      ) : (
        <ul className="ios-list">
          {pecas.map((p) => {
            const t = templatePorId(p.templateId);
            const ultimo = p.renders[0];
            return (
              <li key={p.id}>
                <Link href={`/hub-social/estudio/${p.id}`} className="ios-row">
                  <div className="ios-row-label">
                    <strong>{p.titulo}</strong>
                    <small>
                      {t?.nome ?? p.templateId} · {p.formato}
                      {ultimo ? ` · ${ROTULO_STATUS[ultimo.status]} ${dataCurta(ultimo.criadoEm)}` : " · sem renderização"}
                    </small>
                  </div>
                  <span className="chevron" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {aberto && (
        <Sheet
          titulo="Nova peça"
          aoFechar={() => !criando && setAberto(false)}
          rodape={
            <button type="button" className="primary-button" onClick={criar} disabled={criando}>
              {criando ? "Criando…" : "Criar e editar"}
            </button>
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
            <span>Título (interno)</span>
            <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder={templatePorId(templateId)?.nome} maxLength={120} />
          </label>
          <div className="field">
            <span>Formato</span>
            <Segmented opcoes={FORMATOS} valor={formato} aoMudar={setFormato} rotulo="Formato" />
            <small className="estudio-ajuda">{DIMENSOES[formato].rotulo} · {DIMENSOES[formato].largura}×{DIMENSOES[formato].altura}</small>
          </div>
          {erro && <p className="estudio-erro">{erro}</p>}
        </Sheet>
      )}
    </section>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Mídia do projeto: lista o que já subiu, aceita arquivo novo e remove.
 *
 * A miniatura só é montada para imagem. PDF e vídeo aparecem como linha com
 * link: renderizar um PDF de 20 MB dentro da lista para mostrar a primeira
 * página custa a página inteira do usuário e entrega quase nada.
 */

export type ArquivoDoProjeto = {
  id: string;
  name: string;
  kind: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
};

const ROTULO_TIPO: Record<string, string> = {
  imagem: "Imagem",
  pdf: "PDF",
  video: "Vídeo",
  outro: "Arquivo",
};

function tamanhoLegivel(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ProjectMedia({
  projectId,
  arquivosIniciais,
}: {
  projectId: string;
  arquivosIniciais: ArquivoDoProjeto[];
}) {
  const router = useRouter();
  const [arquivos, setArquivos] = useState(arquivosIniciais);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  async function enviar(lista: FileList | null) {
    if (!lista || lista.length === 0) return;

    setErro("");
    setEnviando(true);
    try {
      const pacote = new FormData();
      for (const arquivo of Array.from(lista)) pacote.append("file", arquivo);

      const resposta = await fetch(`/api/projects/${projectId}/arquivos`, {
        method: "POST",
        body: pacote,
      });
      const dados = (await resposta.json()) as {
        arquivos?: ArquivoDoProjeto[];
        error?: string;
      };
      if (!resposta.ok) throw new Error(dados.error ?? "Não foi possível enviar.");

      setArquivos((atual) => [...(dados.arquivos ?? []), ...atual]);
      router.refresh();
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : "Não foi possível enviar.");
    } finally {
      setEnviando(false);
    }
  }

  async function remover(id: string) {
    setErro("");
    try {
      const resposta = await fetch(`/api/projects/${projectId}/arquivos/${id}`, {
        method: "DELETE",
      });
      if (!resposta.ok) {
        const dados = (await resposta.json().catch(() => null)) as { error?: string } | null;
        throw new Error(dados?.error ?? "Não foi possível remover.");
      }
      setArquivos((atual) => atual.filter((arquivo) => arquivo.id !== id));
      router.refresh();
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : "Não foi possível remover.");
    }
  }

  return (
    <div className="projeto-midia">
      <label className="projeto-midia-envio">
        <input
          type="file"
          multiple
          disabled={enviando}
          accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml,application/pdf,video/mp4,video/webm"
          onChange={(evento) => {
            void enviar(evento.target.files);
            evento.target.value = "";
          }}
        />
        <small>{enviando ? "Enviando…" : "Imagem, PDF, MP4 ou WebM. Até 25 MB cada."}</small>
      </label>

      {erro ? <p className="inline-feedback feedback-error">{erro}</p> : null}

      {arquivos.length === 0 ? (
        <div className="operations-empty compact-empty">
          <strong>Nenhuma mídia neste projeto.</strong>
          <p>Suba a arte, o PDF do contrato ou o vídeo da entrega.</p>
        </div>
      ) : (
        <ul className="projeto-midia-lista">
          {arquivos.map((arquivo) => {
            const href = `/api/projects/${projectId}/arquivos/${arquivo.id}`;
            return (
              <li key={arquivo.id}>
                {arquivo.kind === "imagem" ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={href} alt={arquivo.name} loading="lazy" />
                ) : (
                  <span className="projeto-midia-icone" aria-hidden="true">
                    {arquivo.kind === "pdf" ? "PDF" : arquivo.kind === "video" ? "VID" : "ARQ"}
                  </span>
                )}

                <div className="projeto-midia-dados">
                  <a href={href} target="_blank" rel="noreferrer">
                    {arquivo.name}
                  </a>
                  <small>
                    {ROTULO_TIPO[arquivo.kind] ?? "Arquivo"} · {tamanhoLegivel(arquivo.sizeBytes)}
                  </small>
                </div>

                <button type="button" onClick={() => void remover(arquivo.id)}>
                  Remover
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

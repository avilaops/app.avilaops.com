"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Grupo } from "@/components/sistema/Lista";

/**
 * O ícone e o nome da casa, editáveis na própria tela.
 *
 * A prévia é o próprio cabeçalho em miniatura: quem troca o logo quer ver como
 * ele vai ficar no topo, não um retângulo de 300 pixels que mente sobre o
 * resultado. Por isso o quadrado tem o mesmo tamanho e o mesmo arredondamento
 * do `brand-mark`.
 *
 * Sem ícone guardado, a prévia mostra o símbolo padrão da casa — exatamente o
 * que o cabeçalho desenha. A tela nunca finge ter uma imagem que não existe.
 */
export default function IdentidadeDaCasaForm({
  nome: nomeInicial,
  inicial,
  iconeUrl,
}: {
  nome: string;
  inicial: string;
  iconeUrl: string | null;
}) {
  const router = useRouter();
  const entrada = useRef<HTMLInputElement>(null);
  const [nome, setNome] = useState(nomeInicial);
  const [ocupado, setOcupado] = useState<"icone" | "nome" | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [recado, setRecado] = useState<string | null>(null);

  async function enviarIcone(arquivo: File) {
    setOcupado("icone");
    setErro(null);
    setRecado(null);

    const corpo = new FormData();
    corpo.append("icone", arquivo);

    try {
      const resposta = await fetch("/api/empresa/icone", { method: "POST", body: corpo });
      const dados = (await resposta.json().catch(() => ({}))) as { erro?: string };
      if (!resposta.ok) throw new Error(dados.erro ?? "Não consegui guardar o ícone.");
      setRecado("Logo trocado.");
      // O cabeçalho é renderizado no servidor: sem o refresh, a marca nova só
      // apareceria na próxima navegação.
      router.refresh();
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : "Não consegui guardar o ícone.");
    } finally {
      setOcupado(null);
      if (entrada.current) entrada.current.value = "";
    }
  }

  async function removerIcone() {
    setOcupado("icone");
    setErro(null);
    setRecado(null);

    try {
      const resposta = await fetch("/api/empresa/icone", { method: "DELETE" });
      const dados = (await resposta.json().catch(() => ({}))) as { erro?: string };
      if (!resposta.ok) throw new Error(dados.erro ?? "Não consegui remover o ícone.");
      setRecado("Logo removido. O topo volta ao símbolo padrão.");
      router.refresh();
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : "Não consegui remover o ícone.");
    } finally {
      setOcupado(null);
    }
  }

  async function salvarNome() {
    if (nome.trim() === nomeInicial) return;
    setOcupado("nome");
    setErro(null);
    setRecado(null);

    try {
      const resposta = await fetch("/api/empresa/identidade", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nome }),
      });
      const dados = (await resposta.json().catch(() => ({}))) as { erro?: string };
      if (!resposta.ok) throw new Error(dados.erro ?? "Não consegui salvar o nome.");
      setRecado("Nome salvo.");
      router.refresh();
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : "Não consegui salvar o nome.");
    } finally {
      setOcupado(null);
    }
  }

  return (
    <Grupo titulo="Logo e nome">
      <div className="identidade-casa">
        <div className="identidade-previa">
          {iconeUrl ? (
            // Imagem do banco, servida pela nossa rota: o `next/image` não
            // acrescenta nada aqui e exigiria configurar domínio para um
            // arquivo de 32 pixels.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={iconeUrl} alt="" className="identidade-icone" />
          ) : (
            <span className="brand-mark" aria-hidden="true">
              {inicial}
            </span>
          )}
          <div>
            <strong>{nome || "Ávila Ops"}</strong>
            <small>É assim que aparece no topo de todas as telas.</small>
          </div>
        </div>

        <input
          ref={entrada}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="campo-arquivo"
          aria-label="Escolher imagem do logo"
          disabled={ocupado !== null}
          onChange={(evento) => {
            const arquivo = evento.target.files?.[0];
            if (arquivo) void enviarIcone(arquivo);
          }}
        />

        <div className="identidade-acoes">
          <button
            type="button"
            className="secondary-button"
            disabled={ocupado !== null}
            onClick={() => entrada.current?.click()}
          >
            {iconeUrl ? "Trocar logo" : "Adicionar logo"}
          </button>
          {iconeUrl ? (
            <button
              type="button"
              className="text-button"
              disabled={ocupado !== null}
              onClick={() => void removerIcone()}
            >
              Remover
            </button>
          ) : null}
        </div>

        <p className="identidade-dica">
          PNG, JPEG ou WebP, até 512 KB. SVG não entra: é executável no navegador, e o
          logo seria servido do mesmo domínio do painel.
        </p>

        <label className="identidade-nome">
          <span>Nome fantasia</span>
          <input
            type="text"
            value={nome}
            maxLength={60}
            disabled={ocupado !== null}
            onChange={(evento) => setNome(evento.target.value)}
            onBlur={() => void salvarNome()}
          />
        </label>

        {erro ? <p className="aviso-erro">{erro}</p> : null}
        {recado ? <p className="aviso-ok">{recado}</p> : null}
      </div>
    </Grupo>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

type Props = {
  slug: string;
  id: string;
  versao: number;
  ativo: boolean;
  precoCentavos: number;
  categoria: string | null;
  categorias: { valor: string; rotulo: string }[];
  /** Produto com grade: o preço é de cada variação e não se edita aqui. */
  temVariacoes: boolean;
  /** A última alteração veio de importação, API ou ERP: a próxima pode sobrescrever. */
  sincronizado: string | null;
};

/**
 * Altera situação, categoria e preço de um produto.
 *
 * Três cuidados: manda a versão que a pessoa estava olhando (se o produto
 * mudou nesse meio-tempo, a plataforma recusa e nada é gravado); só diz
 * "salvo" depois de a plataforma confirmar; e, em caso de erro, os campos
 * continuam como a pessoa deixou, para ela não redigitar.
 */
export default function EditarProduto({ slug, id, versao, ativo, precoCentavos, categoria, categorias, temVariacoes, sincronizado }: Props) {
  const router = useRouter();
  const precoInicial = precoCentavos > 0 ? (precoCentavos / 100).toFixed(2).replace(".", ",") : "";
  const [situacao, setSituacao] = useState(ativo ? "ativo" : "inativo");
  const [preco, setPreco] = useState(precoInicial);
  const [cat, setCat] = useState(categoria ?? "");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [recado, setRecado] = useState<string | null>(null);

  const mudou = situacao !== (ativo ? "ativo" : "inativo") || preco.trim() !== precoInicial || cat !== (categoria ?? "");

  async function salvar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (!mudou || salvando) return;
    setSalvando(true);
    setErro(null);
    setRecado(null);
    try {
      const resposta = await fetch(`/api/lojas/${encodeURIComponent(slug)}/produtos/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          versao,
          ativo: situacao === "ativo",
          categoria: cat || null,
          ...(temVariacoes ? {} : { preco }),
        }),
      });
      const dados = (await resposta.json().catch(() => ({}))) as { erro?: string; gravados?: string[] };
      if (!resposta.ok) throw new Error(dados.erro ?? "Não consegui salvar.");
      setRecado(dados.gravados?.length ? "Alteração salva na loja e registrada no histórico." : "Nada mudou: os valores já eram estes.");
      // Relê a ficha: versão nova, histórico novo, e os valores vindos da plataforma.
      router.refresh();
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : "Não consegui salvar.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form className="produto-editar" onSubmit={salvar} aria-label="Alterar produto">
      <h2>Alterar</h2>
      {sincronizado ? (
        <p className="produto-nota">
          A última alteração deste produto veio de {sincronizado}. Se a loja sincroniza o catálogo por esse caminho, a
          próxima sincronização pode sobrescrever o que for salvo aqui.
        </p>
      ) : null}
      <div className="produto-editar-campos">
        <label className="catalogo-campo">
          <span>Situação</span>
          <select value={situacao} disabled={salvando} onChange={(e) => setSituacao(e.target.value)}>
            <option value="ativo">Ativo (aparece na vitrine)</option>
            <option value="inativo">Inativo (não aparece)</option>
          </select>
        </label>
        <label className="catalogo-campo">
          <span>Categoria</span>
          <select value={cat} disabled={salvando} onChange={(e) => setCat(e.target.value)}>
            <option value="">Sem categoria</option>
            {categorias.map((c) => (
              <option key={c.valor} value={c.valor}>
                {c.rotulo}
              </option>
            ))}
          </select>
        </label>
        <label className="catalogo-campo">
          <span>Preço (R$)</span>
          <input
            type="text"
            inputMode="decimal"
            value={preco}
            disabled={salvando || temVariacoes}
            placeholder="vazio = sob consulta"
            onChange={(e) => setPreco(e.target.value)}
          />
        </label>
      </div>
      {temVariacoes ? (
        <p className="produto-nota">Este produto tem variações: o preço é de cada variação e se edita na grade, no painel da loja.</p>
      ) : null}
      <p className="produto-nota">Estoque não se altera por aqui: é contado pelo lojista ou pelo ERP da loja.</p>
      <p>
        <button type="submit" className="primary-button" disabled={!mudou || salvando}>
          {salvando ? "Salvando…" : "Salvar alteração"}
        </button>
      </p>
      {recado ? <p className="aviso-ok" role="status">{recado}</p> : null}
      {erro ? <p className="aviso-erro" role="alert">{erro}</p> : null}
    </form>
  );
}

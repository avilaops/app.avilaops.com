"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Grupo } from "@/components/sistema/Lista";

export type CampoLivreNaTela = {
  chave: string;
  rotulo: string;
  mascara: string | null;
  atualizadoEm: string | null;
};

/**
 * Campos que o dono nomeia, para banco que nenhum código lê.
 *
 * Com `instituicao` vazia é o cadastro de uma instituição nova: o nome entra
 * junto com o primeiro campo, e a tela segue para a ficha dela.
 */
export default function CamposLivres({
  instituicao,
  campos,
}: {
  instituicao: string | null;
  campos: CampoLivreNaTela[];
}) {
  const router = useRouter();
  const [nomeInstituicao, setNomeInstituicao] = useState(instituicao ?? "");
  const [rotulo, setRotulo] = useState("");
  const [valor, setValor] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [recado, setRecado] = useState<string | null>(null);

  async function guardar(rotuloDoCampo: string, valorDoCampo: string) {
    setOcupado(true);
    setErro(null);
    setRecado(null);
    try {
      const resposta = await fetch("/api/empresa/credenciais/livres", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ instituicao: nomeInstituicao, rotulo: rotuloDoCampo, valor: valorDoCampo }),
      });
      const dados = (await resposta.json().catch(() => ({}))) as { erro?: string; slug?: string };
      if (!resposta.ok) throw new Error(dados.erro ?? "Não consegui guardar.");
      setRotulo("");
      setValor("");
      setRecado(`${rotuloDoCampo} guardado.`);
      if (!instituicao && dados.slug) {
        router.push(`/empresa/credenciais/financeiro/${dados.slug}`);
      } else {
        router.refresh();
      }
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : "Não consegui guardar.");
    } finally {
      setOcupado(false);
    }
  }

  async function remover(campo: CampoLivreNaTela) {
    if (!window.confirm(`Remover "${campo.rotulo}"? O valor guardado é apagado.`)) return;
    setOcupado(true);
    setErro(null);
    try {
      const resposta = await fetch(
        `/api/empresa/credenciais/livres?chave=${encodeURIComponent(campo.chave)}`,
        { method: "DELETE" },
      );
      if (!resposta.ok) throw new Error("Não consegui remover.");
      router.refresh();
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : "Não consegui remover.");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Grupo titulo={instituicao ? "Campos guardados" : "Nova instituição"}>
      <div className="credenciais-form">
        {campos.map((campo) => (
          <CampoGuardado
            key={campo.chave}
            campo={campo}
            ocupado={ocupado}
            onSubstituir={(novo) => guardar(campo.rotulo, novo)}
            onRemover={() => void remover(campo)}
          />
        ))}

        {!instituicao ? (
          <label className="credencial-campo">
            <span>Nome da instituição</span>
            <input
              type="text"
              maxLength={60}
              placeholder="Ex.: Banco Inter, Itaú, Stone"
              value={nomeInstituicao}
              disabled={ocupado}
              onChange={(e) => setNomeInstituicao(e.target.value)}
            />
          </label>
        ) : null}

        <div className="campo-livre-novo">
          <label className="credencial-campo">
            <span>{campos.length ? "Adicionar campo" : "Nome do campo"}</span>
            <input
              type="text"
              maxLength={60}
              placeholder="Ex.: Client ID, Chave Pix, Token da API"
              value={rotulo}
              disabled={ocupado}
              onChange={(e) => setRotulo(e.target.value)}
            />
          </label>
          <label className="credencial-campo">
            <span>Valor</span>
            <input
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={valor}
              disabled={ocupado}
              onChange={(e) => setValor(e.target.value)}
            />
          </label>
        </div>

        <div className="credenciais-acoes">
          <button
            type="button"
            className="primary-button"
            disabled={ocupado || !rotulo.trim() || !valor.trim() || !nomeInstituicao.trim()}
            onClick={() => void guardar(rotulo.trim(), valor)}
          >
            {ocupado ? "Guardando…" : "Guardar"}
          </button>
          <small>
            Cifrado no banco, como os demais segredos. Nenhuma integração lê estes campos: é um
            lugar seguro para guardar, não uma conexão com o banco.
          </small>
        </div>

        {erro ? <p className="aviso-erro">{erro}</p> : null}
        {recado ? <p className="aviso-ok">{recado}</p> : null}
      </div>
    </Grupo>
  );
}

function CampoGuardado({
  campo,
  ocupado,
  onSubstituir,
  onRemover,
}: {
  campo: CampoLivreNaTela;
  ocupado: boolean;
  onSubstituir: (valor: string) => Promise<void>;
  onRemover: () => void;
}) {
  const [novo, setNovo] = useState("");

  return (
    <div className="credencial-campo">
      <span>{campo.rotulo}</span>
      <div className="campo-livre-linha">
        <input
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder="Guardado — digite para substituir"
          aria-label={`Novo valor para ${campo.rotulo}`}
          value={novo}
          disabled={ocupado}
          onChange={(e) => setNovo(e.target.value)}
        />
        <button
          type="button"
          className="secondary-button"
          disabled={ocupado || !novo.trim()}
          onClick={() => void onSubstituir(novo).then(() => setNovo(""))}
        >
          Substituir
        </button>
        <button type="button" className="text-button" disabled={ocupado} onClick={onRemover}>
          Remover
        </button>
      </div>
      <small className="credencial-estado">
        {campo.mascara ? `guardado: ${campo.mascara}` : "guardado"}
        {campo.atualizadoEm ? ` · ${new Date(campo.atualizadoEm).toLocaleDateString("pt-BR")}` : ""}
      </small>
    </div>
  );
}

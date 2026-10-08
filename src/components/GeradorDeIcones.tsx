"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ICONES_DERIVADOS,
  MIMES_ORIGEM,
  OPCOES_PADRAO,
  manifesto,
  trechoHtml,
  type TipoIconeDerivado,
} from "@/lib/marca/especificacoes";

export type AtivoDaMarca = {
  id: string;
  assetType: string;
  name: string | null;
  mimeType: string | null;
  version: string | null;
  isCurrent: boolean;
};

type Resposta = {
  gerados?: { assetType: string; name: string | null; version: string | null; sizeBytes: number | null }[];
  error?: string;
};

function kb(bytes: number | null) {
  return bytes ? `${Math.max(1, Math.round(bytes / 1024))} kB` : "";
}

/**
 * Preenche os ícones da marca a partir de uma logo só, como o
 * RealFaviconGenerator — a diferença é que aqui os arquivos já entram no
 * cadastro do cliente, versionados e com a origem anotada.
 */
export default function GeradorDeIcones({
  organizationId,
  organizationName,
  brandAssets,
}: {
  organizationId: string;
  organizationName: string;
  brandAssets: AtivoDaMarca[];
}) {
  const router = useRouter();

  const atuais = useMemo(() => brandAssets.filter((a) => a.isCurrent), [brandAssets]);
  const origens = useMemo(
    () => atuais.filter((a) => a.mimeType && MIMES_ORIGEM.has(a.mimeType)),
    [atuais],
  );
  const jaTem = useMemo(() => new Set(atuais.map((a) => a.assetType)), [atuais]);
  const faltando = useMemo(
    () => ICONES_DERIVADOS.filter((i) => !jaTem.has(i.assetType)),
    [jaTem],
  );

  const preferida =
    origens.find((a) => a.assetType === "Logo principal") ??
    origens.find((a) => a.assetType === "Símbolo") ??
    origens[0];

  const [origemId, setOrigemId] = useState(preferida?.id ?? "");
  const [fundo, setFundo] = useState("");
  const [margem, setMargem] = useState(OPCOES_PADRAO.margem);
  const [recortar, setRecortar] = useState(OPCOES_PADRAO.recortar);
  const [substituir, setSubstituir] = useState(false);
  const [tipos, setTipos] = useState<TipoIconeDerivado[]>([]);
  const [gerando, setGerando] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");

  const alvos = substituir
    ? tipos.length
      ? ICONES_DERIVADOS.filter((i) => tipos.includes(i.assetType))
      : ICONES_DERIVADOS
    : (tipos.length ? ICONES_DERIVADOS.filter((i) => tipos.includes(i.assetType)) : ICONES_DERIVADOS).filter(
        (i) => !jaTem.has(i.assetType),
      );

  function alternarTipo(tipo: TipoIconeDerivado) {
    setTipos((atual) =>
      atual.includes(tipo) ? atual.filter((t) => t !== tipo) : [...atual, tipo],
    );
  }

  async function gerar() {
    if (!origemId) {
      setErro("Escolha a logo de origem.");
      return;
    }
    setGerando(true);
    setMensagem("");
    setErro("");
    try {
      const resposta = await fetch(`/api/organizations/${organizationId}/brand-assets/gerar-icones`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          origemAssetId: origemId,
          fundo: fundo || null,
          margem,
          recortar,
          substituir,
          tipos,
        }),
      });
      const dados = (await resposta.json()) as Resposta;
      if (!resposta.ok) throw new Error(dados.error ?? "Não foi possível gerar os ícones.");
      const lista = dados.gerados ?? [];
      setMensagem(
        `${lista.length} ${lista.length === 1 ? "ícone gerado" : "ícones gerados"}: ${lista
          .map((g) => `${g.assetType} (${kb(g.sizeBytes)})`)
          .join(", ")}.`,
      );
      setTipos([]);
      router.refresh();
    } catch (capturado) {
      setErro(capturado instanceof Error ? capturado.message : "Não foi possível gerar os ícones.");
    } finally {
      setGerando(false);
    }
  }

  if (origens.length === 0) {
    return (
      <section className="icon-generator" aria-labelledby="gerador-icones">
        <div className="icon-generator-head">
          <div>
            <span className="eyebrow">GERAÇÃO AUTOMÁTICA</span>
            <h3 id="gerador-icones">Ícones a partir da logo</h3>
          </div>
        </div>
        <p className="icon-generator-hint">
          Envie primeiro uma logo em PNG, JPG, WEBP ou SVG em uma das linhas abaixo. Com ela o
          sistema monta favicon, ícones do manifesto, Apple Touch Icon e as imagens de
          compartilhamento.
        </p>
      </section>
    );
  }

  return (
    <section className="icon-generator" aria-labelledby="gerador-icones">
      <div className="icon-generator-head">
        <div>
          <span className="eyebrow">GERAÇÃO AUTOMÁTICA</span>
          <h3 id="gerador-icones">Ícones a partir da logo</h3>
        </div>
        <span className="icon-generator-count">
          {faltando.length ? `${faltando.length} faltando` : "conjunto completo"}
        </span>
      </div>

      <p className="icon-generator-hint">
        Recorta, centraliza e redimensiona a logo escolhida. Cada arquivo entra como versão
        nova do seu tipo, com a origem anotada nas observações — nada é gerado do nada.
      </p>

      <div className="icon-generator-form">
        <label className="field">
          <span>Logo de origem</span>
          <select
            value={origemId}
            onChange={(evento) => {
              setOrigemId(evento.target.value);
              // O único erro que nasce sem pedido ao servidor é "escolha a
              // logo": escolhida, ele deixa de ser verdade e sai da tela.
              if (evento.target.value) setErro("");
            }}
          >
            {origens.map((a) => (
              <option key={a.id} value={a.id}>
                {a.assetType} · v{a.version ?? "1"} · {a.name ?? "arquivo"}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Fundo</span>
          <div className="icon-generator-fundo">
            <input
              type="color"
              value={fundo || "#FFFFFF"}
              onChange={(evento) => setFundo(evento.target.value.toUpperCase())}
              aria-label="Cor de fundo"
            />
            <button type="button" className="secondary-button" onClick={() => setFundo("")}>
              {fundo ? "Usar transparente" : "Transparente"}
            </button>
          </div>
          <small>
            {fundo
              ? `Todos os ícones saem com ${fundo}.`
              : "Favicon e ícones do manifesto saem transparentes; Apple Touch, preview e OG saem em branco (o iOS pinta alfa de preto)."}
          </small>
        </label>

        <label className="field">
          <span>Folga ao redor: {margem}%</span>
          <input
            type="range"
            min={0}
            max={40}
            step={1}
            value={margem}
            onChange={(evento) => setMargem(Number(evento.target.value))}
          />
        </label>

        <label className="icon-generator-check">
          <input type="checkbox" checked={recortar} onChange={(e) => setRecortar(e.target.checked)} />
          <span>Recortar a moldura vazia da logo antes de redimensionar</span>
        </label>

        <label className="icon-generator-check">
          <input type="checkbox" checked={substituir} onChange={(e) => setSubstituir(e.target.checked)} />
          <span>Refazer também os tipos que já têm arquivo</span>
        </label>
      </div>

      <fieldset className="icon-generator-tipos">
        <legend>
          O que gerar{" "}
          {tipos.length
            ? `(${tipos.length} escolhidos)`
            : alvos.length
              ? "(todos que faltam)"
              : "(nada faltando)"}
        </legend>
        {ICONES_DERIVADOS.map((icone) => {
          const existe = jaTem.has(icone.assetType);
          const marcado = tipos.includes(icone.assetType);
          const seraGerado = alvos.some((a) => a.assetType === icone.assetType);
          return (
            <label
              key={icone.assetType}
              className={seraGerado ? "icon-generator-tipo ativo" : "icon-generator-tipo"}
            >
              <input type="checkbox" checked={marcado} onChange={() => alternarTipo(icone.assetType)} />
              <span>
                <strong>{icone.assetType}</strong>
                <small>
                  {icone.arquivo} · {icone.largura}×{icone.altura} ·{" "}
                  {existe ? "já tem arquivo" : "faltando"}
                </small>
                <small>{icone.descricao}</small>
              </span>
            </label>
          );
        })}
      </fieldset>

      <div className="icon-generator-acoes">
        <button type="button" className="secondary-button" onClick={gerar} disabled={gerando || alvos.length === 0}>
          {gerando
            ? "Gerando..."
            : alvos.length === 0
              ? "Nada a gerar"
              : `Gerar ${alvos.length} ${alvos.length === 1 ? "ícone" : "ícones"}`}
        </button>
        {alvos.length === 0 && !gerando ? (
          <small>Todos já têm arquivo. Marque “refazer” para gerar de novo.</small>
        ) : null}
      </div>

      {mensagem ? <p className="icon-generator-ok">{mensagem}</p> : null}
      {erro ? (
        <p className="icon-generator-erro" role="alert">
          {erro}
        </p>
      ) : null}

      <details className="icon-generator-codigo">
        <summary>Código para o site do cliente</summary>
        <p>No &lt;head&gt;:</p>
        <pre>{trechoHtml()}</pre>
        <p>site.webmanifest:</p>
        <pre>{manifesto(organizationName, fundo || null)}</pre>
      </details>
    </section>
  );
}

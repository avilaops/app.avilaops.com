"use client";

import { useEffect, useState, type CSSProperties } from "react";
import {
  especPorTipo,
  folgaDaPrevia,
  fundoEfetivo,
  type EspecIcone,
  type TipoIconeDerivado,
} from "@/lib/marca/especificacoes";

/**
 * O que cada ícone vira, antes de gerar arquivo.
 *
 * A lista de tipos já explica cada um em texto; faltava ver. O caso que mais
 * justifica é o maskable: é onde o Android corta a logo sem avisar, e até aqui
 * só se descobria depois de gerar e instalar.
 *
 * A prévia não inventa regra: folga e fundo saem das mesmas funções que o
 * gerador usa (`especificacoes.ts`). O que ela não reproduz ao pixel é o
 * redimensionamento do servidor — é a mesma logo, na mesma caixa, desenhada
 * pelo navegador.
 */

/** Diferença por canal acima da qual o pixel deixa de ser "moldura" — o mesmo limiar do gerador. */
const LIMIAR = 10;
/** Lado máximo do rascunho de recorte: basta para achar a borda, e não trava logo grande. */
const LADO_DO_RASCUNHO = 512;

/**
 * A logo sem a moldura vazia, como o gerador a deixa antes de redimensionar:
 * tira as bordas iguais ao pixel do canto. Devolve a própria URL enquanto
 * carrega, quando o recorte está desligado e quando não dá para recortar
 * (imagem de uma cor só, navegador sem canvas).
 */
function useLogoRecortada(url: string, recortar: boolean): string {
  const [recortada, setRecortada] = useState<{ de: string; para: string } | null>(null);

  useEffect(() => {
    if (!recortar || !url) return undefined;
    let vivo = true;
    const imagem = new Image();
    imagem.onload = () => {
      if (!vivo) return;
      try {
        const escala = Math.min(1, LADO_DO_RASCUNHO / Math.max(imagem.naturalWidth, imagem.naturalHeight, 1));
        const largura = Math.max(1, Math.round((imagem.naturalWidth || LADO_DO_RASCUNHO) * escala));
        const altura = Math.max(1, Math.round((imagem.naturalHeight || LADO_DO_RASCUNHO) * escala));
        const tela = document.createElement("canvas");
        tela.width = largura;
        tela.height = altura;
        const contexto = tela.getContext("2d");
        if (!contexto) return;
        contexto.drawImage(imagem, 0, 0, largura, altura);
        const { data } = contexto.getImageData(0, 0, largura, altura);

        let esquerda = largura;
        let direita = -1;
        let topo = altura;
        let base = -1;
        for (let y = 0; y < altura; y += 1) {
          for (let x = 0; x < largura; x += 1) {
            const i = (y * largura + x) * 4;
            const diferente =
              Math.abs(data[i] - data[0]) > LIMIAR ||
              Math.abs(data[i + 1] - data[1]) > LIMIAR ||
              Math.abs(data[i + 2] - data[2]) > LIMIAR ||
              Math.abs(data[i + 3] - data[3]) > LIMIAR;
            if (!diferente) continue;
            if (x < esquerda) esquerda = x;
            if (x > direita) direita = x;
            if (y < topo) topo = y;
            if (y > base) base = y;
          }
        }
        if (direita < esquerda || base < topo) return; // uma cor só: vale a original

        const corte = document.createElement("canvas");
        corte.width = direita - esquerda + 1;
        corte.height = base - topo + 1;
        corte.getContext("2d")?.drawImage(tela, esquerda, topo, corte.width, corte.height, 0, 0, corte.width, corte.height);
        setRecortada({ de: url, para: corte.toDataURL("image/png") });
      } catch {
        // Sem recorte a prévia segue com a logo inteira.
      }
    };
    imagem.src = url;
    return () => {
      vivo = false;
    };
  }, [url, recortar]);

  return recortar && recortada?.de === url ? recortada.para : url;
}

function Icone({
  tipo,
  logo,
  fundo,
  margem,
  className,
}: {
  tipo: TipoIconeDerivado;
  logo: string;
  fundo: string | null;
  margem: number;
  className: string;
}) {
  const spec = especPorTipo(tipo) as EspecIcone;
  const cor = fundoEfetivo(spec, fundo);
  const estilo: CSSProperties = {
    aspectRatio: `${spec.largura} / ${spec.altura}`,
    padding: `${folgaDaPrevia(spec, margem)}%`,
    ...(cor ? { background: cor } : {}),
  };
  return (
    <span className={cor ? `icon-previa-icone ${className}` : `icon-previa-icone icon-previa-vazado ${className}`} style={estilo}>
      {/* eslint-disable-next-line @next/next/no-img-element -- arquivo privado do cliente, servido pela rota autenticada; pode ser data: do recorte */}
      <img src={logo} alt="" />
    </span>
  );
}

export default function PreviaDosIcones({
  logoUrl,
  nome,
  fundo,
  margem,
  recortar,
}: {
  logoUrl: string;
  nome: string;
  fundo: string | null;
  margem: number;
  recortar: boolean;
}) {
  const logo = useLogoRecortada(logoUrl, recortar);
  const comum = { logo, fundo, margem };

  return (
    <div className="icon-previa" aria-label="Prévia dos ícones">
      <figure className="icon-previa-item">
        <div className="icon-previa-aba">
          <Icone tipo="Favicon" className="icon-previa-favicon" {...comum} />
          <span>{nome}</span>
        </div>
        <figcaption>Aba do navegador</figcaption>
      </figure>

      <figure className="icon-previa-item">
        <Icone tipo="Ícone 192x192" className="icon-previa-android" {...comum} />
        <figcaption>Tela do Android</figcaption>
      </figure>

      <figure className="icon-previa-item">
        <Icone tipo="Apple Touch Icon" className="icon-previa-iphone" {...comum} />
        <figcaption>Tela do iPhone</figcaption>
      </figure>

      <figure className="icon-previa-item">
        <span className="icon-previa-mascara">
          <Icone tipo="Ícone maskable 512" className="icon-previa-maskable" {...comum} />
        </span>
        <figcaption>Maskable: o Android pode cortar fora do círculo</figcaption>
      </figure>

      <figure className="icon-previa-item icon-previa-largo">
        <Icone tipo="Preview image" className="icon-previa-cartao" {...comum} />
        <figcaption>WhatsApp (16:9)</figcaption>
      </figure>

      <figure className="icon-previa-item icon-previa-largo">
        <Icone tipo="Open Graph Image" className="icon-previa-cartao" {...comum} />
        <figcaption>Link compartilhado (1200×630)</figcaption>
      </figure>
    </div>
  );
}

/**
 * O padrão de entrega de ícones da casa, em funções puras.
 *
 * Aqui não há rede nem banco: entra o que foi coletado de um site, sai a lista
 * de itens aprovados e reprovados. É o que permite testar o padrão sem subir
 * nada — `auditoria.ts` cuida de buscar os arquivos e entregar os fatos.
 *
 * O padrão nasceu de três defeitos reais, e cada item existe porque um deles
 * chegou a produção:
 *
 * 1. Um site declarava `apple-touch-icon` apontando para um SVG. O iOS ignora
 *    SVG nesse campo e cai no letreiro com a inicial do domínio — o atalho na
 *    tela inicial fica com uma letra em vez da marca.
 * 2. O manifesto do próprio painel trazia os dois ícones só como `maskable`.
 *    O Android recorta maskable num círculo de 80% do lado: sem uma entrada
 *    `any` de reserva, a marca saía cortada.
 * 3. O Apple Touch Icon saiu com alfa. O iOS pinta transparência de preto, e
 *    uma marca colorida sobre claro vira um borrão escuro no atalho.
 */

/** Um item do padrão: o que se espera, se passou, e a frase que explica. */
export type ItemPadrao = {
  chave: string;
  rotulo: string;
  ok: boolean;
  /** Frase curta dizendo o que foi encontrado — vai para a tela como está. */
  detalhe: string;
  /** Quanto o item vale na nota. A soma dos pesos é 100. */
  peso: number;
};

/** O que `auditoria.ts` consegue apurar sobre um arquivo de imagem. */
export type ArquivoRemoto = {
  /** null = a requisição nem chegou a ter resposta (DNS, timeout, TLS). */
  status: number | null;
  /** Tipo declarado pelo servidor, em minúsculas e sem parâmetros. */
  contentType: string | null;
  bytes: number | null;
  largura: number | null;
  altura: number | null;
  /** false quando algum pixel tem alfa < 255. null quando não deu para abrir. */
  opaco: boolean | null;
  /** Assinatura de arquivo .ico: `00 00 01 00` nos quatro primeiros bytes. */
  ehIco: boolean | null;
  /** Lados declarados no diretório do .ico (16, 32, 48...). */
  ladosIco: number[];
};

export const ARQUIVO_AUSENTE: ArquivoRemoto = {
  status: null,
  contentType: null,
  bytes: null,
  largura: null,
  altura: null,
  opaco: null,
  ehIco: null,
  ladosIco: [],
};

export type IconeDeclarado = {
  href: string;
  sizes: string | null;
  type: string | null;
};

/** O que o `<head>` da página inicial declara sobre ícones. */
export type CabecaHtml = {
  icones: IconeDeclarado[];
  appleTouchIcon: string | null;
  manifest: string | null;
  ogImage: string | null;
  themeColor: string | null;
};

export type IconeManifesto = {
  src: string;
  sizes: string | null;
  type: string | null;
  /** Já separado em palavras; `[]` quando o campo não veio (o padrão é `any`). */
  purpose: string[];
};

export type Manifesto = {
  name: string | null;
  shortName: string | null;
  startUrl: string | null;
  scope: string | null;
  display: string | null;
  themeColor: string | null;
  backgroundColor: string | null;
  icones: IconeManifesto[];
};

/**
 * Lê as tags de ícone do HTML.
 *
 * Expressão regular e não um parser de verdade porque só interessam quatro
 * tags do `<head>`, e trazer um parser de DOM para o servidor por causa disso
 * seria caro. O atributo pode vir antes ou depois do `rel`, então cada busca
 * tenta as duas ordens.
 */
export function lerCabecaHtml(html: string): CabecaHtml {
  const tagsLink = html.match(/<link\b[^>]*>/gi) ?? [];
  const atributo = (tag: string, nome: string): string | null => {
    const m = tag.match(new RegExp(`\\b${nome}\\s*=\\s*["']([^"']*)["']`, "i"));
    return m ? m[1].trim() : null;
  };
  const rels = (tag: string): string[] =>
    (atributo(tag, "rel") ?? "").toLowerCase().split(/\s+/).filter(Boolean);

  const icones: IconeDeclarado[] = [];
  let appleTouchIcon: string | null = null;
  let manifest: string | null = null;

  for (const tag of tagsLink) {
    const lista = rels(tag);
    const href = atributo(tag, "href");
    if (!href) continue;
    // `shortcut icon` ainda aparece em site antigo e vale como ícone.
    if (lista.includes("icon") || lista.includes("shortcut")) {
      icones.push({ href, sizes: atributo(tag, "sizes"), type: atributo(tag, "type") });
    }
    if (lista.includes("apple-touch-icon") || lista.includes("apple-touch-icon-precomposed")) {
      appleTouchIcon ??= href;
    }
    if (lista.includes("manifest")) manifest ??= href;
  }

  const meta = (nome: string): string | null => {
    const padroes = [
      new RegExp(`<meta\\b[^>]*property\\s*=\\s*["']${nome}["'][^>]*content\\s*=\\s*["']([^"']*)["']`, "i"),
      new RegExp(`<meta\\b[^>]*content\\s*=\\s*["']([^"']*)["'][^>]*property\\s*=\\s*["']${nome}["']`, "i"),
      new RegExp(`<meta\\b[^>]*name\\s*=\\s*["']${nome}["'][^>]*content\\s*=\\s*["']([^"']*)["']`, "i"),
      new RegExp(`<meta\\b[^>]*content\\s*=\\s*["']([^"']*)["'][^>]*name\\s*=\\s*["']${nome}["']`, "i"),
    ];
    for (const p of padroes) {
      const m = html.match(p);
      if (m) return m[1].trim();
    }
    return null;
  };

  return {
    icones,
    appleTouchIcon,
    manifest,
    ogImage: meta("og:image"),
    themeColor: meta("theme-color"),
  };
}

/** Lê o JSON do manifesto sem confiar em nada: campo torto vira null. */
export function lerManifesto(texto: string): Manifesto | null {
  let bruto: unknown;
  try {
    bruto = JSON.parse(texto);
  } catch {
    return null;
  }
  if (!bruto || typeof bruto !== "object") return null;
  const o = bruto as Record<string, unknown>;
  const texto_ = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

  const icones: IconeManifesto[] = Array.isArray(o.icons)
    ? o.icons
        .filter((i): i is Record<string, unknown> => Boolean(i) && typeof i === "object")
        .map((i) => ({
          src: texto_(i.src) ?? "",
          sizes: texto_(i.sizes),
          type: texto_(i.type),
          // `purpose` aceita várias palavras separadas por espaço ("any maskable").
          purpose: (texto_(i.purpose) ?? "").toLowerCase().split(/\s+/).filter(Boolean),
        }))
        .filter((i) => i.src)
    : [];

  return {
    name: texto_(o.name),
    shortName: texto_(o.short_name),
    startUrl: texto_(o.start_url),
    scope: texto_(o.scope),
    display: texto_(o.display),
    themeColor: texto_(o.theme_color),
    backgroundColor: texto_(o.background_color),
    icones,
  };
}

/** `"192x192"` → 192. Devolve null para `"any"` e para o que não for medida. */
export function ladoDeclarado(sizes: string | null): number | null {
  if (!sizes) return null;
  const m = sizes.match(/(\d+)\s*x\s*(\d+)/i);
  if (!m) return null;
  return Number(m[1]) === Number(m[2]) ? Number(m[1]) : null;
}

export type ColetaIcones = {
  html: {
    status: number | null;
    cabeca: CabecaHtml | null;
    /** Onde a busca parou depois dos redirecionamentos. */
    urlFinal?: string | null;
  };
  faviconRaiz: ArquivoRemoto;
  appleTouch: ArquivoRemoto;
  manifesto: {
    /** De onde o arquivo veio: o href declarado, ou um dos nomes de reserva. */
    caminho: string | null;
    status: number | null;
    dados: Manifesto | null;
  };
  /** Um por ícone listado no manifesto, na mesma ordem. */
  iconesManifesto: ArquivoRemoto[];
  ogImage: ArquivoRemoto;
};

/**
 * Um painel atrás de SSO redireciona a raiz para a tela de login, que costuma
 * morar em outro domínio. Quem monta atalho ou card lê o HTML de destino, não
 * o da aplicação — então "nenhuma tag" é a verdade do que o mundo vê, mas
 * dizer só isso manda procurar no lugar errado. A frase aponta o destino.
 */
function ondeOHtmlParou(coleta: ColetaIcones): string {
  const destino = coleta.html.urlFinal;
  if (!destino) return "";
  try {
    const url = new URL(destino);
    if (url.pathname === "/" || url.pathname === "") return "";
    return ` A raiz leva a ${url.host}${url.pathname}, e é esse HTML que o mundo lê.`;
  } catch {
    return "";
  }
}

const LADO_APPLE = 180;
const LADO_OG_MIN = { largura: 1200, altura: 630 };
const LADOS_ICO = [16, 32, 48];

/**
 * Aplica o padrão à coleta. A ordem dos itens é a da tela: primeiro o que o
 * navegador procura sozinho, depois o que o HTML declara, depois o manifesto.
 */
export function avaliarPadrao(coleta: ColetaIcones): ItemPadrao[] {
  const cabeca = coleta.html.cabeca;
  const desvio = ondeOHtmlParou(coleta);
  const m = coleta.manifesto.dados;
  const itens: ItemPadrao[] = [];

  // 1. favicon.ico na raiz — é o que o navegador busca sem perguntar a ninguém,
  //    e o que serviço de atalho e agregador costuma ler.
  const fav = coleta.faviconRaiz;
  const faviconServido = fav.status === 200;
  const faviconEhIco = fav.ehIco === true;
  const faltamLados = LADOS_ICO.filter((lado) => !fav.ladosIco.includes(lado));
  itens.push({
    chave: "favicon-ico",
    rotulo: "favicon.ico na raiz",
    ok: faviconServido && faviconEhIco && faltamLados.length === 0,
    peso: 15,
    detalhe: !faviconServido
      ? `Não respondeu na raiz (${fav.status ?? "sem resposta"}).`
      : !faviconEhIco
        ? `Responde, mas o arquivo não é um .ico (${fav.contentType ?? "tipo não declarado"}).`
        : faltamLados.length
          ? `É um .ico com ${fav.ladosIco.join(", ")} px; faltam ${faltamLados.join(", ")}.`
          : `.ico com ${fav.ladosIco.join(", ")} px.`,
  });

  // 2. O HTML precisa declarar o ícone: sem isso, quem monta card e atalho a
  //    partir da página não acha nada, mesmo com o arquivo na raiz.
  const declarados = cabeca?.icones ?? [];
  itens.push({
    chave: "icone-declarado",
    rotulo: "Ícone declarado no HTML",
    ok: declarados.length > 0,
    peso: 10,
    detalhe:
      coleta.html.status !== 200
        ? `A página inicial não respondeu (${coleta.html.status ?? "sem resposta"}).`
        : declarados.length
          ? `${declarados.length} tag(s) <link rel="icon">.`
          : `Nenhuma tag <link rel="icon"> na página inicial.${desvio}`,
  });

  // 3. Apple Touch Icon — o atalho do iPhone. Três exigências, e cada uma já
  //    quebrou em produção: precisa existir, ser PNG (o iOS ignora SVG aqui) e
  //    ser opaco (o iOS pinta alfa de preto).
  const apple = coleta.appleTouch;
  const appleDeclarado = Boolean(cabeca?.appleTouchIcon);
  const appleServido = apple.status === 200;
  const appleEhPng = apple.contentType === "image/png";
  const appleNoTamanho = apple.largura === LADO_APPLE && apple.altura === LADO_APPLE;
  const appleOpaco = apple.opaco === true;
  itens.push({
    chave: "apple-touch-icon",
    rotulo: "Apple Touch Icon",
    ok: appleDeclarado && appleServido && appleEhPng && appleNoTamanho && appleOpaco,
    peso: 25,
    detalhe: !appleDeclarado
      ? `Nenhuma tag <link rel="apple-touch-icon"> na página inicial.${desvio}`
      : !appleServido
        ? `Declarado, mas o arquivo não respondeu (${apple.status ?? "sem resposta"}).`
        : !appleEhPng
          ? `É ${apple.contentType ?? "de tipo não declarado"}. O iOS ignora o que não for PNG aqui e cai na letra do domínio.`
          : !appleNoTamanho
            ? `PNG de ${apple.largura ?? "?"}×${apple.altura ?? "?"}; o esperado é ${LADO_APPLE}×${LADO_APPLE}.`
            : !appleOpaco
              ? "PNG de 180×180, mas com transparência. O iOS pinta alfa de preto."
              : "PNG de 180×180, opaco.",
  });

  // 4. O manifesto precisa ser achável a partir do HTML. Procurar só por um
  //    nome fixo reprova site correto que usa o outro nome — os dois valem,
  //    desde que o `<link rel="manifest">` aponte para ele.
  const manifestoServido = coleta.manifesto.status === 200 && Boolean(m);
  itens.push({
    chave: "manifesto",
    rotulo: "Manifesto do site",
    ok: Boolean(cabeca?.manifest) && manifestoServido,
    peso: 10,
    detalhe: !cabeca?.manifest
      ? manifestoServido
        ? `O arquivo existe em ${coleta.manifesto.caminho}, mas o HTML não o declara.`
        : "Nenhuma tag <link rel=\"manifest\"> e nenhum arquivo nos nomes usuais."
      : manifestoServido
        ? `Declarado e servido em ${coleta.manifesto.caminho}.`
        : `Declarado, mas não respondeu (${coleta.manifesto.status ?? "sem resposta"}).`,
  });

  // 5. Sem `start_url` o navegador não considera o site instalável, por mais
  //    completo que seja o jogo de imagens.
  const temIdentidade = Boolean(m?.name && m?.shortName);
  const temInicio = Boolean(m?.startUrl && m?.display);
  itens.push({
    chave: "manifesto-instalavel",
    rotulo: "Manifesto instalável",
    ok: temIdentidade && temInicio,
    peso: 10,
    detalhe: !m
      ? "Sem manifesto para conferir."
      : [
          m.name ? null : "falta name",
          m.shortName ? null : "falta short_name",
          m.startUrl ? null : "falta start_url",
          m.display ? null : "falta display",
        ]
          .filter(Boolean)
          .join(", ") || `name, short_name, start_url (${m.startUrl}) e display (${m.display}).`,
  });

  // 6. Os dois tamanhos que Android e Chrome pedem.
  const lados = (m?.icones ?? []).map((i) => ladoDeclarado(i.sizes));
  const tem192 = lados.includes(192);
  const tem512 = lados.includes(512);
  itens.push({
    chave: "manifesto-tamanhos",
    rotulo: "Ícones 192 e 512",
    ok: tem192 && tem512,
    peso: 10,
    detalhe: !m
      ? "Sem manifesto para conferir."
      : tem192 && tem512
        ? "192×192 e 512×512 declarados."
        : `Faltando ${[tem192 ? null : "192×192", tem512 ? null : "512×512"].filter(Boolean).join(" e ")}.`,
  });

  // 7. `any` e `maskable`. Só maskable faz o Android recortar num círculo de
  //    80% sem reserva; só `any` deixa o ícone com moldura em vez de preencher
  //    o squircle. O conjunto certo tem os dois.
  const purposes = (m?.icones ?? []).flatMap((i) => (i.purpose.length ? i.purpose : ["any"]));
  const temAny = purposes.includes("any");
  const temMaskable = purposes.includes("maskable");
  itens.push({
    chave: "manifesto-purpose",
    rotulo: "purpose any e maskable",
    ok: temAny && temMaskable,
    peso: 10,
    detalhe: !m
      ? "Sem manifesto para conferir."
      : temAny && temMaskable
        ? "Há entrada any e entrada maskable."
        : temMaskable
          ? "Só maskable: o Android recorta em círculo de 80% e não há reserva any."
          : "Só any: nenhum ícone preenche o squircle do Android.",
  });

  // 8. Declarar não basta: o arquivo tem de responder.
  const servidos = coleta.iconesManifesto.filter((i) => i.status === 200).length;
  const totalIcones = coleta.iconesManifesto.length;
  itens.push({
    chave: "manifesto-servidos",
    rotulo: "Ícones do manifesto no ar",
    ok: totalIcones > 0 && servidos === totalIcones,
    peso: 5,
    detalhe: !m
      ? "Sem manifesto para conferir."
      : totalIcones === 0
        ? "O manifesto não lista nenhum ícone."
        : servidos === totalIcones
          ? `Os ${totalIcones} respondem 200.`
          : `${totalIcones - servidos} de ${totalIcones} não respondem.`,
  });

  // 9. O retângulo que aparece quando o link é compartilhado.
  const og = coleta.ogImage;
  const ogDeclarado = Boolean(cabeca?.ogImage);
  const ogNoTamanho =
    (og.largura ?? 0) >= LADO_OG_MIN.largura && (og.altura ?? 0) >= LADO_OG_MIN.altura;
  itens.push({
    chave: "og-image",
    rotulo: "Imagem de compartilhamento",
    ok: ogDeclarado && og.status === 200 && ogNoTamanho,
    peso: 5,
    detalhe: !ogDeclarado
      ? `Nenhuma tag og:image na página inicial.${desvio}`
      : og.status !== 200
        ? `Declarada, mas não respondeu (${og.status ?? "sem resposta"}).`
        : ogNoTamanho
          ? `${og.largura}×${og.altura}.`
          : `${og.largura ?? "?"}×${og.altura ?? "?"}; o mínimo é ${LADO_OG_MIN.largura}×${LADO_OG_MIN.altura}.`,
  });

  return itens;
}

/** Nota 0–100: soma dos pesos aprovados. Os pesos somam 100. */
export function notaDoPadrao(itens: ItemPadrao[]): number {
  const total = itens.reduce((soma, i) => soma + i.peso, 0);
  if (total === 0) return 0;
  const obtido = itens.reduce((soma, i) => soma + (i.ok ? i.peso : 0), 0);
  return Math.round((obtido / total) * 100);
}

/**
 * Régua mais dura que a do SEO (75/45) de propósito: isto é um padrão de
 * entrega, não uma nota de saúde. Um site entregue passa inteiro ou quase.
 */
export function estadoDoPadrao(nota: number): "ACTIVE" | "WARNING" | "FAIL" {
  return nota >= 90 ? "ACTIVE" : nota >= 60 ? "WARNING" : "FAIL";
}

/** A primeira coisa a resolver, para a lista de domínios mostrar em uma linha. */
export function pendenciaPrincipal(itens: ItemPadrao[]): string | null {
  const reprovados = [...itens].filter((i) => !i.ok).sort((a, b) => b.peso - a.peso);
  return reprovados.length ? reprovados[0].rotulo : null;
}

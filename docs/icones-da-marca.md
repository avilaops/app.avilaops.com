# Ícones da marca a partir de uma logo

Onde fica: **Clientes → (cliente) → Cadastro → Identidade e arquivos**, no bloco
"Ícones a partir da logo", acima da grade de cards de upload.

O que resolve: os cards de Favicon, Ícone 192x192, Ícone 512x512, Apple Touch
Icon, Preview image e Open Graph Image ficavam vazios em quase todo cliente
porque alguém precisava abrir um editor e exportar seis arquivos à mão. O
gerador faz isso a partir da logo que já está no cadastro — o mesmo serviço que
o RealFaviconGenerator presta, só que gravando direto no dossiê, com versão e
procedência.

## O que ele gera

| Card no dossiê   | Arquivo                 | Tamanho  | Observação |
| ---------------- | ----------------------- | -------- | ---------- |
| Favicon          | `favicon.ico`           | 16/32/48 | PNGs embutidos num `.ico` só |
| Ícone 192x192    | `icone-192.png`         | 192×192  | ícone do `site.webmanifest` |
| Ícone 512x512    | `icone-512.png`         | 512×512  | splash do app instalado |
| Apple Touch Icon | `apple-touch-icon.png`  | 180×180  | sempre opaco: o iOS pinta alfa de preto |
| Preview image    | `preview-1200x675.png`  | 1200×675 | prévia 16:9 (WhatsApp, cards internos) |
| Open Graph Image | `open-graph-1200x630.png` | 1200×630 | `og:image` |

A lista vive em `src/lib/marca/especificacoes.ts` e é a mesma que a tela e o
servidor leem. Para acrescentar um formato, mexa só ali.

## Como funciona

1. A logo de origem é qualquer ativo atual do cliente em PNG, JPG, WEBP ou SVG.
   A tela sugere "Logo principal", depois "Símbolo", depois o primeiro que achar.
2. `trim()` corta a moldura vazia em volta da logo (opcional, ligado por padrão)
   — sem isso, uma logo exportada com margem larga sai minúscula dentro do ícone.
3. Cada ícone é desenhado com a logo centralizada (`fit: contain`), com a folga
   escolhida (0 a 40% do lado).
4. SVG entra rasterizado a 600 dpi, para o ícone de 512 px não sair borrado.
5. Fundo: sem cor escolhida, favicon e ícones do manifesto saem transparentes e
   os que exigem opacidade (Apple Touch, preview, OG) saem em branco. Escolhendo
   uma cor, ela vale para todos.
6. Cada arquivo entra como **versão nova** do seu tipo, com a versão anterior
   marcada como não-atual e a origem anotada nas observações
   (`Gerado a partir de "Logo principal" v2 (logo.svg).`).

Por padrão o gerador só preenche o que está faltando. "Refazer também os tipos
que já têm arquivo" é o que permite sobrescrever — um favicon desenhado à mão
não é substituído por um recorte automático sem alguém pedir.

## API

`POST /api/organizations/:id/brand-assets/gerar-icones`

```json
{
  "origemAssetId": "clx…",
  "fundo": "#0A5533",
  "margem": 10,
  "recortar": true,
  "substituir": false,
  "tipos": ["Favicon", "Apple Touch Icon"]
}
```

`tipos` vazio = todos. Responde `201` com os ativos gravados, o trecho de
`<head>` e o `site.webmanifest` prontos para o site do cliente; `409` quando
tudo que foi pedido já existe e `substituir` é `false`.

`GET` na mesma rota lista as logos que servem de origem e quais ícones já
existem — é por onde o n8n consulta antes de disparar a geração.

Toda gravação deixa evento de auditoria `ORGANIZATION_BRAND_ICON_GENERATED` com
o ativo de origem e as opções usadas.

## Conferência visual

Prints dos dois temas em desktop e iPhone, o roteiro do Playwright que os tira e
o passo a passo para repetir estão em
[prints/icones-da-marca/](prints/icones-da-marca/README.md). Dois defeitos de
layout só apareceram ali — lint, tipos e testes passavam com os dois.

## Dependência

`sharp` (0.35.3), declarada em `package.json` e marcada em
`serverExternalPackages` no `next.config.ts`: é binário nativo, e empacotá-la
quebraria a rota no runtime standalone.

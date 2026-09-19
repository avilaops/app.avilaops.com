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

## O ícone do próprio Ávila OS

O mesmo gerador serve a nossa marca. O mestre é
`public/marca/simbolo-avilaops.png` — trocar a marca é trocar esse arquivo e
rodar:

```bash
npm run marca:icones
```

`scripts/gerar-icones-do-site.ts` grava em `public/` o conjunto que o
`src/app/layout.tsx` referencia:

| Arquivo                                 | Tamanho   | Fundo        | Folga | Por quê |
| --------------------------------------- | --------- | ------------ | ----- | ------- |
| `favicon.ico`                            | 16/32/48  | transparente | 2%    | a 16 px cada pixel de tinta conta |
| `favicon-96x96.png`                      | 96×96     | transparente | 2%    | idem, para quem ignora o `.ico` |
| `favicon.svg`                            | 192 px    | transparente | 2%    | o mesmo PNG embutido num SVG |
| `apple-touch-icon.png`                   | 180×180   | branco       | 10%   | o iOS pinta alfa de preto |
| `web-app-manifest-192x192.png`           | 192×192   | branco       | 10%   | `purpose: any` |
| `web-app-manifest-512x512.png`           | 512×512   | branco       | 10%   | `purpose: any` e splash |
| `web-app-manifest-maskable-512x512.png`  | 512×512   | branco       | 22%   | `purpose: maskable` |

A folga de 22% do maskable não é estética: o Android recorta o ícone num círculo
de 80% do lado, e um quadrado centralizado só cabe nesse círculo até ~56% do
lado (56% × √2 ≈ 79%). Ícone maskable sem essa folga sai com a marca cortada.

O favicon de 96 px continua fora de `ICONES_DERIVADOS`: é extra do nosso site, e
como `gerarIcone` recebe a especificação por parâmetro, o script o descreve
localmente sem mexer na tela do cliente.

O maskable **entrou** em `ICONES_DERIVADOS` em 19/09/2026, revertendo a decisão
anterior de deixá-lo de fora. O motivo da exclusão era não acrescentar um card
ao dossiê por causa de um ícone que só o nosso site usava. Deixou de valer
quando o padrão de entrega passou a exigir o maskable em todo site da casa: se
o cliente precisa do arquivo, ele tem de sair do gerador do cliente. Como a
folga dele é diferente da dos outros (22% contra 10%), a especificação ganhou
`margemMinima` — o gerador usa a maior entre a margem escolhida e a mínima do
formato.

`og-default.png` não sai daqui: é um card composto, com tipografia e texto, não
um ícone derivado da marca.

## O padrão de entrega e o módulo de Ícones

O que vale para o nosso site vale para todo site que a casa entrega, e a partir
de 19/09/2026 isso deixou de ser combinado verbal: `/hub-social/icones` confere
o conjunto de cada domínio contra um padrão de nove itens e dá uma nota.

O padrão mora em `src/lib/icones/padrao.ts`, em funções puras — entra o que foi
coletado de um site, sai a lista de aprovados e reprovados. A coleta (buscar os
arquivos, medir dimensão e opacidade, ler o diretório do `.ico`) fica em
`src/lib/icones/auditoria.ts`. A separação existe para o padrão ser testável sem
rede: `tests/unit/icones-padrao.test.ts` cobre os nove itens.

| Item | Peso | O que exige |
|---|---|---|
| `favicon-ico` | 15 | `/favicon.ico` na raiz, .ico de verdade, com 16, 32 e 48 px |
| `icone-declarado` | 10 | ao menos um `<link rel="icon">` na página inicial |
| `apple-touch-icon` | 25 | declarado, PNG, 180×180 e **opaco** |
| `manifesto` | 10 | declarado no HTML e servido |
| `manifesto-instalavel` | 10 | `name`, `short_name`, `start_url` e `display` |
| `manifesto-tamanhos` | 10 | ícones de 192 e 512 |
| `manifesto-purpose` | 10 | ao menos um `any` e um `maskable` |
| `manifesto-servidos` | 5 | todo ícone listado responde 200 |
| `og-image` | 5 | `og:image` declarada, de 1200×630 para cima |

A régua é mais dura que a do SEO (75/45): aprovado a partir de 90, atenção a
partir de 60. Padrão de entrega se cumpre inteiro ou quase — uma nota 80 num
site entregue quer dizer que alguma plataforma vai mostrar a marca errada.

O Apple Touch Icon pesa 25 porque é o item que mais falha e o mais visível: é o
atalho na tela inicial do iPhone. Três causas já chegaram a produção — apontar
para um SVG (o iOS ignora e cai na letra do domínio), sair fora de 180×180, e
sair com alfa (o iOS pinta transparência de preto).

O manifesto é procurado onde o `<link rel="manifest">` do HTML manda, e só
depois em `/site.webmanifest` e `/manifest.json`. Cravar um nome fixo reprovava
site correto: a auditoria de SEO fazia isso e reprovava justamente quem tinha
seguido a instrução da casa, que manda publicar `site.webmanifest`.

A tela também mostra o `<head>` e o `site.webmanifest` prontos para copiar, com
os nomes de arquivo que o gerador do dossiê produz — é a mesma
`especificacoes.ts`, então instrução e arquivo nunca divergem.

## Conferência visual

Prints dos dois temas em desktop e iPhone, o roteiro do Playwright que os tira e
o passo a passo para repetir estão em
[prints/icones-da-marca/](prints/icones-da-marca/README.md). Dois defeitos de
layout só apareceram ali — lint, tipos e testes passavam com os dois.

## Dependência

`sharp` (0.35.3), declarada em `package.json` e marcada em
`serverExternalPackages` no `next.config.ts`: é binário nativo, e empacotá-la
quebraria a rota no runtime standalone.

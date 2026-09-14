# n8n no celular: o cabeçalho das listas rola junto (11/09/2026)

## O problema

Na Visão geral do n8n (e nas listas de workflows, credenciais e execuções) o
cabeçalho é fixo: título, subtítulo, botão, cartões de métricas, abas, busca,
ordenação e filtros. A lista rola sozinha num bloco absoluto abaixo disso. No
iPhone o cabeçalho toma mais da metade da tela e sobram dois cartões de fluxo.

O n8n não tem opção de CSS próprio, e o Caddy padrão não reescreve corpo de
resposta. A saída foi o **template do Caddy**.

## Como funciona

No servidor apps-noclient (204.168.249.111), bloco `n8n.avilaops.com` do
`/etc/caddy/Caddyfile`:

1. Toda navegação HTML do editor (GET, `Accept: text/html`, caminho sem ponto
   e fora de `/rest`, `/webhook*`, `/form*`, `/api`, `/assets`, etc.) é
   respondida por `/opt/n8n/override/index.html`, um template Caddy de uma
   linha: `httpInclude "/__n8n_index"` busca o HTML atual no próprio n8n e
   `replace` injeta `<link rel="stylesheet" href="/avila-n8n-mobile.css">`
   antes de `</head>`. Nada é copiado a mão: trocar a versão do n8n não quebra.
2. `/avila-n8n-mobile.css` é servido de `/opt/n8n/override`.
3. Todo o resto vai direto ao n8n em 127.0.0.1:5678, com `flush_interval -1`
   por causa do WebSocket.

A folha (`avila-n8n-mobile.css`), só até 820px:

- `[data-test-id="resources-list-wrapper"]` deixa de ser absoluto; a lista
  paginada perde a altura e o overflow próprios; os pais soltam a altura via
  `:has()`. Com isso quem rola é o contêiner da página, e o cabeçalho sobe
  junto.
- Subtítulo escondido, título menor, menos respiro em volta do botão.

Seletores só por `data-test-id`, que o n8n mantém entre versões. Nenhuma
classe com hash.

## Prova

Playwright a 390×844, logado como `claude@avilaops.com`, com quinze fluxos de
teste (apagados depois):

| Medida | Antes | Depois |
|---|---|---|
| Topo do primeiro cartão | 283 px | 250 px |
| Após rolar 260 px: topo do título | 16 px (fixo) | −244 px (saiu da tela) |
| Quem rola | só a lista | a página |

Conferido também: `/rest/settings` continua JSON, webhooks respondem 403 sem
token, assets JS chegam do n8n, `/api/v1` responde 200.

## Onde está a cópia

`arxisvr.avilaops.com/deploy/Caddyfile.apps-noclient` (fonte do Caddyfile
daquele servidor) e `arxisvr.avilaops.com/deploy/n8n-override/`.

## Usuário claude@ no n8n

Para medir a tela foi criado o membro `claude@avilaops.com` (papel member,
sem licença para admin). Senha em `/etc/avilaops/tokens.env`
(`N8N_CLAUDE_PASSWORD`). Membro só vê o próprio projeto; para ver a lista de
todos os fluxos continua sendo preciso o login do dono.

## Identidade visual das credenciais (12/09/2026)

A mesma camada de override injeta `avila-n8n-credentials.css` e
`avila-n8n-credentials.js` na interface. O script atua somente na tela
`/home/credentials`, reconhece o nome visível da credencial e troca apenas o
ícone apresentado no cartão — nenhuma credencial, valor secreto ou workflow é
alterado.

Os SVGs ficam em `/opt/n8n/override/avila-credential-icons/` e cobrem dez
famílias: Ávila/Auth, Mail, SMS, Cloudflare, Comandeiro, Google, Lojas, Mercado
Pago, n8n e PostgreSQL. O `MutationObserver` reaplica a identidade quando a
lista virtualizada muda por busca, rolagem ou paginação. O cartão também recebe
uma borda lateral e um realce discreto na cor da família.

A fonte versionada desses arquivos está em
`arxisvr.avilaops.com/deploy/n8n-override/`; as rotas estáticas correspondentes
estão no bloco do n8n em `deploy/Caddyfile.apps-noclient`.

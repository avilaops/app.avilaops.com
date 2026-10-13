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

## Settings no celular (10/10/2026)

Em Settings o n8n põe o menu numa coluna lateral de no mínimo 200 px e dá
48 px de respiro de cada lado ao conteúdo. A 390 px sobravam 94 px úteis: uma
palavra por linha. A mesma folha (`avila-n8n-mobile.css`, agora `?v=3` no
`index.html` do override) trata isso até 820 px:

- a grade de Settings perde a coluna lateral; o menu vira uma faixa de uma
  linha no topo, com rolagem lateral;
- o item aberto (`aria-current="page"`) vai para o começo da faixa;
- o conteúdo fica com 16 px de respiro (358 px úteis a 390 px).

Âncora: `[data-test-id="settings-back"]`, que só existe nessa tela. A grade de
Settings fica dentro da grade do aplicativo (as duas têm a classe `app-grid`);
`.app-grid:has(> #sidebar [data-test-id="settings-back"])` escolhe só a de
dentro.

O n8n voltou para o servidor `applications` em 08/10/2026: os arquivos estão em
`/opt/n8n/override` lá, e a fonte versionada continua em
`arxisvr.avilaops.com/deploy/n8n-override/`.

Prova: Playwright a 390×844 no `apps-noclient`
(`/opt/build/n8n-settings-celular/rodar.sh`), na homologação com a conta do
dono (seis telas de Settings) e em produção com `claude@avilaops.com`
(Personal, n8n API e Instance-level MCP, que passou a caber numa tela).

## Janela de credencial no celular (12/10/2026)

Na janela de uma credencial o n8n põe o menu (Connection, Sharing, Details) numa
coluna lateral que cresce. A 390 px o menu tomava 304 px e o formulário ficava
com 8 px: não dava para preencher nem ler nada. A mesma folha
(`avila-n8n-mobile.css`, agora `?v=5`) trata isso até 820 px:

- a janela usa quase a tela toda (largura da tela menos 56 px, 86% da altura);
- o menu vira uma faixa de uma linha no topo;
- o conteúdo fica com a largura toda (334 px úteis a 390 px) e rola sozinho.

Âncoras: `[data-test-id="editCredential-modal"]` (a janela) e
`[data-test-id="credential-edit-dialog"]` (menu + conteúdo; o menu é o primeiro
bloco quando há outro depois dele).

Prova: Playwright a 390×844 e a 1280×800 no `apps-noclient`, em produção com
`claude@avilaops.com`, abrindo uma credencial nova de Header Auth sem salvar
(`~/.agents/claude/out/n8n-credencial-celular/rodar.sh` no `creators`). A 1280 px
o print saiu idêntico ao de antes. Não conferido: credencial com OAuth (botão de
conectar) e a aba Details de uma credencial já salva.

## Varredura do editor no celular (13/10/2026)

Varredura a 390×844 das telas que ainda não tinham sido tratadas, com um
workflow de teste (gatilho manual + Set, dados fixados) criado no projeto
pessoal de `claude@avilaops.com` e apagado no fim. A folha
(`avila-n8n-mobile.css`) passou para `?v=6` com quatro seções novas, descritas
abaixo. Roteiro: `~/.agents/claude/out/n8n-celular-varredura/rodar.sh` no
`creators` (`criar`, `varrer <rotulo> [arquivo.css]`, `apagar`); o Playwright
roda no `apps-noclient`. Prints em `antes/`, `depois/` (estilo injetado só na
sessão) e `publicado/` (produção, sem injeção).

Prova geral: os 25 prints a 1280×800 saíram idênticos byte a byte antes e
depois de publicar; os 52 prints publicados saíram idênticos aos da prova com
estilo injetado; as telas já tratadas (listas de credenciais e de workflows,
Settings, janela de credencial) saíram idênticas a 390 px.

### Janelas simples no celular (13/10/2026)

As janelas simples do n8n (escolher o tipo de credencial, configurações do
workflow, duplicar) têm largura em porcentagem e um mínimo fixo de 420 px. A
390 px a janela passava da tela: o botão de fechar e a ponta dos campos ficavam
cortados. Agora a janela fica com a largura da tela menos 8 px de cada lado
(374 px a 390 px).

Âncora: `.el-dialog[data-test-id$="-modal"]` (classe da biblioteca, sem hash;
toda janela desse tipo recebe um `data-test-id` terminado em `-modal`). A
janela de credencial (`editCredential-modal`) é de outro tipo e não é tocada.
Esta regra vale só até 436 px (420 + 16), e não até 820 px como o resto: acima
disso o mínimo de 420 px já cabe.

Conferido com print: escolher o tipo de credencial (com a lista de busca
aberta), configurações do workflow e duplicar. Não conferido: as demais janelas
do mesmo tipo (publicar, importar de URL, compartilhar, sobre, 2FA etc.).

### Painel do nó no celular (13/10/2026)

Com um nó aberto o n8n mostra três colunas lado a lado: entrada, parâmetros e
saída. A 390 px a entrada e a saída ficavam em tiras de 62 px e os parâmetros
em 215 px. Agora, até 820 px, cada coluna ocupa a largura do painel menos
28 px (312 px a 390 px) e as três rolam de lado, com encaixe. A ordem passa a
ser parâmetros, saída, entrada; a beirada da coluna seguinte fica à vista para
mostrar que há mais ao lado.

Âncoras: `[data-test-id="ndv"]` (o painel), o `<main>` dele (as três colunas),
`[data-test-id="ndv-input-panel"]` e `[data-test-id="output-panel"]`.

Conferido com print: nó Set com dados fixados, nas três colunas; o painel abre
com dois toques seguidos no nó (toque emulado pelo Chromium). Não conferido:
iPhone de verdade (Safari), nó de gatilho (sem coluna de entrada), nó de IA com
subnós, o painel aberto a partir de uma execução e o editor de expressão.

Limitações (não se resolvem com CSS): arrastar um campo da entrada para um
parâmetro, já que as duas colunas não ficam mais visíveis juntas; e redimensionar
as colunas pelas alças.

### Editor de workflow no celular (13/10/2026)

No canvas o botão "Execute workflow" fica embaixo, à direita, na mesma linha
dos controles de zoom. A 390 px os dois não cabem lado a lado e o botão cobria
o último controle (organizar). Agora, até 820 px, o botão sobe uma linha e fica
acima dos controles.

Âncoras: `[data-test-id="canvas-wrapper"]` e
`[data-test-id="execute-workflow-button"]`.

Sem ajuste, porque já cabiam: a barra superior (nome, menu, Publish), as abas
Editor/Executions/Evaluations, o menu do workflow, o seletor de nós ("+", que
ocupa a largura toda) e a aba de execuções com o detalhe de uma execução (o
n8n já empilha a lista em cima e a prévia embaixo; a lista fica com cerca de
170 px de altura).

Não conferido: workflow com vários gatilhos (o botão de executar ganha um
seletor e fica mais largo), workflow em execução (botão de parar), a janela de
publicar e a aba Evaluations.

Limitações (não se resolvem com CSS): arrastar nós e ligar conexões com o dedo
dependem do tratamento de toque do canvas e não foram testados nem alterados; o
botão "Execute workflow" que aparece ao lado do gatilho só surge ao passar o
ponteiro, então no celular vale o botão de baixo.

### Credencial OAuth no celular (13/10/2026)

Na janela de uma credencial OAuth2, o aviso "Connect your account to use this
credential" fica ao lado do botão de conectar. A 390 px o botão tomava a maior
parte da linha e o texto quebrava em cinco linhas de uma palavra. Agora, até
820 px, o texto fica em cima e o botão embaixo. O resto da janela já estava
certo com o ajuste de 12/10/2026.

Âncora: `[data-test-id="oauth-not-connected-banner"]` (texto + botão).

Conferido com print: Google Sheets OAuth2 API, credencial nova, com Client ID e
Client Secret preenchidos com valores de teste só para o botão aparecer; nada
foi salvo e o botão não foi tocado. Não conferido: o fluxo de conectar em si (a
janela do Google), o aviso de conta já conectada e credencial OAuth de outro
provedor.

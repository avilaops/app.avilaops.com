# Sistema visual do Ávila Ops

Atualizado em 17/09/2026. Vale para toda tela nova do painel. O código dos tokens está no fim de `src/app/globals.css`, na seção "Sistema visual".

## Princípio

Claro primeiro, pouca borda, muito espaço. A profundidade vem do contraste entre o fundo cinza e a superfície branca, não de contorno ou sombra pesada. Cada elemento pertence a um grupo; cartão solto é exceção, não padrão.

Aproximadamente 85% da tela é neutra. As três cores da marca aparecem em ícones, estados ativos e sinais de estado.

## Cores

| Token | Uso |
|---|---|
| `--fundo` | fundo da página (cinza bem claro no tema claro) |
| `--superficie` | cartões, listas, barras (branco) |
| `--superficie-suave` | superfície dentro de superfície, campos |
| `--separador` | fio entre linhas da mesma superfície |
| `--texto` | texto principal, quase preto |
| `--texto-secundario` | descrição, rótulo |
| `--texto-terciario` | chevron, legenda |
| `--marca-azul` | operação, infraestrutura, ação primária, item ativo |
| `--marca-vermelho` | o que fala com o cliente (Casa, WhatsApp, Meta), erro |
| `--marca-amarelo` | o que faz crescer (Hub Social, Crédito), atenção |
| `--marca-*-suave` | fundo do quadradinho de ícone e do estado ativo |

Os nomes antigos (`--bg`, `--surface`, `--line`, `--text`, `--muted`, `--blue`…) continuam valendo: os novos apontam para eles, então nenhuma tela antiga quebrou. Tela nova usa os nomes novos.

Tema escuro continua existindo pelo botão da barra; o padrão é claro.

## Tipografia

Manrope, carregada por `next/font` em `src/app/layout.tsx` e exposta em `--fonte`.

| Papel | Tamanho | Peso |
|---|---|---|
| Título de tela (`h1`) | 1,75rem (1,625rem no celular) | 700, `-0.03em` |
| Título de grupo | 0,75rem em caixa alta | 600, `0.06em` |
| Título de linha | 0,9375rem | 600 |
| Descrição | 0,8125rem | 400, `--texto-secundario` |
| Valor à direita | 0,875rem | 400 |
| Mono (`--mono`) | só dado técnico: id, endpoint, token, log | — |

## Espaço, raio e sombra

- Espaço: `--e1` 4px, `--e2` 8, `--e3` 12, `--e4` 16, `--e5` 20, `--e6` 24, `--e7` 32, `--e8` 40, `--e9` 48. Nada fora da escala.
- **A escala tem um degrau no celular.** Até 820px, os degraus grandes encolhem: `--e5` 16, `--e6` 18, `--e7` 22, `--e8` 28, `--e9` 34. `--e1` a `--e4` não mudam. Quem escreve componente continua usando `var(--e6)` e não precisa saber disso — o valor certo chega pelo token.
- Raio: `--raio-p` 10px (ícone, botão), `--raio-m` 14px (superfície de lista), `--raio-g` 20px (área de conteúdo do desktop). A cápsula da barra de abas usa 26px, que é metade da altura dela.
- Sombra: `--sombra-1` para superfície apoiada, `--sombra-2` só para o que flutua (barra de abas). Não existe terceira.

## Densidade do celular

A escala acima é a do desktop. Abaixo de 820px ela sobrava: uma linha de lista
gastava 70px, um cartão de movimentação 176px e cinco campos de formulário
comiam a tela inteira. Os tokens da régua do celular ficam num `@media
(max-width: 820px)` logo depois do `:root` da seção "Sistema visual". Quem for
compactar uma tela nova mexe neles, não em cada componente.

| Token | Valor | O que governa |
|---|---|---|
| `--cel-pad-pagina` | 16px | recuo lateral do `.main-canvas` |
| `--cel-gap-secao` | 14px | distância entre grupos da mesma tela |
| `--cel-pad-cartao` | 12px | respiro interno de cartão e painel |
| `--cel-linha` | 50px | altura mínima de linha de lista (55px com descrição) |
| `--cel-controle` | 48px | altura de campo, select e botão do CEP |
| `--cel-gap-campo` | 14px | distância entre campos do mesmo formulário |
| `--cel-raio` | 14px | raio de superfície no celular |
| `--cel-nav` | 62px | altura real da barra de abas, usada no `padding-bottom` do conteúdo |

Medido em produção a 390x844, antes e depois da compactação de 19/09/2026:

| O que | Antes | Depois |
|---|---|---|
| Campo do formulário da ficha | 141px | 70px |
| Movimentação do financeiro | 139px | 104px (119px com vínculo) |
| Cartão da ficha do cliente | 255px | 211px |
| Grade de quatro métricas | 278px | 219px |
| Cápsula da barra de abas | 56px | 50px |
| Linha de lista do sistema | 57px | 55px |
| Ficha do cliente (página) | 1.863px | 1.493px |
| Financeiro (página) | 3.089px | 2.805px |

Eles não encolhem alvo de toque nem fonte de campo: o que é tocável continua
com 44px ou mais (`.tab-item` 48, `.primary-button`/`.secondary-button` 46,
`.row-action` e `.scope-select` 44) e campo de formulário continua com 16px de
fonte, senão o Safari dá zoom ao focar.

Tipografia no celular: `h1` 26px, título de grupo 18px, linha 15px, descrição
13px, rótulo de campo 13px, texto de campo 16px, rótulo de aba 11px.

## Componentes

Em `src/components/sistema/`:

| Componente | O que é |
|---|---|
| `Grupo` | título opcional + superfície branca com as linhas dentro |
| `LinhaLink` | linha que navega: ícone, título, descrição, valor à direita, chevron |
| `LinhaInfo` | linha só de leitura |
| `IconeTile` | quadrado 32px com o ícone na cor do contexto (`tom`: azul, vermelho, amarelo, neutro) |
| `CabecalhoTela` | botão voltar circular opcional, ícone, título, descrição e ações à direita |

Ícones: `src/components/ui/Icones.tsx`, traço de 1,8px em grade de 24px. Não há segunda biblioteca de ícones nas telas novas.

## Navegação

- **Celular:** barra de abas flutuante em cápsula, afastada 16px das laterais, respeitando a safe area. Cinco destinos: Início, Clientes, Entregas, Financeiro e Mais. O item aceso é uma peça branca dentro da cápsula, com o ícone em azul — sem linha atravessando a tela.
- **Mais:** uma tela (`/mais`), não uma folha com sanfonas. Blocos "Operação" e "Gestão", cada um uma superfície com uma linha por grupo. Tocar navega para `/mais/<grupo>`, que lista os destinos daquele assunto e traz o botão voltar circular. Um nível por vez.
- **Desktop:** coluna à esquerda sem borda nem fundo próprio, item aceso com superfície branca e sombra discreta, ícone na cor do grupo. O conteúdo fica numa superfície branca com raio grande, separada do fundo.
- A lista de destinos é uma só, em `src/lib/navegacao.ts`, com ícone e descrição por item. Quem cria tela nova registra ali e ela aparece no celular e no desktop.

## Estados

| Estado | Como aparece |
|---|---|
| Hover (desktop) | fundo `--hover-bg`, sem mudar a borda |
| Pressionado (celular) | fundo `--active-bg` |
| Foco por teclado | contorno de 2px em `--marca-azul` |
| Item ativo | superfície branca + sombra 1 (desktop) ou peça na cápsula (celular) |
| Movimento | 120–160ms; `prefers-reduced-motion` desliga |

## Alvos de toque

Mínimo de 44px no celular: aba tem 48px, botão de tela 46px, ação de linha e
select de escopo 44px, botão voltar tem 40px com área de toque de 44px. Campo
de formulário tem 16px de fonte abaixo de 820px, para o Safari não dar zoom.
A linha de lista tem 52px de altura mínima (58 com descrição) e é tocável por
inteiro — a altura da linha não é o alvo de toque de um controle dentro dela.

## Estados do sistema

| Estado | Componente | Onde |
|---|---|---|
| Carregando | `EsqueletoTela` / `EsqueletoLista` (`components/sistema/Esqueleto.tsx`) | `loading.tsx` de `/operacao`, `/clientes`, `/projetos`, `/leads`, `/hub-social` e `/financeiro` |
| Erro | `EstadoErro` (`components/sistema/EstadoErro.tsx`) | `error.tsx` das mesmas áreas; mensagem humana, detalhe técnico recolhido e "Tentar de novo" |
| Vazio | `LinhaInfo` dentro do `Grupo`, ou `EstadoVazio` no Hub Social | Home, catálogo, listas |
| Destrutivo | `Confirmacao` (`components/sistema/Confirmacao.tsx`) | substituiu os seis `window.confirm`: diz o que acontece, sobre qual item e se dá para desfazer |

O esqueleto tem a forma da tela que vai chegar (ícone, título, valor), não um círculo girando. Com `prefers-reduced-motion` ele para de brilhar.

## Status

Um mapa só: `src/lib/status-rotulos.ts` (status interno → rótulo em português → tom). O componente é `components/sistema/Status.tsx`, usado por 23 telas. Tons: `bom` verde, `atencao` âmbar, `ruim` vermelho, `info` azul, `neutro` cinza. O valor cru (`ACTIVE`, `RECEIVED`) vai para o `title`, nunca para o texto.

## Barra de ferramentas

`.barra-ferramentas` no catálogo de serviços é o padrão: busca à esquerda (cresce), filtros do lado, ação primária à direita. Campo e select têm 40px, sem borda, com sombra 1 e foco azul. Abaixo de 560px a barra quebra em linhas.

## Listas que eram cartões

Três lugares trocaram cartão-dentro-de-cartão por superfície única com fio
entre as linhas, que é o padrão da casa:

- **Movimentações bancárias** (`.tx-row` abaixo de 820px): três andares — o quê
  + valor, quem + quando, e a linha de decisão (escopo, situação, ação). O
  andar do vínculo só existe quando há vínculo. De 176px para 120px.
- **"Só o cliente responde"** no assistente de cadastro: usa `Grupo` +
  `LinhaInfo`, não seis caixas tracejadas.
- **Contatos recentes** da newsletter: e-mail, identificação, e uma faixa com
  etiqueta, estado e ação. De 139px para ~112px por contato.

Não existe borda tracejada no sistema. O que é discreto fica discreto pelo tom
da superfície (`--superficie-suave`), como o aviso de ambiente do assistente.

## Resumo numérico

`.servicos-resumo` é uma superfície única dividida por separadores internos — não são quatro cartões. Na Home, o mesmo papel é feito por linhas com o número à direita (`.linha-numero`), porque quase todos os valores são pequenos.

## Home

Ordem no celular: saudação com o que pede atenção, atalhos (quatro, conforme o papel), fila de atenção, clientes recentes, resumo e financeiro. No desktop (≥1100px) vira duas colunas: fila e carteira à esquerda, resumo e financeiro à direita. Todo número vem de `getOperationsDashboard()`.

## Área técnica

`.detalhes-tecnicos` é um `<details>` fechado: id, código interno, endpoint. O catálogo usa para os códigos `DOMAIN`, `PDF_CATALOG` etc., que saíram do título dos grupos.

## Hub Social

Os primitivos das telas do Hub Social (`components/hub-social/`) foram reescritos em 18/09/2026 sobre as classes do sistema — não há mais uma segunda linguagem visual:

| Primitivo | O que virou |
|---|---|
| `GradeMetricas` + `Metrica` | uma superfície só (`.metricas`): no celular, uma linha por métrica com o número à direita; no desktop, colunas lado a lado separadas por fio. Acabou o quarto cartão órfão |
| `ListaChaveValor` | `.kv-lista`: rótulo e valor por linha, valor técnico em monoespaçada com botão de copiar |
| `EstadoVazio` | `.estado-vazio`: superfície clara, sem borda tracejada, com a ação que resolve |
| `CabecalhoPagina` | chama `CabecalhoTela`; `eyebrow` e `meta` continuam para o SEO |
| `AbasHubSocial` | `.abas-hub`: cápsula clara numa linha só, aba ativa como peça branca, rolagem horizontal quando não cabe |

Cartões do shadcn que restam nas telas seguem o contrato por CSS: sem contorno, raio médio, sombra 1. Campos de formulário mantêm um fio no tom do separador.

## Complemento do PR #55

A compactação já integrada na main usa os tokens --cel-*; não há segunda régua --d-*. A escala --e5 a --e9 encolhe no celular. Textareas começam com 56px e crescem com o conteúdo quando o navegador suporta field-sizing. O assistente preserva o botão Preencher que leva ao campo, com a explicação completa sem truncamento.

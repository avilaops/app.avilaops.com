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
| Título de tela (`h1`) | 1,75rem (1,875rem no celular) | 700, `-0.03em` |
| Título de grupo | 0,75rem em caixa alta | 600, `0.06em` |
| Título de linha | 0,9375rem | 600 |
| Descrição | 0,8125rem | 400, `--texto-secundario` |
| Valor à direita | 0,875rem | 400 |
| Mono (`--mono`) | só dado técnico: id, endpoint, token, log | — |

## Espaço, raio e sombra

- Espaço: `--e1` 4px, `--e2` 8, `--e3` 12, `--e4` 16, `--e5` 20, `--e6` 24, `--e7` 32, `--e8` 40, `--e9` 48. Nada fora da escala.
- Raio: `--raio-p` 10px (ícone, botão), `--raio-m` 14px (superfície de lista), `--raio-g` 20px (área de conteúdo do desktop). A cápsula da barra de abas usa 26px, que é metade da altura dela.
- Sombra: `--sombra-1` para superfície apoiada, `--sombra-2` só para o que flutua (barra de abas). Não existe terceira.

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

Mínimo de 44px no celular: linha de lista tem 56px, aba tem 48px, botão voltar tem 40px com área de toque de 44px. Campo de formulário tem 16px de fonte abaixo de 820px, para o Safari não dar zoom.

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

## Resumo numérico

`.servicos-resumo` é uma superfície única dividida por separadores internos — não são quatro cartões. Na Home, o mesmo papel é feito por linhas com o número à direita (`.linha-numero`), porque quase todos os valores são pequenos.

## Home

Ordem no celular: saudação com o que pede atenção, atalhos (quatro, conforme o papel), fila de atenção, clientes recentes, resumo e financeiro. No desktop (≥1100px) vira duas colunas: fila e carteira à esquerda, resumo e financeiro à direita. Todo número vem de `getOperationsDashboard()`.

## Área técnica

`.detalhes-tecnicos` é um `<details>` fechado: id, código interno, endpoint. O catálogo usa para os códigos `DOMAIN`, `PDF_CATALOG` etc., que saíram do título dos grupos.

## Ponte com o Hub Social

As sete telas do Hub Social usam primitivos próprios em Tailwind (`components/hub-social/`). Elas obedecem ao mesmo contrato de superfície por CSS: cartão sem contorno, raio médio, sombra 1, aba ativa como peça clara. Quando forem reescritas, devem passar a usar `Grupo`/`LinhaLink` direto.

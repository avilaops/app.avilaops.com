# Ávila OS no iPhone — auditoria e redesenho (29/08/2026)

> Painel interno `app.avilaops.com`. Objetivo: usar do iPhone com uma mão,
> com o comportamento de um app nativo (Human Interface Guidelines), sem
> perder o desktop. Este documento é a auditoria, a decisão de navegação, o
> desenho de cada tela prioritária e o checklist de QA. O código que aplica
> tudo isso está no mesmo commit.

## 1. Auditoria por tela

Capturas de 29/08 (iPhone, Safari). A raiz de quase tudo era a mesma: as telas
foram desenhadas em grade de desktop e "quebradas" para o celular só
reduzindo colunas — o que espreme, não reorganiza.

### 1.1 Formulário de planos (Catálogo de serviços) — o pior caso

| Problema visto | Causa | Solução aplicada |
|---|---|---|
| "Ciclo" e "Status" colados ao valor (`CicloMensal`, `StatusAtivo`), setas do select ilegíveis | `label` inline com `select` nativo, sem `gap`, em grade de 2 colunas de ~150 px | Um campo por linha, rótulo acima do campo, select de 48 px com chevron próprio (`appearance: none`) |
| "Descrição" com rótulo à esquerda e texto cortado | `label` em `flex-row`, textarea de 2 linhas | Textarea de 3 linhas, largura total, rótulo acima |
| "Salvar" pequeno, meio-alinhado, um por plano, oito formulários abertos ao mesmo tempo | Cada plano era um `<form>` com todos os campos expandidos | Lista: uma linha por plano (nome, ciclo, status, preço, chevron). Toque abre a **folha de edição** com "Salvar alterações" fixo no rodapé (50 px) |
| Preço "A definir" e "R$ 60,00" sem contexto | `strong` solto no fim da grade | Preço à direita da linha, em mono; "A definir" em cinza |
| Seções `DOMAIN`, `BRAND_IDENTITY` como título | O código do tipo era o eyebrow | Nome legível como título (`Identidade visual`), código em mono pequeno ao lado |
| Nenhum feedback depois de salvar | Mensagem no fim da página, fora da tela | Toast de 2,8 s acima da barra de abas; a folha fecha sozinha |
| Slug digitado à mão para criar | Campo obrigatório vazio | Slug gerado do nome até a pessoa digitar um |

### 1.2 Visão central (dashboard)

| Problema | Solução |
|---|---|
| Cabeçalho sem hierarquia: título de 20 px, dois botões soltos | **Large Title** (28 px) + subtítulo; botões em grade 2 × 1 de 50 px |
| Seis métricas em cartões de 3 colunas ficavam ilegíveis a 375 px | Abaixo de 560 px viram lista agrupada (rótulo à esquerda, número à direita) — padrão *inset grouped* |
| "Clientes recentes" não clicava | Cada linha é um link para a ficha, com chevron |
| Fila de atenção com data espremida | Linhas de 60 px, título quebra em duas linhas, data na segunda linha |
| Cantos de 10 px, "página" em vez de "app" | Raio 16 px nos painéis, 12 px em botões |

### 1.3 Financeiro

| Problema | Solução |
|---|---|
| Tabela de 8 colunas com rolagem horizontal — valor e ação sumiam | `TransactionList`: grade que é tabela no desktop e **cartão de três andares** no celular (o quê + valor / quem + quando / escopo + estado + ação). DOM único, sem duplicar |
| Quatro botões de ação de tamanhos diferentes | "Sincronizar agora" (primário) em largura total; os três secundários em grade 2 colunas |
| Filtros em três linhas (5 estados × 4 escopos) | Chips roláveis na horizontal, 36 px de altura, sem barra de rolagem |
| Editor de conciliação abria em `position:absolute` e vazava para fora da tela | "Revisar" abre uma `Sheet` com campos de 48 px (celular) / janela centrada (desktop) |
| "Novo lançamento" abria janela centralizada com borda quadrada | Vira folha que sobe do rodapé, com `safe-area` |

### 1.4 Lista de clientes

| Problema | Solução |
|---|---|
| Linha de 92 px com 4 colunas; nome, sinais e status disputavam espaço | Duas linhas: identidade + status + chevron; abaixo, 4 números (2 × 2 abaixo de 400 px) |
| Só o nome era clicável | O nome estende a área de toque para a linha inteira (`::after` cobrindo a linha) |

### 1.5 Header / navegação global

| Problema | Solução |
|---|---|
| Barra "Ávila Ops + Menu ☰ + ☾ + Sair" de 4 blocos, 20 destinos atrás de um botão | **Barra superior** só com marca e tema (52 px + safe-area, fundo translúcido com blur). **Barra de abas** fixa no rodapé com Início, Clientes, Financeiro e "Mais". A folha "Mais" traz o sistema inteiro agrupado, quem está logado e "Sair" |
| Conteúdo colado no indicador de início do iPhone | `viewport-fit=cover` + `env(safe-area-inset-bottom)` na barra de abas e no padding do conteúdo |
| Campos com fonte < 16 px faziam o Safari dar zoom ao focar | `input, select, textarea { font-size: 16px }` abaixo de 820 px |

### 1.6 Tipografia e espaçamento

- Corpo passa de 14 px para 15 px no celular; títulos de painel de 15 px para 17 px.
- Tudo em `rem` — segue o tamanho de texto do sistema (Dynamic Type do Safari).
- Grade de 4 px; alturas fixas: linha 52–60 px, botão primário 50 px, campo 48 px, chip 36 px.

## 2. Arquitetura de navegação (decisão)

**Barra de abas, não sidebar colapsável.** Motivos:

1. A operação diária cabe em três destinos (Início, Clientes, Financeiro);
   os outros dezessete são eventuais. Abas colocam os três a um toque, sem
   abrir nada. Com "Mais" são quatro abas — 94 px cada em 375 px, rótulo
   legível sem mirar. Entregas (projetos) foi para a folha em 30/08: o dia a
   dia de prazo mora no Todoist, não no app.
2. "Mais" como folha (não como hambúrguer no topo) fica na zona do polegar.
3. O desktop mantém a coluna à esquerda — o mapa de destinos é um só
   (`src/lib/navegacao.ts`) e alimenta as duas formas.

Estados ativos: a aba Financeiro acende em qualquer tela do financeiro
(visão geral, conciliação, contas, importação, Mercado Pago, relatórios);
"Mais" acende quando a tela atual não pertence a nenhuma aba.

## 3. Wireframes textuais

### Visão central (≤ 820 px)

```
┌───────────────────────────────┐  safe-area-top
│ [A] Ávila Ops            ☾    │  barra superior 52px, blur
├───────────────────────────────┤
│ Visão central                 │  large title 28px
│ O que precisa de decisão…     │
│ ┌─────────────┬─────────────┐ │
│ │ + Adicionar │ Abrir       │ │  2 botões de 50px
│ │   cliente   │ financeiro  │ │
│ └─────────────┴─────────────┘ │
│ ● Operação disponível · 3 at. │  faixa de estado
│ ┌───────────────────────────┐ │
│ │ Clientes ativos         4 │ │  lista agrupada
│ │ Projetos abertos        2 │ │  (rótulo | número)
│ │ Tarefas abertas   1 venc. │ │
│ └───────────────────────────┘ │
│ Fila de atenção          (5)  │
│ ● Renovar domínio x.com.br    │  linhas 60px
│   Cliente · Projeto  12 set   │
│ Saldo disponível              │
│ R$ 12.345,67                  │  28px mono
│ [ Abrir controle financeiro ] │
│ Clientes recentes  Ver todos  │
│ [AB] Nome do cliente  Ativo › │  linha-link 60px
├───────────────────────────────┤
│   ⌂        👥        💳       ⋯  │  barra de abas 56px
│ Início   Clientes  Financeiro  Mais
└───────────────────────────────┘  safe-area-bottom
```

### Catálogo de serviços + folha de edição

```
│ Catálogo de serviços          │
│ 14 planos em 6 tipos…         │
│ [ + Novo plano               ]│  50px
│ Identidade visual  BRAND_ID.  │  seção
│                     Adicionar │
│ ┌───────────────────────────┐ │
│ │ Identidade Visual Essen… ›│ │  linha 56px
│ │ Pagamento único · Padron… │ │
│ │ [Ativo]          R$ 890,00│ │
│ ├───────────────────────────┤ │
│ │ …                         │ │
│ └───────────────────────────┘ │

   toque → folha sobe do rodapé
┌ ═══ ─────────────────────────┐  alça
│ Editar plano               ⓧ │
│ Tipo de serviço         [▾]  │  48px
│ Nome comercial               │
│ Slug (mono)                  │
│ Preço R$ [ 0,00 ] Ciclo [▾]  │  grade 2 col (1 col < 400px)
│ Status [Ativo|Rascunho|Arq.] │  segmented
│ Ordem de exibição            │
│ Descrição (3 linhas)         │
├──────────────────────────────┤
│ [ Salvar alterações         ]│  fixo, 50px
│ [ Cancelar                  ]│
└──────────────────────────────┘  safe-area-bottom
```

### Movimentação (cartão)

```
┌───────────────────────────────┐
│ ↙ Pix recebido     + R$ 450,00│  o quê + valor
│   PIX_IN                      │
│ Fulano da Silva  27/08 14:02  │  quem + quando
│ [Empresa ▾]        [ Revisar ]│  decisões
│ [Pendente]                    │
└───────────────────────────────┘
```

## 4. Componentes

| Componente | Arquivo | Papel |
|---|---|---|
| `AppShell` | `src/components/AppShell.tsx` | Moldura: sidebar (desktop) + `MobileNav` (celular) |
| `MobileNav` | `src/components/MobileNav.tsx` | Barra superior, barra de abas, folha "Mais" com usuário e "Sair" |
| `SideNav` | `src/components/SideNav.tsx` | Coluna do desktop (sem estado; lê `lib/navegacao.ts`) |
| `Sheet` | `src/components/ui/Sheet.tsx` | Folha (bottom sheet ≤ 820 px, janela centrada acima). Escape fecha, Tab fica preso dentro e o foco volta para quem abriu, arrastar a alça para baixo fecha (120 px ou puxão rápido), ancora na `visualViewport` para o rodapé não ficar atrás do teclado do iPhone |
| `Segmented` | `src/components/ui/Segmented.tsx` | Controle segmentado (2–3 opções): toque escolhe, setas/Home/End andam, tabindex circulante |
| `ReconciliationControl` | `src/components/ReconciliationControl.tsx` | "Revisar" abre folha com estado, vínculo e nota (era popover absoluto) |
| `NewLedgerEntryButton` | `src/components/NewLedgerEntryButton.tsx` | "Novo lançamento" em folha, campos `.field`, tipo e escopo em `Segmented` |
| `Icone` | `src/components/ui/Icones.tsx` | Oito ícones de traço (sem biblioteca) |
| `PlanEditForm` | `src/components/PlanEditForm.tsx` | Formulário do plano dentro de `Sheet`; slug automático; segmented de status; `inputMode="decimal"` no preço |
| `ServicePlansManager` | `src/components/ServicePlansManager.tsx` | Lista agrupada por tipo, linha por plano (`PlanCard`), toast; atualização otimista com o plano que a API devolveu, `router.refresh()` confirma por trás |
| `TransactionList` | `src/components/TransactionList.tsx` | Movimentações: grade-tabela no desktop, cartões no celular |
| `BalanceCard` | existente | Saldo com ocultar |
| Botões | `.primary-button` / `.secondary-button` / `.row-action` | 38 px desktop, 50 / 40 px celular, `:active` com escala 0,985 |
| Lista agrupada | `.ios-list` / `.ios-row` | Cartão de 16 px com linhas de 52–56 px e chevron |
| Campos | `.field`, `.field-select`, `.field-grid`, `.segmented`, `.input-prefix` | 44 px desktop / 48 px celular, foco com anel azul |

CSS: tudo no fim de `src/app/globals.css`, seção "Celular como app nativo".
Variáveis novas: `--radius-lg`, `--tab-bar-h`, `--topbar-h`, `--bar-bg`.

## 5. Micro-interações e estados

- **Pressionar**: botões, linhas e abas encolhem 1,5 % por 60 ms.
- **Folha**: sobe em 240 ms com curva `cubic-bezier(.2,.8,.2,1)`; fundo escurece em 160 ms; `prefers-reduced-motion` desliga as duas.
- **Salvar**: botão vira "Salvando…" e desabilita; sucesso fecha a folha e mostra toast; erro aparece dentro da folha, em vermelho, sem fechar.
- **Vazio**: tipo de serviço sem plano mostra "Nenhum plano neste tipo ainda." com "Adicionar" à mão; dashboard e clientes já tinham estados vazios e foram mantidos.
- **Carregando**: "Sincronizar agora" troca o ícone e o texto; conciliação automática idem (já existiam).
- **Barra de status** do iPhone pinta na cor do fundo (`themeColor` por tema).

## 6. Checklist de QA iOS

> **Situação (30/08/2026): pendente de QA em aparelho.** O que foi verificado
> até aqui: tipos (`tsc`), lint, build de produção e testes unitários
> (`slug`, mapa de navegação, `TransactionList`). Nenhuma tela foi vista num
> iPhone real — quem abrir primeiro é o Nicolas, com esta lista na mão.

Rodar no Safari do iPhone (375 × 812 e 430 × 932), claro e escuro, e no
modo "Adicionar à Tela de Início":

- [ ] Barra de abas não fica atrás do indicador de início (`safe-area-inset-bottom`).
- [ ] Barra superior não entra no recorte da câmera (`safe-area-inset-top`).
- [ ] Nenhum campo faz zoom ao focar (fonte ≥ 16 px).
- [ ] Todo alvo de toque ≥ 44 × 44 px (abas, chips, "Revisar", chevrons de linha).
- [ ] Com "Texto maior" em Acessibilidade (Dynamic Type), nada sobrepõe: métricas, abas, cartão de movimentação.
- [ ] Contraste ≥ 4,5:1 em texto e ≥ 3:1 em bordas/ícones nos dois temas.
- [ ] Folha de edição: rola por dentro, "Salvar" sempre visível, **teclado aberto não cobre o botão** (a folha encolhe com a `visualViewport`).
- [ ] Arrastar a alça para baixo fecha a folha; um puxão curto volta ao lugar.
- [ ] Escape / toque fora / ⓧ fecham a folha; Tab não escapa para a página atrás; ao fechar, o foco volta ao botão que abriu.
- [ ] Segmented (status, tipo, escopo): setas trocam a opção com o teclado externo / VoiceOver.
- [ ] "Revisar" e "Novo lançamento" abrem folha com campos de 48 px, não o popover antigo.
- [ ] iPhone antigo (iOS < 15.4): barras opacas e folha limitada por `vh` — sem blur, mas sem quebra.
- [ ] Filtros do financeiro rolam na horizontal sem barra visível.
- [ ] Cartão de movimentação: valor à direita, "Revisar" abre folha acima da barra de abas.
- [ ] Rotação para paisagem mantém as abas e não corta o conteúdo.
- [ ] Desktop (≥ 821 px) inalterado: coluna à esquerda, tabela de movimentações, janela centrada.

## 7. Testes automatizados

`tests/unit/slug.test.ts` (regra única de slug, usada pela tela e pela API),
`tests/unit/navegacao.test.ts` (seções sem duplicata, abas apontando para
destinos reais, no máximo quatro abas) e
`tests/unit/transaction-list.test.tsx` (uma tabela acessível, um DOM só,
sinais e classes das áreas do celular). Rodar com `npm run test:unit`.
Render de componente usa `react-dom/server` — sem jsdom, sem biblioteca extra.

## 8. O que ficou de fora (próximas telas)

Mesmo padrão, ainda não aplicado: `financeiro/contas`, `financeiro/mercadopago`,
`clientes/[id]` (dossiê com abas), `projetos`, `vagas`, `operacao/seo`,
`operacao/meta`, `implantacao`. Todas usam `AppShell`, então já ganham
navegação, safe-area, botões e cantos; falta reorganizar as grades internas.

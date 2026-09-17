---
mode: agent
description: "Auditoria e refatoração das 7 telas de canais para /hub-social com shadcn/ui, 21st.dev e Flowbite"
---

# Hub Social — tirar os canais de "Operação" e refatorar as 7 telas

Você está no repositório `app.avilaops.com` (Next 16.2 App Router, React 19.2, Tailwind v4 CSS-first, Prisma 6, vitest 3, TypeScript 5). Antes de qualquer edição, leia nesta ordem: `D:/avilaops.com/docs/CONTEXTO-NOVAS-SESSOES.md`, `D:/avilaops.com/AGENTS.md`, `docs/estudio.md`, `docs/auditoria-mobile-ios.md` e `src/lib/navegacao.ts` (o cabeçalho explica como o menu funciona).

## Objetivo

As sete telas abaixo saem do setor **Operação** e passam a ser o **Hub Social**, uma área própria com layout compartilhado e barra de abas, uma rota por canal:

| Hoje                            | Depois                            | Página (linhas) | UI real (linhas)                                                                                        |
| ------------------------------- | --------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------- |
| `/operacao/seo`                 | `/hub-social/seo`                 | 109             | `SeoAuditPanel` 205, `SearchConsolePanel` 262, `BingWebmasterPanel` 155, `IndexNowPanel` 162, `OsbDashboardClient` 328 |
| `/operacao/dominios`            | `/hub-social/dominios`            | 44              | `CloudflareDomainsPanel` 99                                                                             |
| `/operacao/google`              | `/hub-social/google`              | 51              | `operacao/google/GoogleCommandCenterClient.tsx` 470 (colocado na rota)                                  |
| `/operacao/meta` (+ `/ativos`, `/leads`, `/campanhas`) | `/hub-social/meta` (+ mesmos filhos) | 53 / 221 / 182 / 182 | `MetaBusinessPanel` 235, `MetaOperationsNav` 41, `MetaClientSelect`, `MetaCampaignSyncButton`, `MetaLeadConvertButton` |
| `/operacao/whatsapp`            | `/hub-social/whatsapp`            | 113             | nenhum componente; tudo inline na página                                                                |
| `/operacao/newsletter`          | `/hub-social/newsletter`          | 29              | `NewsletterStudio` 692 (client)                                                                         |
| `/operacao/estudio` (+ `/[id]`) | `/hub-social/estudio` (+ `/[id]`) | 24 / 20         | `EstudioLista` 109, `EstudioEditor` 267, `src/lib/estudio/*`, renderizado pelo `estudio-worker`         |

Todas as páginas são server components com o mesmo esqueleto: `getAdmin()` → `redirect("/login")` → `<AppShell section=... >`. As páginas são finas; o trabalho de UI está nos componentes da última coluna.

Não é uma tela nova por cima das antigas nem uma página única com tudo dentro: é um `src/app/hub-social/layout.tsx` que desenha o `AppShell` e a barra de abas dos 7 canais, e cada canal continua sendo sua própria rota (deep links, `searchParams` e formulários `method="get"` continuam funcionando).

## O que a auditoria imagem × código encontrou

Estado real hoje, confirmado nos prints e no código. Cada item precisa ser resolvido, não só movido:

**Transversal**

- O app quase não usa Tailwind: `src/app/globals.css` tem 7.104 linhas de classes próprias (`operations-panel`, `operations-metric`, `secondary-button`, `filter-strip`/`filter-chip`, `ios-row`, `segmented`, `seo-local-nav`, `page-header`, `eyebrow`, `field`…). Essas classes são compartilhadas com dezenas de outras telas — **não remova nada de `globals.css` sem provar com grep que ficou sem uso**.
- Tokens de design existem e são bons: variáveis em `:root` (escuro, padrão) e `:root[data-theme="light"]` — `--bg`, `--surface`, `--surface-raised`, `--line`, `--text`, `--muted`, `--accent`/`--blue`, `--green`, `--red`, `--amber`, `--radius` (12px), `--radius-sm`, `--radius-lg`, `--mono`. O tema é trocado por horário pelo script de `src/lib/tema-noturno.ts` (18h escurece, 6h clareia), com `data-theme` no `<html>`. Tudo que você criar usa esses tokens; não introduza uma segunda paleta.
- Três implementações diferentes de "abas" convivem: `Segmented` (radiogroup em `components/ui/Segmented.tsx`, usado no Newsletter), `MetaOperationsNav` (links com `filter-chip`), e `seo-local-nav` (links com `?view=`). Além disso o Google usa uma quarta fileira de pílulas com emoji. Vira uma só.
- Cards de métrica ficam órfãos: Newsletter e WhatsApp têm 4 cards numa grade que cabe 3 por linha (o 4º fica sozinho); Google tem 5 numa grade 3+2. A grade precisa ser `auto-fit`.
- Painéis "URLs oficiais" (Meta e WhatsApp) e "Conexão WhatsApp" são listas chave/valor renderizadas como texto empilhado sem hierarquia nem botão de copiar — e são exatamente os valores que a pessoa precisa copiar para o painel da Meta.
- Status em inglês vindos crus da API aparecem como badge: `active`/`pending` (Cloudflare, tela Domínios) e `RECEIVED` (WhatsApp). Todos os outros badges do app são em português.
- Cinco classes diferentes de estado vazio (`operations-empty`, `compact-empty`, `clients-empty`, `empty-index`, `estudio-vazio`).
- Só o SEO tem "eyebrow" (`CRESCIMENTO ORGÂNICO`); os outros cabeçalhos não. Padronize o cabeçalho de página.

**Por tela**

- **Estúdio**: no print, título e metadados aparecem colados — `Cartão de chamadaCartão de chamada · 4:5 · pronto 04/09`. É o `ios-row`/`ios-row-label` de `EstudioLista.tsx` colapsando no desktop. O botão "Nova peça" fica solto à direita. O `estudio-worker/package.json` descreve a tela como `app.avilaops.com/operacao/estudio`; faça `grep -rn "operacao/estudio" ../estudio-worker` e atualize só strings/documentação — o worker não muda de comportamento.
- **Meta**: o botão "Carregar cliente" é desenhado por cima da borda direita do input de cliente (`meta-client-picker` em `MetaBusinessPanel.tsx`). A lista de status ("Usuário conectado / Não conectado / Última sincronização / -") é texto solto. Os 6 contadores "Objetos da Meta no Postgres" são cards dentro de card. As sub-rotas (`/ativos`, `/leads`, `/campanhas`) têm `<form method="get" action="/operacao/meta/...">` para o filtro `organizationId` — preserve o contrato de query string.
- **Google**: cabeçalho tem "Voltar à Operação", que deixa de existir. "SEO & Cloudflare" vira link para `/hub-social/seo`. `GoogleCommandCenterClient.tsx` (470 linhas) mistura dados de Google Meu Negócio e GA4 num só componente; separe em pelo menos `PerfisNegocio` e `Ga4Resumo`. Os dados vêm de `listBusinessLocations` e `getGa4OverviewMetrics` — nada fixo no JSX.
- **Domínios**: o painel ocupa só metade da largura da página. 22 zonas sem busca nem filtro por status. Badge em inglês.
- **WhatsApp**: 113 linhas de JSX inline; extraia para `src/components/whatsapp/`. Os quatro valores de "URLs oficiais" (`/api/webhooks/whatsapp`, `/api/webhooks/whatsapp/flow`, `/webhook`, `/flow-endpoint`) são contratuais com a Meta: mostre, permita copiar, **não altere**.
- **Newsletter**: `NewsletterStudio.tsx` com 692 linhas num único client component (contatos, composição, prévia, histórico). Quebre por aba em `src/components/newsletter/`. O formulário de importação (rádio "Colar lista / Puxar dos clientes do painel", textarea, etiquetas, checkbox de caixas automáticas) fica; só troca de primitivos.
- **SEO**: o estado inteiro vive na URL — `view`, `domain`, `tab`, `integration`, `q`, `status`, `page` (veja `page.tsx` linhas 73–103). Mantenha cada um; as abas viram `Tabs` controladas por `searchParams`, não por estado local.

## Stack de UI a adotar

**shadcn/ui é a base.** Instale com `npx shadcn@latest init` (Next 16 + React 19 + Tailwind v4 são suportados). Atenção a dois pontos antes de rodar:

1. Já existe `src/components/ui/` com `Icones.tsx`, `Segmented.tsx` e `Sheet.tsx` (PascalCase), importados por 28 pontos do app — financeiro, clientes, saúde, n8n, `MobileNav`. O shadcn gera `sheet.tsx`, `tabs.tsx` etc. em minúsculas, e em Windows `Sheet.tsx` e `sheet.tsx` colidem. **Não mova nem renomeie os legados** (isso tocaria telas fora do escopo). Em vez disso, no `components.json` aponte o alias de UI para outra pasta: `"aliases": { "ui": "@/components/shadcn", "components": "@/components", "utils": "@/lib/utils" }`. As telas do Hub Social importam de `@/components/shadcn/*`; os 28 pontos legados continuam intactos. Dentro do escopo, só `EstudioLista.tsx` e `EstudioEditor.tsx` usam `Segmented`/`Sheet` — migre esses dois para `Tabs`/`Sheet` do shadcn na fase do Estúdio.
2. Tailwind v4 não tem `tailwind.config`. Os tokens do shadcn (`--background`, `--foreground`, `--card`, `--primary`, `--muted`, `--border`, `--destructive`, `--radius`…) entram em `globals.css` via `@theme inline` **apontando para as variáveis que já existem** (`--background: var(--bg)`, `--card: var(--surface)`, `--primary: var(--accent)`, `--border: var(--line)`, `--radius: 12px`…). Leia `src/lib/tema-noturno.ts` para saber o valor exato de `data-theme` e defina a variante `dark` do Tailwind a partir dele (`@custom-variant dark (...)`), nunca de `prefers-color-scheme` — o tema da casa é por horário.

Componentes shadcn a adicionar: `button`, `card`, `tabs`, `badge`, `input`, `textarea`, `label`, `select`, `checkbox`, `radio-group`, `table`, `sheet`, `dialog`, `dropdown-menu`, `tooltip`, `skeleton`, `separator`. Antes de adicionar `sonner`, veja como o app dá feedback hoje (`feedback-error`, `estudio-erro`) e só adicione se substituir esses padrões de vez.

**21st.dev** é um registro compatível com o CLI do shadcn: `npx shadcn@latest add "https://21st.dev/r/<autor>/<componente>"`. Use para blocos prontos de **stat/metric card**, **description list (chave/valor com copiar)**, **empty state** e **page header**. O componente entra no repositório como código nosso: revise, tire dados de demonstração, adapte aos tokens. Nenhuma dependência de runtime com 21st.

**Flowbite** entra só como referência de marcação Tailwind (badge, tabela, description list, alert). **Não instale** o pacote `flowbite` nem o plugin: ele traz JS próprio que duplica o Radix e o plugin é pensado para o config do Tailwind v3. Copie o padrão visual como JSX + utilitários, adaptado aos tokens.

Primitivos compartilhados a criar em `src/components/hub-social/` (todos em português, como o resto do código):

- `CabecalhoPagina` — eyebrow opcional, título, subtítulo, ações à direita; substitui `page-header`/`operations-header`.
- `GradeMetricas` + `Metrica` — grade `auto-fit` (`minmax(180px, 1fr)`), valor em `--mono` como hoje, detalhe em `--muted`.
- `ListaChaveValor` — rótulo/valor alinhados, valor monoespaçado quando for URL ou ID, botão copiar; substitui os painéis "URLs oficiais" e "Conexão WhatsApp".
- `EstadoVazio` — título, descrição, ação opcional; substitui as cinco classes de vazio.
- `BadgeStatus` — mapa `{ active: "Ativo", pending: "Pendente", RECEIVED: "Recebido", ... }` → variantes verde/âmbar/vermelho/cinza. Um só mapa, exportado de `src/lib/status-rotulos.ts`, com teste unitário.
- `AbasHubSocial` — a barra de 7 abas do layout, ativa por `usePathname()`.

## Navegabilidade, auditabilidade e padrão Apple — web e celular

Três exigências de Nicolas que valem para as sete telas, todas com padrão já definido na casa. Não invente outro: siga estes documentos e componentes.

**1. Padrão Apple (Human Interface Guidelines), no desktop e no iPhone.** A referência é `docs/auditoria-mobile-ios.md` — auditoria, decisões, wireframes e checklist de QA de 29/08/2026. A seção 8 dele lista `operacao/seo` e `operacao/meta` como telas "ainda não aplicadas"; esta refatoração fecha essa pendência para as sete. O que isso significa na prática:

- Celular não é desktop espremido: abaixo de 560 px, grades de métricas viram **lista agrupada** (rótulo à esquerda, número à direita, padrão *inset grouped*); tabelas viram **cartão de andares** com DOM único (veja `TransactionList` e `LedgerList`); filtros viram **chips roláveis** na horizontal.
- Medidas fixas da casa: linha 52–60 px, botão primário 50 px, campo 48 px, chip 36 px, alvo de toque ≥ 44 × 44 px, `font-size ≥ 16px` em campos abaixo de 820 px (senão o Safari dá zoom), raio 16 px em painéis e 12 px em botões, tudo em `rem`.
- **Large Title** (28 px) + subtítulo no celular; barra de abas do `MobileNav` com `safe-area`; formulários e detalhes abrem em **folha** que sobe do rodapé (`Sheet` — no desktop vira janela centrada), com "Salvar" fixo e visível com o teclado aberto.
- Micro-interações: pressionar encolhe 1,5 % por 60 ms; folha sobe em 240 ms com `cubic-bezier(.2,.8,.2,1)`; `prefers-reduced-motion` desliga; toast de 2,8 s acima da barra de abas depois de salvar.
- Mapeamento para o shadcn: `Sheet` da casa e `Sheet` do shadcn precisam do mesmo comportamento de bottom sheet no celular (arrastar a alça fecha, ancora na `visualViewport`) — se o do shadcn não entregar isso, use o da casa para folhas e o do shadcn só para o resto. `Tabs` do shadcn no lugar dos três padrões de aba; abaixo de 560 px, abas com mais de 3 itens rolam na horizontal.
- As `AbasHubSocial` (7 itens) no celular são chips roláveis logo abaixo do Large Title, não uma segunda barra fixa — a barra de abas do rodapé continua sendo a do `MobileNav`.

**2. Tudo clicável.** Nenhum dado é só texto:

- Toda linha de lista é link ou abre folha, com chevron à direita e área de toque cobrindo a linha inteira (padrão `::after` da lista de clientes).
- Toda métrica leva para a lista filtrada que a produziu (ex.: "Avaliações pendentes 10" → lista das 10; "Domínios ativos 22" → Domínios com filtro ativo; "Eventos 2" no WhatsApp → os 2 eventos).
- Todo nome de cliente/organização leva à ficha em `/clientes/...`; todo domínio leva ao SEO daquele domínio (`/hub-social/seo?domain=`); toda campanha, lead, local do Google e peça do Estúdio abre o próprio detalhe.
- Toda URL ou ID mostrado (webhooks, Phone Number ID, Catalog ID, zona do Cloudflare) tem botão de copiar.
- Estado vazio sempre traz a ação que resolve ("Conectar Meta", "Importar contatos", "Sincronizar agora"), nunca só a frase.

**3. Tudo auditável.** A regra vem de `docs/SAUDE-TEMPO-REAL-AUDITORIA.md` (tela `/operacao/saude`, 16/09/2026): *nenhum número aparece sem que se possa responder "qual evidência produziu este valor?"*. Aplique o mesmo mecanismo:

- Crie `FolhaEvidencia` em `src/components/hub-social/` nos moldes de `HealthEvidenceSheet.tsx`: origem (API/tabela), função que calculou, horário da leitura e da gravação, frescor, dados brutos. Cada `Metrica` e cada badge de status abre essa folha.
- Onde já existe rastro no Prisma, use-o: `integrationWebhookEvent` (Meta/WhatsApp: `idempotencyKey`, `eventType`, `payload`, horários), `verified_at`/última sincronização da Meta, `lastSync` do Cloudflare, `Search Console conectado` do SEO, `pronto 04/09` das peças do Estúdio. Onde não existe, a folha diz "sem evidência registrada" e o relatório final lista o campo que falta — **não invente campo nem valor**.
- Modo **Inspecionar dados** só para o dono (`?debug=hub-social`, como o `?debug=health` da Saúde): mostra o JSON da resposta que alimentou a tela.
- Ações que mudam estado (sincronizar, conectar, importar, converter lead) mostram quem fez e quando, no mesmo padrão de `actorId` já usado em `api/webhooks/n8n/google` e no histórico de leads.

## Roteamento, navegação e redirecionamentos

1. Crie `src/app/hub-social/layout.tsx` com `getAdmin()` → `redirect("/login")`, o `AppShell` e as `AbasHubSocial`. **Mantenha o `getAdmin()` também em cada `page.tsx`**: é regra da casa ("cada página e cada rota confere o papel por conta própria", `navegacao.ts`), e layout não roda de novo na navegação entre irmãos.
2. Mova as 11 `page.tsx` para `src/app/hub-social/...`. Mantenha `export const dynamic = "force-dynamic"` onde existe (newsletter, estudio, estudio/[id]). Mantenha `GoogleCommandCenterClient.tsx` colocado na rota ou mova para `src/components/google/` — os dois são aceitáveis, escolha um e siga.
3. `src/lib/navegacao.ts`: os grupos **"Canais"** (6 itens) e **"Conteúdo"** (Estúdio) fundem-se num grupo **"Hub Social"** com 7 itens — exatamente o teto que `tests/unit/navegacao.test.ts` impõe ("nenhum grupo passa de sete itens"). As `section`s (`seo`, `domains`, `google-suite`, `meta`, `whatsapp`, `newsletter`, `estudio`) não mudam: `SideNav` e `MobileNav` acendem por elas. Reescreva os comentários dos grupos (eles documentam por que a separação foi feita em 10/09/2026; documente a fusão de 16/09/2026 e o motivo: o Hub Social é uma área própria, não um subsetor de Operação).
4. Redirecionamentos permanentes em `next.config.ts` (`redirects()`), porque o link da plataforma é enviado a clientes por WhatsApp e há favoritos: `/operacao/:canal(seo|dominios|google|meta|whatsapp|newsletter|estudio)/:path*` → `/hub-social/:canal/:path*`, preservando query string.
5. Troque todas as referências fixas. Lista completa hoje (confira com `grep -rn "operacao/\(seo\|dominios\|google\|meta\|whatsapp\|newsletter\|estudio\)" src ../estudio-worker`):
   - `src/lib/navegacao.ts` (7 hrefs)
   - `src/components/MetaOperationsNav.tsx` (4 hrefs + a comparação de ativo em `item.href === "/operacao/meta"`)
   - `src/components/MetaBusinessPanel.tsx:117` (`action="/operacao/meta"`)
   - `src/app/operacao/meta/ativos/page.tsx:62`, `campanhas/page.tsx:68`, `leads/page.tsx:64` (`action=`)
   - `src/app/operacao/seo/page.tsx` linhas 73, 82, 89–91, 102–103 (links internos com `view`, `domain`, `tab`, `page`)
   - `src/app/operacao/google/page.tsx:30` (link para SEO)
   - `src/app/operacao/page.tsx:87` (card "Domínios em 60 dias" da Visão central)
   - `src/components/EstudioLista.tsx:37,59` e `src/components/EstudioEditor.tsx:136`
   - `src/components/OsbDashboardClient.tsx:313`
   - `src/app/api/integrations/meta/oauth/start/route.ts:22,41` e `.../oauth/callback/route.ts:29` — **só o destino do redirect pós-OAuth** muda para `/hub-social/meta`. A `redirect_uri` registrada na Meta (`/api/integrations/meta/oauth/callback`) e as URLs de webhook (`/api/webhooks/meta`, `/api/webhooks/whatsapp`, `/api/webhooks/whatsapp/flow`) **não mudam**.
   - comentário em `src/app/globals.css:6570`
   - `../estudio-worker/package.json` (descrição)

## Decisão: sem n8n — o app é o único dono das integrações

Em 16/09/2026 Nicolas decidiu **deixar de usar o n8n**; tudo de canais passa a viver no `app.avilaops.com`. Havia um workflow da Meta sendo desenhado no n8n (relatório de desempenho, captura de leads, notificações WhatsApp, sincronização de catálogo). Ele não será concluído lá. Para as sete telas isso significa um dono só e nenhuma ambiguidade:

- **Webhooks**: `/api/webhooks/meta` (grava em `integrationWebhookEvent` com chave de idempotência), `/api/webhooks/whatsapp` e `/api/webhooks/whatsapp/flow` são **as** URLs oficiais. A `ListaChaveValor` de "URLs oficiais" mostra e copia; não precisa de campo de origem.
- **Token**: só existe o OAuth por cliente do app (`src/lib/meta.ts`, `metaOAuthScopes()`). O card "Conexão" mostra usuário conectado, última sincronização, status e expiração — nada de "gerido no n8n".
- **Dados de campanhas e leads**: um caminho só, o que já existe — `api/integrations/meta/sync`, `meta/campaigns/sync`, `meta/leads/[id]/convert`. Não crie outro.
- **Google**: Meu Negócio e GA4 já são lidos direto pela `googleapis` (`src/lib/google-mybusiness.ts`, `google-analytics.ts`). **Newsletter**: já roda no driver Resend (`newsletter-mailer.ts`). Nenhuma das duas depende do n8n para a tela.

As quatro automações que iam para o n8n viram **backlog do app, fora deste prompt** — não as implemente aqui, mas deixe as telas prontas para recebê-las com estado vazio honesto ("ainda não automatizado"), nunca dado simulado:

| Automação                  | Situação no app hoje                                                                 | Onde aparece                      |
| -------------------------- | ------------------------------------------------------------------------------------ | --------------------------------- |
| Captura de Leads           | **existe**: webhook Meta → `integrationWebhookEvent` → conversão em Lead Ads         | Meta › Lead Ads                   |
| Relatório de Desempenho    | sync manual por botão (`MetaCampaignSyncButton`); não há agendador no app            | Meta › Campanhas                  |
| Notificações WhatsApp      | `src/lib/whatsapp.ts` expõe status; confira se há envio antes de prometer na tela    | WhatsApp                          |
| Sincronização de Catálogo  | não existe; a tela só mostra "Catalog ID configurado"                                | Meta › Ativos, WhatsApp           |

O que o app ainda delega ao n8n **não é do Hub Social e não deve ser tocado nesta refatoração** — a saída do n8n no resto do app é um projeto à parte: e-mail transacional (`src/lib/email.ts`), criação de caixas (`src/lib/mail.ts`), aviso de pagamento (`src/lib/deliverables.ts`), onboarding da Google tag (`api/webhooks/n8n/google`), outras contas do Mercado Pago (`sync-mercadopago.ts`), cofre em `/operacao/automacoes` (`n8n-credenciais.ts`) e a sonda em `health/config.ts`. Deixe o item "Automações" no menu como está; não remova `src/lib/n8n*`.

Sobre as telas de permissões do Meta App que Nicolas capturou: são escopos de API, não ações. Se alguma automação futura exigir escopo que `metaOAuthScopes()` não pede, é mudança em `src/lib` — fora deste escopo; aponte no relatório.

## Fora do escopo — não toque

- Lógica de `src/app/api/**` além das três strings de redirect acima.
- `src/lib/**` (dados, integrações, Prisma), `prisma/schema.prisma`, migrações.
- Comportamento do `estudio-worker`.
- Qualquer outra tela do app. Se um primitivo novo (ex.: `BadgeStatus`) for útil em outra tela, anote no relatório; não migre.
- Dados de clientes: nada de nomes, domínios ou números reais em fixtures, testes, capturas ou commits (regra do `AGENTS.md`).

## Ordem de execução — um commit por fase, cada fase deixa o app funcionando

Branch: `feat/hub-social`. Commits no padrão do repositório (`feat(hub-social): ...`, `refactor(hub-social): ...`, em português).

0. **Base**: mover `components/ui` legado, `shadcn init`, `@theme inline` com os tokens, variante `dark` correta, componentes shadcn listados. Verificação: `npx tsc --noEmit` limpo e uma página qualquer do app idêntica ao que era (nenhum estilo global vazou).
1. **Rotas**: layout, abas, mover as 11 páginas, `navegacao.ts`, redirects, todas as referências fixas. **Sem mudança visual nas telas ainda.** Verificação: `npm test` (o `navegacao.test.ts` precisa passar sem alterar as regras dele), os 7 URLs novos abrem, os 7 antigos redirecionam com query string, fluxo OAuth da Meta termina em `/hub-social/meta`, o item certo acende no `SideNav` e na folha "Mais" do celular (375px).
2. **Primitivos**: os componentes de `src/components/hub-social/` + `status-rotulos.ts` com teste.
3. **Telas**, da menor à maior, um commit cada: Domínios → WhatsApp → Estúdio → Newsletter → Meta (as 4 rotas juntas) → Google → SEO. Em cada uma: resolver os achados listados acima, trocar os padrões de aba/cabeçalho/métrica/vazio/badge pelos primitivos, conferir claro e escuro, desktop e 375px.
4. **Limpeza**: `grep` classe a classe do que saiu de uso nas 7 telas; remova de `globals.css` só o que zerou no repositório inteiro. Registre em `docs/hub-social.md` (curto, no padrão dos outros arquivos de `docs/`): decisão, mapa de rotas, redirects, primitivos criados, o que ficou pendente.

## Pronto quando

- [ ] `npx tsc --noEmit`, `npm run lint`, `npm test` limpos; `npm run build` passa (precisa de `DATABASE_URL` para o `prisma generate`).
- [ ] Os 7 URLs `/hub-social/*` abrem para OWNER e ADMIN; sem sessão, redirecionam para `/login`.
- [ ] Os URLs `/operacao/*` antigos redirecionam (301) mantendo query string; `/operacao` (Visão central) continua existindo e seu card de Domínios aponta para o novo lugar.
- [ ] `navegacao.test.ts` passa sem alteração nas regras; menu desktop e barra do celular acendem o item certo em cada canal.
- [ ] Nenhuma URL de webhook ou `redirect_uri` mudou; OAuth da Meta termina em `/hub-social/meta`.
- [ ] Tema claro e escuro corretos nas 7 telas, incluindo a troca automática por horário.
- [ ] Nenhum dos bugs da seção "Por tela" persiste; um único padrão de abas, cabeçalho, métrica, vazio e badge nas 7 telas; nenhum status em inglês.
- [ ] Checklist de QA iOS de `docs/auditoria-mobile-ios.md` (seção 6) passa nas 7 telas a 375 × 812 e 430 × 932, claro e escuro, incluindo "Adicionar à Tela de Início"; a seção 8 daquele documento é atualizada tirando `seo` e `meta` da lista de pendentes.
- [ ] Nenhum texto morto: toda linha, métrica, nome, domínio, URL e ID é link, folha ou botão de copiar; todo estado vazio tem a ação que resolve.
- [ ] Toda métrica e todo badge abrem a `FolhaEvidencia`; `?debug=hub-social` funciona para o dono e é ignorado para a equipe; campos de evidência que faltam estão listados no relatório, não inventados.
- [ ] Nada em `src/lib/**`, `src/app/api/**` (fora as 3 strings) ou `prisma/` foi alterado — `git diff --stat` comprova.
- [ ] Relatório final no PR: o que mudou por fase, o que ficou pendente, e os primitivos que valem reaproveitar em outras telas.

# Auditoria do frontend — app.avilaops.com

Data: 16/09/2026. Base: commit `7266d80` mais as alterações locais ainda não commitadas (listadas em §0).
Método: leitura do código, contagens com `grep` e navegação real com Playwright contra uma cópia local do app (banco descartável, papel OWNER), em 1440×900 e iPhone 13 (390×844), nos temas claro e escuro. Também foram usados os prints enviados pelo Nicolas em 16/09. Nenhum arquivo do app foi alterado nesta etapa.

---

## 0. Estado do repositório no momento da auditoria

Há uma refatoração do Hub Social **em andamento, fora deste trabalho**, guiada por `.github/prompts/hub-social-refatoracao.prompt.md` (commits `89297ea` e `7266d80`, mais alterações locais sem commit):

| Arquivo sem commit | Mudança |
|---|---|
| `src/app/hub-social/whatsapp/page.tsx` | +251/−? linhas, reescrita |
| `src/components/EstudioLista.tsx` | +254 linhas, reescrita |
| `src/app/hub-social/estudio/page.tsx`, `dominios/page.tsx` | ajustes |
| `src/components/hub-social/BadgeStatus.tsx`, `BotaoCopiar.tsx` | novos |
| `src/app/globals.css` | +120 (estilos `.domain-*` e `.chip-*`) |
| `src/components/PlanEditForm.tsx`, `ServicePlansManager.tsx` | vários ciclos por plano (sessão anterior) |

**Risco principal:** esse trabalho adota **shadcn/ui** como base visual das 7 telas do Hub Social. O pedido desta auditoria é um design system **próprio**, que "não seja clone de shadcn". Sem alinhar os dois antes, haverá duas linguagens visuais e conflito de edição nos mesmos arquivos.

---

## 1. Arquitetura atual

| Item | Encontrado |
|---|---|
| Framework | Next 16.2 App Router, React 19.2, TypeScript, Prisma 6 |
| Rotas com página | 43 `page.tsx` |
| Layouts | 2: `src/app/layout.tsx` (raiz) e `src/app/hub-social/layout.tsx` |
| `loading.tsx` / `error.tsx` / `not-found.tsx` | **0 / 0 / 0**: nenhuma rota tem estado de carregamento ou de erro no nível do App Router |
| App shell | `AppShell.tsx` (56 linhas): sidebar + `main-canvas`. Cada página instancia o `AppShell` por conta própria (`section="..."`), exceto o Hub Social, que usa o layout |
| Navegação | `src/lib/navegacao.ts`: uma fonte única para a sidebar do desktop e as abas do celular. 6 grupos no desktop; 4 abas no celular (Início, Clientes, Entregas, Financeiro) + "Mais" |
| Componentes | 74 em `src/components` + `ui/` (Icones, Segmented, Sheet) + `shadcn/` (17 primitivos) + `hub-social/` (9) + `health/` (2) |
| Client components | 80 de 148 `.tsx`; 54 deles chamam `fetch(` direto |
| Estilo | `globals.css` com **7.105 linhas** de classes próprias, mais `hub-social.css` (Tailwind v4 + tokens shadcn apontando para as variáveis da casa) e `health-audit.css` |
| Tema | `:root` escuro por padrão e `:root[data-theme="light"]`, trocado por horário |
| Ícones | **duas bibliotecas**: `lucide-react` (8 arquivos) e `ui/Icones.tsx` próprio (12 arquivos) |
| UI libs | `radix-ui`, `class-variance-authority`, `tailwind-merge`, `clsx`, `tw-animate-css` (entraram com o shadcn; só 2 arquivos fora de `components/shadcn` os usam) |

---

## 2. Tokens e fundação visual

| Medida | Valor | Evidência |
|---|---|---|
| Tokens em `:root` | 37 variáveis, com nomes misturados entre função e cor (`--blue`, `--green-line`, `--link-soft`, `--table-text`, `--editor-bg`) | `globals.css:1-45` |
| Cores literais em `globals.css` | **68 hex distintos + 40 `rgba()` distintos** fora dos tokens | `grep -oE "#[0-9a-f]{3,8}"` |
| Cores literais em TSX | `GoogleCommandCenterClient.tsx` 44, `OsbDashboardClient.tsx` 34, `DigitalAdvisorWidget.tsx` 7, `SeoAuditPanel.tsx` 6 | `grep -c "#xxxxxx"` |
| `style={{…}}` inline | Google 90, OsbDashboard 57, SeoAuditPanel 17, DigitalAdvisorWidget 16, implantacao 8 | `grep -c "style={{"` |
| `border-radius` | **20 valores diferentes**, incluindo 8, 9, 10, 11, 12, 14, 16, 20px, 999px, 50% e 3 tokens | `globals.css` |
| `font-size` | **60 valores diferentes**, misturando rem e px (0.8125rem ×96, 0.75rem ×65, 12px ×13, 13px ×10, 14px ×10, 15px ×8…) | `globals.css` |
| `box-shadow` | 16 valores diferentes | `globals.css` |
| Breakpoints | **15 larguras diferentes**: 400, 560, 640, 680, 720, 760, 820, 821, 940, 1100, 1120, 1180px, algumas escritas sem espaço (`@media(max-width:760px)`) | `globals.css` |
| Mono | `var(--mono)` em 40 regras, usado como enfeite em números de métrica (`operations-metric strong`, cards do Newsletter e WhatsApp com "Ativa" em mono) | prints WhatsApp e Newsletter |

**Recomendação:** consolidar em tokens semânticos (§7 da proposta), escala de tipo com 9 degraus, espaçamento em múltiplos de 4, 3 raios, 2 sombras e 3 breakpoints (≤640, ≤1024, ≥1280).

---

## 3. Componentes duplicados

| Padrão | Implementações encontradas | Evidência |
|---|---|---|
| Estado vazio | **15 classes**: `operations-empty` (30 usos), `compact-empty` (15), `empty-index` (13), `prov-empty` (11), `clients-empty` (11), `table-empty` (7), `vazio` (7), `cred-vazio`, `seo-empty`, `score-empty`, `score-card-empty`, `plan-row-empty`, `job-blocks-empty`, `health-empty`, `estudio-vazio`, mais `hub-social/EstadoVazio.tsx` | `grep -o "*empty*"` |
| Status / badge | `status-pill` (6), `status-chip` (4), `environment-tag` (4), `portal-tag`, `newsletter-contact-tag`, `domain-dot`, `health-orb`, `health-state`, `hub-social/BadgeStatus.tsx`, `shadcn/badge.tsx`, e badges com emoji e cor inline no Google | idem |
| Métrica / KPI | `operations-metric` (28), `metric-grid`, `metric-cards`, `metric-row`, `metric-box`, `portal-metric`, `client-summary-number`, `health-summary`, `hub-social/Metricas.tsx` | idem |
| Cabeçalho de página | `page-header` (30), `seo-page-header`, `portal-header`, `client-workspace-header`, `health-page-header`, `hub-social/CabecalhoPagina.tsx` (3 usos) | idem |
| Abas | `Segmented` (radiogroup), `MetaOperationsNav` (links `filter-chip`), `seo-local-nav` (`?view=`), pílulas com emoji no Google, `shadcn/tabs`, `AbasHubSocial` | prompt do Hub Social + código |
| Folha / modal | `ui/Sheet.tsx` (próprio, 28 importações) e `shadcn/sheet.tsx` + `shadcn/dialog.tsx` | `ls components` |
| Feedback | `inline-feedback` (36), `feedback-error` (27), `form-error` (18), `feedback-success` (9), `toast` (9), `estudio-erro` (2); 7 `window.confirm()` para ações destrutivas | `grep` |
| Carregamento | 14 arquivos com "Carregando…" em texto ou skeleton próprio; nenhum `loading.tsx` | `grep` |
| Ícones | `lucide-react` e `Icones.tsx` | §1 |

---

## 4. Problemas por tela (com evidência)

### 4.1 Google — dados inventados apresentados como reais (crítico)

| Arquivo | Problema | Impacto | Recomendação |
|---|---|---|---|
| `src/lib/google-mybusiness.ts:41-168` | `MAPPED_BUSINESSES` é uma lista **fixa** com endereços, notas e avaliações fictícios ("Av. Principal, 1000 - São Paulo", "Rua das Flores, 88", Brasa Mineira com 342 avaliações, Brilhax com 120) | A tela mostra "10 empresas · 4.82 · 1.366 avaliações · 10 pendentes" como se fossem números reais | Remover a lista fixa da tela. Sem API conectada, mostrar o estado "Não conectado", não números |
| `google-mybusiness.ts:184-194` | `listBusinessLocations()` devolve `MAPPED_BUSINESSES` **em todos os caminhos**, com cliente autenticado ou não | Mesmo com credencial válida, nunca lê a API | Implementar a leitura real ou exibir estado vazio |
| `src/lib/google-analytics.ts:58` | `realtimeActiveUsers: Math.floor(Math.random() * 15) + 8` | "14 online" é **número aleatório** | Usar o relatório realtime do GA4 ou não exibir |
| `google-analytics.ts:65-69, 78-92` | canais de tráfego fixos (4850 usuários orgânicos etc.) e fallback "demonstrativo" com 15.420 sessões | Métricas falsas | Mesma recomendação |
| `GoogleCommandCenterClient.tsx` | 90 `style={{}}`, 44 cores hex, emoji como ícone ("🍲 Acolhedor", "📍") e texto "Sincronizado via Google Business Profile API" | Visual fora do sistema e **afirmação falsa** de sincronização | Reescrever com os componentes base |

### 4.2 Catálogo de serviços

| Arquivo | Problema | Recomendação |
|---|---|---|
| `ServicePlansManager.tsx:100` | `<small>{tipo}</small>` mostra `DOMAIN`, `PDF_CATALOG`, `SOCIAL_MEDIA` como parte principal do título | Tirar do título; levar para "Detalhes técnicos" |
| `ServicePlansManager.tsx` | Tipo sem plano ocupa um bloco inteiro ("Nenhum plano neste tipo ainda") | Linha compacta dentro do grupo |
| `ServicePlansManager.tsx:140` | Preço sem moeda (corrigido localmente, ainda não publicado) | Publicar |
| Tela | Sem busca, sem filtro por tipo ou status, sem resumo (ativos, sem preço); descrição truncada em 1 linha no desktop | Toolbar + resumo |

### 4.3 Estúdio

| Arquivo | Problema | Recomendação |
|---|---|---|
| `EstudioLista.tsx` (versão commitada) | Título e metadados colados: "Cartão de chamadaCartão de chamada · 4:5 · pronto 04/09" (print) | Linha com hierarquia: nome / modelo · formato / status / data |
| Idem | Sem thumbnail, filtro, cliente ou status visual; "Nova peça" solto à direita | Biblioteca com filtros |
| — | **Arquivo sendo reescrito agora** pela refatoração do Hub Social (+254 linhas locais) | Alinhar antes de mexer |

### 4.4 Meta Business (`MetaBusinessPanel.tsx`)

| Linha | Problema | Recomendação |
|---|---|---|
| picker de cliente | Botão "Carregar cliente" sobreposto à borda do select (print desktop); no celular, ao lado, com 50% da largura | Select com ação clara ou troca automática |
| status | "Usuário conectado / Não conectado / Última sincronização / Nunca sincronizado / Status técnico / -" em texto empilhado, sem rótulo e valor separados | `DetailRow` |
| :194 | `META_WEBHOOK_VERIFY_TOKEN` mostrado como valor | Área "Detalhes técnicos" |
| :202-204 | "Objetos da Meta no Postgres" e "Contadores reais das tabelas `operations`" (jargão); 6 cards dentro de um card | Lista de objetos sem aninhar cards |
| celular | Aviso "Variáveis de ambiente pendentes… `META_APP_ID`" como mensagem principal | Texto humano + detalhe técnico recolhível |

### 4.5 WhatsApp (`hub-social/whatsapp/page.tsx`)

| Problema | Recomendação |
|---|---|
| "URLs oficiais" e "Conexão WhatsApp" como texto empilhado sem hierarquia (print) | `DetailRow` + botão copiar (em andamento na refatoração do Hub Social) |
| `WHATSAPP_VERIFY_TOKEN` e explicação com nomes de variáveis de ambiente (:60, :130) | Detalhes técnicos |
| Último evento cru: `whatsapp_business_account · RECEIVED` | Rótulo em português + tipo técnico recolhido |
| Métricas "Ativa"/"Ativo" em fonte mono de 32px como se fossem números | `StatusBadge`, não `MetricCard` |
| 4 métricas em grade de 3 colunas (a quarta fica sozinha) | Grade auto-fit |

### 4.6 Newsletter (`NewsletterStudio.tsx`, 692 linhas)

| Problema | Recomendação |
|---|---|
| Um único client component com contatos, composição, prévia e histórico | Dividir por aba |
| 4 métricas em grade de 3 (a quarta sozinha); "motor: resend" como legenda (:312) | Grade auto-fit; motor vai para detalhes técnicos |
| Abas com aparência de botão de formulário (print) | Componente `Tabs` único |
| Checkbox de "Manter caixas automáticas" solto sobre o campo de etiquetas | Grupo "Opções" |
| Sem feedback estruturado pós-importação | Resumo: importados, duplicados, ignorados |

### 4.7 Domínios (`CloudflareDomainsPanel`)

| Problema | Recomendação |
|---|---|
| Painel ocupa ~50% da largura no desktop (print) | Largura total |
| Status cru da Cloudflare: `active`, `pending` | `StatusBadge` "Ativo" / "Pendente" |
| "Brasa Mineira · - · 6 registros DNS" (plano vazio vira "-") | Esconder campo vazio |
| 22 zonas sem busca, filtro ou última sincronização | Toolbar + coluna de atualização |

### 4.8 SEO

Melhor tela do conjunto: tem resumo, lista de prioridades e ação. Problemas: o eyebrow "CRESCIMENTO ORGÂNICO" só existe aqui; o marcador de gravidade é uma bolinha de 6px sem texto; faltam gravidade escrita e CTA explícito; `OsbDashboardClient.tsx` tem 57 estilos inline e 34 cores hex.

### 4.9 Implantação OpenAI (`src/app/implantacao/page.tsx`)

- 20 botões "✓" de **18×18 px sem nome acessível** (Playwright: `semNome=20`, `pequenos=24`). Leitor de tela anuncia só "botão".
- No celular, a página tem 5.949px de altura (a mais longa do app).

### 4.10 Saúde em tempo real

56 elementos de texto abaixo de 12px no celular (os rótulos de containers adicionados hoje, `health-containers` 0.7rem) e `article role="button"` clicável (`RealtimeHealthDashboard.tsx:268`). Funciona pelo teclado, mas é o único `div`/`article` clicável do app.

### 4.11 Navegação

| Item | Problema | Recomendação |
|---|---|---|
| Sidebar desktop | 6 grupos, ~27 itens, com rolagem na sidebar a 900px de altura (print: "Estúdio" cortado no fim); sem recolher, sem ícones, sem badges | Grupos recolhíveis, modo compacto com ícones |
| Grupo "Casa" | Nome ambíguo (Vagas, Implantação OpenAI, Automações) | Renomear conforme a função |
| Abas do Hub Social no celular | 7 abas quebram em **2 linhas** (print Playwright), com botões de 34px de altura, antes do título da página | Rolagem horizontal única ou seletor |
| Hub Social + abas internas da Meta | Dois níveis de abas empilhados antes do conteúdo | Um nível de abas; o segundo vira segmentado dentro da página |
| Abas do celular | Início, Clientes, Entregas, Financeiro (só dono) + Mais | Coerente com o uso. Para o sócio, sobram 3 abas + Mais |
| Marca | Link "Ávila Ops" com 28px de altura no topo (abaixo de 44px) | Alvo maior |

### 4.12 Estados e feedback (transversal)

- Nenhum `loading.tsx` nem `error.tsx`: um erro de servidor numa página cai na tela genérica do Next.
- 54 client components fazem `fetch` direto, cada um com seu jeito de mostrar carregando e erro.
- 7 `window.confirm()` para ações destrutivas: fora do visual e sem texto de consequência.
- Aviso de hydration mismatch em todas as rotas (console): o atributo de tema ou horário é renderizado diferente no servidor e no cliente.

### 4.13 Microcopy técnica exposta

`DOMAIN`/`PDF_CATALOG`… (Serviços), `active`/`pending` (Domínios), `RECEIVED` e `whatsapp_business_account` (WhatsApp), `META_WEBHOOK_VERIFY_TOKEN`/`WHATSAPP_VERIFY_TOKEN`, "Objetos da Meta no Postgres", "tabelas `operations`", "motor: resend", "Implantação OpenAI" (nome interno do programa).

---

## 5. Responsividade (Playwright, 390px)

| Rota | Alvos < 40px | Observação |
|---|---|---|
| implantacao | 24 | 20 botões ✓ de 18×18 |
| financeiro | 15 | chips de período `7d` 44×36, link de conta 27px |
| hub-social/newsletter | 14 | abas + rádios |
| hub-social/meta | 12 | 2 níveis de abas |
| hub-social/seo | 9 | abas de 34px |
| hub-social/* (demais) | 8 | abas do Hub Social de 34px |
| projetos, vagas | 6 | chips de filtro de 34px |
| todas | ≥1 | marca "Ávila Ops" de 28px |

Nenhuma rota teve rolagem horizontal do documento a 390px. O problema no celular é de **densidade e alvos de toque**, não de overflow.

---

## 6. Performance

- 80 de 148 componentes são client; telas inteiras como `NewsletterStudio` (692 linhas), `GoogleCommandCenterClient` (470), `OsbDashboardClient` (328) e `ClientDossierForm` (1.194) são client por completo, embora boa parte seja só leitura.
- Duas bibliotecas de ícones no bundle.
- `googleapis` (pacote grande) é importado em `lib/google-*`, só no servidor. Conferir que nenhum client o importa.
- `globals.css` de 7.105 linhas carregado em todas as rotas.

---

## 7. Pontos sem evidência suficiente nesta auditoria

- Contraste WCAG medido cor a cor: não foi medido.
- Comportamento com dados reais volumosos: a auditoria local usou banco vazio; densidade e quebras longas vieram dos prints de produção.
- Bundle size por rota: não foi medido (build sem analyzer).

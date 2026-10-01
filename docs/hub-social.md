# Hub Social (`/hub-social`)

Os oito canais por onde o cliente é encontrado, falado com e abastecido de
conteúdo. Saíram do setor **Operação** em 16/09/2026 e passaram a ser uma área
própria, com layout e barra de abas compartilhados, uma rota por canal.

Motivo da mudança: os canais não são um subsetor de Operação. Operação é o que a
casa opera para si (saúde, automações, visão central); o Hub Social é o que a
casa opera para fora. Enquanto conviviam, o menu precisava de dois grupos
("Canais" com 6 itens e "Conteúdo" com o Estúdio, separados em 10/09/2026 só
para respeitar o teto de sete itens por grupo) e as sete telas tinham três
padrões de aba, cinco de estado vazio e nenhum cabeçalho em comum.

## Mapa de rotas

| Antes                                                  | Agora                                                   |
| ------------------------------------------------------ | ------------------------------------------------------- |
| `/operacao/seo`                                        | `/hub-social/seo`                                       |
| `/operacao/dominios`                                   | `/hub-social/dominios`                                  |
| `/operacao/google`                                     | `/hub-social/google`                                    |
| `/operacao/meta` (+ `/ativos`, `/leads`, `/campanhas`) | `/hub-social/meta` (+ os mesmos filhos)                 |
| `/operacao/whatsapp`                                   | `/hub-social/whatsapp`                                  |
| `/operacao/newsletter`                                 | `/hub-social/newsletter`                                |
| `/operacao/estudio` (+ `/[id]`)                        | `/hub-social/estudio` (+ `/[id]`)                       |
| (não existia)                                         | `/hub-social/icones`                                    |

A ordem das abas é a de `src/lib/hub-social.ts`, que é a fonte única: o grupo
"Hub Social" do menu (`src/lib/navegacao.ts`) e a barra de abas leem dela. As
`section`s (`seo`, `domains`, `google-suite`, `meta`, `whatsapp`, `newsletter`,
`estudio`) não mudaram — `SideNav` e `MobileNav` continuam acendendo por elas.
Ícones (`/hub-social/icones`, seção `icones`) nasceu aqui em 18/09/2026 e não
tem endereço antigo; foi com ele que o teto de itens por grupo subiu de sete
para oito (`tests/unit/navegacao.test.ts`).

`/operacao` (Visão central) continua existindo; só o card de domínios dele passou
a apontar para o novo lugar.

## Redirecionamentos

`next.config.ts` redireciona **permanentemente (308)**:

```
/operacao/:canal(seo|dominios|google|meta|whatsapp|newsletter|estudio)/:path*
  → /hub-social/:canal/:path*
```

A query string é preservada, e `:path*` casa também com zero segmentos — ou seja,
`/operacao/seo` e `/operacao/meta/leads?organizationId=…` chegam igual. Isso não é
cosmético: o endereço do painel é mandado a cliente por WhatsApp e vive em
favoritos.

**O que não mudou de propósito:** a `redirect_uri` registrada na Meta
(`/api/integrations/meta/oauth/callback`) e as URLs de webhook
(`/api/webhooks/meta`, `/api/webhooks/whatsapp`, `/api/webhooks/whatsapp/flow`).
São contratos com a Meta; mexer neles derruba integração de cliente. Só o
**destino do redirect depois do OAuth** passou a ser `/hub-social/meta`.

## Primitivos criados

Em `src/components/hub-social/`, para uso das telas da área — e, daqui para frente,
das outras telas do app que hoje repetem os mesmos padrões à mão:

| Primitivo           | O que resolve                                                                 |
| ------------------- | ----------------------------------------------------------------------------- |
| `CabecalhoPagina`   | eyebrow, título, subtítulo e ações; no lugar de `page-header`/`operations-header` |
| `AbasHubSocial`     | a barra de abas, ativa por `usePathname()`; no celular, chips roláveis     |
| `Metricas`          | grade `auto-fit`, que acaba com o card órfão de grades 3+1 e 3+2               |
| `TabelaResponsiva`  | tabela no desktop e cartão de andares no celular, com DOM único               |
| `ListaChaveValor`   | rótulo/valor com valor monoespaçado e botão de copiar                          |
| `BotaoCopiar`       | copiar URL, ID ou chave sem sair da tela                                      |
| `EstadoVazio`       | um só padrão, sempre com a ação que resolve; no lugar de cinco classes         |
| `BadgeStatus`       | badge sobre o mapa único de rótulos                                           |
| `FolhaEvidencia`    | "qual evidência produziu este valor?", nos moldes de `HealthEvidenceSheet`     |
| `HubSocialShell`    | o `AppShell` da área mais as abas                                             |

Apoio em `src/lib/`: `hub-social.ts` (os oito canais), `status-rotulos.ts`
(`MAPA_STATUS` e `OBJETIVO_CAMPANHA` — fim dos badges em inglês vindos crus da
API) e `evidencia.ts` (o tipo `Evidencia` e o cálculo de frescor). Os três têm
teste unitário.

A base visual é shadcn/ui em `src/components/shadcn/`, montada sobre os tokens
que já existiam. O `src/components/ui/` legado (`Icones`, `Segmented`, `Sheet`)
não foi tocado: é importado por 28 pontos fora deste escopo, e em Windows
`Sheet.tsx` e `sheet.tsx` colidem.

## Auditabilidade

Vale aqui a regra da tela de Saúde (`docs/SAUDE-TEMPO-REAL-AUDITORIA.md`):
nenhum número aparece sem que se possa responder de onde veio. Toda métrica e
todo badge abrem a `FolhaEvidencia` com origem, função que calculou, fórmula,
horário de leitura e de gravação, referência rastreável e o dado bruto.

Todo campo de `Evidencia` é opcional de propósito. Quando a fonte não informa, a
folha diz **"sem evidência registrada"** — nunca um valor plausível. Foi assim
que apareceu o problema corrigido no caminho: a tela do Google mostrava dez
empresas, avaliações e "usuários ativos agora" que não vinham de lugar nenhum
(`MAPPED_BUSINESSES` fixo no código e `Math.random()`). Agora mostra só o que a
API devolve.

## Limpeza do `globals.css`

O arquivo tinha 6.985 linhas de classes próprias, compartilhadas com dezenas de
telas. A regra da limpeza foi: remover só o que ficou sem uso **no repositório
inteiro**, classe a classe.

Saíram 146 regras e 354 linhas, de 58 classes que as sete telas deixaram de usar
(`seo-*`, `newsletter-*`, `meta-*`, `module-*` do painel de domínios,
`inline-action*`, `panel-actions`, `estudio-acoes`, `mobile-only`,
`operations-metric-primary`). Onde a classe morta dividia seletor com uma viva,
só o seletor morto saiu e a regra ficou.

Duas armadilhas que a limpeza teve de contornar, e que valem para a próxima:

1. **Classe montada em tempo de execução não aparece num grep literal.** As
   famílias `status-*`, `priority-*`, `scope-*`, `run-*`, `marker-*`, `sync-*` e
   `state-*` são construídas por template (`` `status-pill status-${s.toLowerCase()}` ``).
   Um grep ingênuo as dá como mortas; apagá-las tira a cor de badge de meia dúzia
   de telas. Todas ficaram.
2. **Nem todo `@media` é global.** Havia um `@media (prefers-reduced-motion: reduce)`
   que só zerava transição de `.seo-domain-list a` e `.seo-local-nav a`; esse caiu
   junto com as classes. Os outros dois blocos de `prefers-reduced-motion` (o
   global e o de folha/toast) continuam intactos.

Restam 64 classes sem uso que **já estavam mortas antes** desta refatoração
(`login-card`, `sso-button`, `project-card`, `service-plan-*`, `modal-*`,
`ledger-entry-editor`, `reconciliation-editor`, `report-card`,
`newsletter-status-*` e outras). São de telas fora deste escopo e não foram
tocadas — vale um faxina própria, com o mesmo cuidado do item 1 acima.

## O que ficou pendente

- **`?debug=hub-social` não foi implementado.** O modo "Inspecionar dados" do
  dono, que na Saúde mostra o JSON que alimentou a tela (`?debug=health`), ainda
  não existe aqui. A `FolhaEvidencia` já entrega origem, fórmula e dado bruto por
  número; falta a visão da resposta inteira.
- **Aprovação visual do Nicolas.** Os prints de desktop e iPhone, claro e escuro,
  são gerados pelo CI (`.github/workflows/prints-painel.yml`, com dados
  fictícios e nenhum cliente real) e ficam como artefato do run. Desde 17/09/2026
  o CI captura os três aparelhos — 375 × 812, 390 × 844 e 430 × 932 —, então a
  imagem existe; a conferência tela a tela por uma pessoa continua não feita.
- **As quatro automações que iriam para o n8n** (relatório de desempenho agendado,
  sincronização de catálogo, notificações WhatsApp, captura de leads já existente)
  viram backlog do app — a decisão de 16/09/2026 foi deixar o n8n. As telas estão
  prontas para recebê-las com estado vazio honesto; nenhuma mostra dado simulado
  no lugar.
- **`evidence-state` não tem regra no `globals.css`.** O `HealthEvidenceSheet` da
  tela de Saúde usa a classe, mas ela nunca foi estilizada. É de fora deste
  escopo; fica anotado para quem cuidar da Saúde.

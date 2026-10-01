# Núcleo PostgreSQL: implementação e operação

Aplicado em **19/09/2026 às 19:10 UTC (16:10 em Brasília)** no banco `cliente_portal`, servidor `applications`, PostgreSQL 18.6. As cinco migrations foram confirmadas em uma única transação, sob o papel `app_avila`, e registradas em `_prisma_migrations` com os checksums dos arquivos versionados.

Esta entrega coloca a fundação no banco. As telas e APIs existentes ainda precisam adotar as consultas e os fluxos do núcleo. Não houve deploy do app nem alteração do mecanismo de login do Auth.

**Estado mais recente:** portal, sessão, resumo da empresa e criação de contratação implementados no código local; build de produção e validações concluídos. A fundação do banco está em produção, mas essa atualização da aplicação ainda não foi publicada. As seções abaixo preservam a evolução e distinguem cada etapa.

## Estrutura entregue

Schema Prisma: `prisma/schema.prisma`. Namespace PostgreSQL: `core`.

| Tabelas | Finalidade |
|---|---|
| `identity_links`, `memberships` | Identidade por emissor/subject e participação da pessoa na empresa |
| `products`, `product_access` | Instâncias de produtos e acesso por participação na mesma empresa |
| `external_accounts`, `connections` | Conta externa, autorização, escopos e referência à credencial existente |
| `external_assets`, `asset_grants` | Domínios e ativos Meta, com gestão separada de propriedade |
| `sync_states` | Estado, cursor e atualidade de cada sincronização |
| `contracts` | Fotografia das condições comerciais, preservando moeda e periodicidade |
| `invoice_ledger_links` | Relação explícita entre fatura e lançamento financeiro |
| `payments`, `payment_allocations` | Recebimentos idempotentes e alocação parcial por fatura |
| `inbox_events`, `outbox_events` | Entrada e saída de eventos com deduplicação, reserva e tentativas |
| `audit_events`, `reconciliation_issues` | Histórico de alterações e pendências de conciliação |

São **17 tabelas e 9 views**. As entidades existentes em `public`, `operations` e `finance` continuam sendo referenciadas; não foi criada uma segunda cópia de empresas, faturas, senhas ou tokens.

## Migrations

| Migration | Conteúdo |
|---|---|
| `20260919200000_core_foundation` | Tabelas, índices, unicidades e chaves estrangeiras |
| `20260919201000_core_integrity` | Restrições, auditoria, integridade financeira e isolamento dos vínculos |
| `20260919202000_core_legacy_backfill` | Importação comprovada e espelhamento de `portal_clients` |
| `20260919203000_core_queries` | Views, autorização por empresa e funções de filas |
| `20260919204000_core_assets_guards` | Ativos Meta, proteção de identidades externas e auditoria imutável |

As restrições impedem acesso de produto vinculado a outra empresa, alocação financeira com moeda ou empresa incompatível, pagamento acima do saldo e alteração das condições originais de contrato. Pagamentos concorrentes bloqueiam as linhas relevantes antes de calcular o saldo. Edições de tabelas legadas também são verificadas quando houver vínculo financeiro ou externo no núcleo.

A auditoria de memberships, contratos, acessos, concessões e pagamentos rejeita UPDATE/DELETE pelos fluxos normais. O proprietário administrativo do banco continua tecnicamente capaz de modificar sua estrutura; isso não é uma trilha resistente a administradores do PostgreSQL.

## Consultas disponíveis

| View | Uso |
|---|---|
| `effective_memberships` | Participações vigentes com identidade ativa |
| `effective_product_access` | Acessos efetivos a produtos |
| `effective_asset_grants` | Concessões ativas com conexão autorizada e não expirada |
| `connection_health` | Estado da autorização e da sincronização |
| `receivables` | Faturas e recebíveis empresariais sem duplicar lançamentos vinculados |
| `receivable_totals` | Total aberto e vencido por empresa/moeda, independente da paginação |
| `subscription_totals` | Valor por ciclo/moeda e equivalente mensal |
| `contract_drift` | Divergência entre assinatura atual e condições registradas |
| `unresolved_links` | Pendências atuais de vínculo e informação |

`prisma/queries/core-diagnostics.sql` contém a consulta operacional de diagnóstico, somente leitura. `src/lib/nucleo/queries.ts` fornece consultas parametrizadas por empresa, verificações de acesso e funções de inbox/outbox.

O `identityId` deve vir da sessão validada no servidor, nunca do corpo ou parâmetro enviado pelo cliente. Não foi implantado RLS: as consultas SQL são internas e a aplicação deve aplicar autorização antes de expor dados. O acesso público ao schema, tabelas e funções foi revogado. OWNER mantém acesso global; a biblioteca restringe financeiro e pendências globais e considera participações explícitas por empresa. Sua adoção em rotas exige preservar também as regras atuais de cada produto.

Outbox deve ser escrita na mesma transação da alteração de negócio. Inbox só deve receber eventos após verificar autenticação e assinatura do provedor. Workers usam `claim_inbox`/`claim_outbox`, recebem token de reserva e concluem com `finish_inbox`/`finish_outbox`; tokens vencidos não concluem trabalho de outro worker. Consumidores externos ainda não foram implantados. Payloads devem conter referências mínimas, sem credenciais.

## Resultado do preenchimento inicial

| Entidade | Registros |
|---|---:|
| Identidades associadas ao emissor legado `portal_clients` | 15 |
| Participações com empresa explícita | 2 |
| Contratos com condições preservadas | 3 |
| Ativos externos: 23 domínios + 18 ativos Meta | 41 |
| Concessões de gestão, inicialmente pendentes | 41 |
| Conexão externa legada, inicialmente pendente | 1 |
| Instâncias de produtos com identificação suficientemente comprovada | 0 |

Não houve associação por semelhança de nome ou e-mail. Os IDs existentes do Auth em outro banco ainda precisam de associação verificável por emissor/subject. Os vínculos Meta não comprovam propriedade, OAuth vigente ou permissões para publicar. A conexão importada permanece `PENDING`, sem inventar autor ou copiar credenciais.

A view de pendências apontou 8 identidades ativas sem empresa, 3 assinaturas sem produto comprovado, 22 domínios sem vencimento e 1 fatura sem lançamento associado. O registro histórico de reconciliação preservou também contas inativas sem empresa. Resolver essas pendências exige evidência; criar a estrutura não autoriza inferir o vínculo.

O financeiro mostrou R$ 357,00 abertos e vencidos; duas assinaturas mensais somam R$ 607,00, e a anual de R$ 480,00 equivale a R$ 40,00/mês. Nenhuma divergência inicial de contrato. São fotografias da verificação, não valores fixos do sistema.

## Evidências e recuperação

- Backup anterior: `/var/backups/avilaops/core-20260919-190843/cliente_portal.dump`, no servidor `applications`, formato custom, permissão 600. Índice do arquivo validado com `pg_restore --list`; restauração integral desse backup não foi ensaiada.
- SHA256 do backup: `b588c69255a9b49e96dfc6120fde610244cc4b7667e9a72470a0a26a124c9a11`.
- Bundle SQL aplicado: SHA256 `f9fcbcb52376eba8c183907e87a903586eba83a47968a3155e19310356436958`.
- Gerador: `scripts/core/build-release.mjs`; gera SQL e manifesto, não aplica. Exige banco esperado, papel correto, ausência do schema e histórico sem migrations pendentes. Não reaplicar em produção: os cinco recibos já existem.
- Verificação local: `output/nucleo-postgres/production-verification.txt` (artefato ignorado pelo Git).
- Pós-aplicação: 17 tabelas pertencem a `app_avila`, nenhuma constraint não validada e nenhuma concessão pública de tabela. Contagens legadas preservadas: 15 identidades, 3 assinaturas, 2 faturas e 13 lançamentos.
- `/api/health` continuou `ok`, commit `7e4765a`. Isso confirma disponibilidade do health, não substitui teste autenticado completo de todas as telas.

O bundle usa uma transação e timeout de lock de 5 segundos: falha antes do COMMIT desfaz a entrega inteira. Após o COMMIT, preferir migration corretiva. Não apagar `core` nem restaurar o backup sobre produção automaticamente: isso pode descartar gravações posteriores e exige avaliar dependências, janela e restauração em banco separado.

## Validação realizada

As 50 migrations anteriores e as 5 novas foram aplicadas em PostgreSQL local descartável. Fixtures verificaram preenchimento inicial, preservação de anualidade/moeda e ausência de associações presumidas. O bundle exato também foi aplicado em outro banco descartável e o Prisma confirmou histórico atualizado.

A suíte de integração passou com 60 testes em 5 arquivos; depois, a suíte específica passou com 15 testes, incluindo o teste adicional de dois pagamentos concorrentes para uma fatura sem saldo para ambos. ESLint passou nos três arquivos novos de código/teste/geração. Prisma validate e generate passaram.

A checagem TypeScript global permanece bloqueada por erro preexistente em `tests/unit/cadastro-groq.test.ts:79` (TS2352), de outra alteração do checkout. A pasta de artefatos `output` foi excluída do tsconfig para não compilar cópias da auditoria.

## Próxima etapa de adoção

### Continuação em 19/09/2026 — código implementado, ainda não publicado

O portal passou a consultar `core.receivable_totals`, `core.subscription_totals` e `core.receivables`. O total considera todas as faturas, separado por moeda; a lista mostra até 12, com dívidas antigas prioritárias e histórico recente em seguida. Assinaturas exibem a periodicidade real. Pagamento parcial reduz o saldo e não oferece a cobrança legada pelo valor integral.

Sessões locais e o fallback SSO agora exigem conta ativa. O contexto da empresa é validado por `core.effective_memberships`; revogação, suspensão e vencimento retiram o acesso. A rota de equipe exige também participação ADMIN. A sessão continua escolhendo a empresa do cadastro legado: seletor de múltiplas empresas ainda não foi implantado.

O SSO procura primeiro um vínculo explícito `issuer=auth.avilaops.com` + `subject` em `core.identity_links`. Esse vínculo pode atender o portal do cliente, mas não concede acesso ao painel interno. Conta vinculada desativada não usa fallback por e-mail. Para contas internas ainda sem vínculo explícito, o fallback legado por e-mail foi mantido, exigindo conta ativa e papel da casa. Nenhuma associação Auth foi criada automaticamente nesta etapa; a migração completa das identidades ainda depende de evidência de vínculo.

O resumo interno da ficha da empresa ganhou o componente `NucleoDaEmpresa`, mostrando participações, produtos, ativos e estado/data de sincronização das conexões. Não afirma que uma conta pendente esteja autorizada.

O serviço comum de cobrança recusa fatura com pagamento já alocado e moeda diferente de BRL: os adaptadores atuais emitem reais. Isso impede reinterpretar USD/EUR como reais; suporte efetivo de cobrança em outra moeda ainda exige adaptar e validar os gateways. A proteção consulta o saldo antes de chamar o gateway; não substitui futura coordenação transacional entre consumidores de pagamentos e criação de cobranças externas.

Validação desta continuação: **72 testes passaram em 7 arquivos**, incluindo todas as suítes de integração e seis testes de sessão/SSO. ESLint passou nos arquivos alterados. A checagem TypeScript global segue apontando somente o erro preexistente em `tests/unit/cadastro-groq.test.ts:79`. As mudanças desta continuação não receberam deploy nem teste autenticado em produção. O checkout e a versão publicada divergem, portanto publicar requer preparar uma release que preserve as outras alterações e concluir a validação de build.

### Continuação: contratação e UI/UX

Em 19/09/2026, a rota de criação de assinatura passou a usar `src/lib/nucleo/contratacao.ts`: grava assinatura, produto conhecido, contrato com condições originais, primeira fatura recorrente, implantação, auditoria e outbox na mesma transação. Se o contrato falha, nenhuma assinatura parcial permanece. Aliases desconhecidos geram pendência de produto. A outbox registra o evento, mas ainda não há consumidor publicado. Fluxos de criação de assinatura em outros scripts/produtos ainda precisam adotar esse serviço.

O portal ganhou atalhos para seções, separação visual entre moeda e ciclo, destaque de vencidos, progresso de implantação, cartões de fatura, alvos de toque de 44 px e estados acessíveis de erro/processamento. Botões de pagamento ficam bloqueados enquanto há uma requisição em andamento. O quadro interno de contas ganhou indicadores separados, nomes legíveis de provedores e atalho para serviços.

A conferência visual local usou dados fictícios em 390 × 844 e 1440 × 1000. No celular, `scrollWidth` e viewport mediram 390 px. O atalho de faturas funcionou e a inspeção identificou/corrigiu o vencimento que recuava um dia por conversão de fuso: datas civis agora são exibidas em UTC. Capturas em `output/playwright/` são artefatos locais, não evidência de publicação.

O teste de Groq foi corrigido tipando o mock como `typeof fetch`, preservando suas asserções. TypeScript global passou. A suíte completa passou com **493 testes em 45 arquivos**; os **3 testes adicionais de apresentação de faturas** também passaram. ESLint dos arquivos alterados passou. Não houve cobrança real nem alteração de credencial durante os testes.

O primeiro build otimizado terminou com sucesso, mas apontou rastreamento excessivo dos diretórios de uploads. Os caminhos dinâmicos de newsletter e ativos de marca foram explicitamente marcados como dados de runtime, que não devem entrar na imagem. A leitura de ativo local também passou a verificar o caminho relativo, recusando um diretório vizinho com o mesmo prefixo. Três testes adicionais cobrem essa fronteira e a leitura do arquivo salvo. O pacote foi reconstruído após essas correções.

**Resultado final do build:** concluído sem os avisos de rastreamento. A rota de imagens da newsletter passou de 5.344 arquivos rastreados (4.451 em `output`) para 110 arquivos, nenhum em `output`. A verificação `scripts/core/verify-runtime-trace.mjs` conferiu 207 manifests sem artefatos locais nem arquivos de ambiente. O comando `npm run build` agora executa essa verificação após o Next. O log final está em `output/nucleo-postgres/build-release-verified.txt`. Somando a suíte completa e os seis testes adicionais de UI/armazenamento, 499 testes passaram nesta rodada.

Foi preparado um patch local para revisão em `output/nucleo-postgres/nucleo-ui-review.patch`, baseado no checkout `8e12f45`; esse artefato não é um deploy. A versão publicada foi reconferida em `7e4765a`, com health `ok`. As migrations da etapa anterior continuam aplicadas no banco, e as alterações de aplicação desta continuação continuam locais.

### Pendências após essa continuação

1. Publicar e verificar o portal e o resumo da empresa; migrar as demais APIs e telas às consultas centrais.
2. Associar identidades Auth e empresas por evidência, preservando emissor, subject e revogação.
3. Implementar callbacks OAuth e sincronização Meta/Google/WhatsApp com escopos, validade e credenciais existentes.
4. Mapear instâncias reais de produtos e conciliar faturas/lançamentos existentes sem duplicação.
5. Implantar consumidores idempotentes de inbox/outbox e verificar efeitos reais das integrações.

O gatilho legado espelha criação e mudança de empresa/papel/estado em `portal_clients`. Os outros preenchimentos são fotografias iniciais; ainda não substituem os fluxos de escrita da aplicação. Exclusão de identidades ou entidades referenciadas pode ser recusada pelas novas FKs; desativar/arquivar preserva o histórico. Mudanças de identidade de conexão exigem nova autorização, em vez de reaproveitar uma conexão já vinculada.

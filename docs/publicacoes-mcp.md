# Publicações MCP — Ávila Ops

## Decisões de arquitetura

- **Uma publicação MCP por aplicação**: endpoint, versão, permissões e deploy independentes.
- **Sem gateway MCP monolítico**: `mcp.avilaops.com` não é pré-requisito de publicação.
- `app.avilaops.com/operacao/mcps` é o painel administrativo dos registros.
- `auth.avilaops.com` centraliza identidade e autorização, respeitando escopos próprios de cada MCP.
- `memoria.avilaops.com` é o Hindsight, com UI própria; não deve ser renomeado.
- `ml.avilaops.com` é Experiments/MLOps, com UI própria.
- Persistência PostgreSQL centralizada no servidor `applications`, sem novos bancos persistentes nos outros servidores.

## Entrega inicial (PR #95; substitui a PR #93)

1. Modelo Prisma `McpPublication` no schema `operations`.
2. Migração aditiva com dez publicações iniciais, todas `enabled=false`.
3. Tela para OWNER em `/operacao/mcps` e entrada no menu Infraestrutura.
4. API read-only `GET /api/mcps`, autenticada, sem cache.
5. Endpoints de Auth, Mail, CRM, TMS, CMS, Lojas, ERP e MLOps são **propostas**, não confirmações de disponibilidade. Avx-tools e n8n ainda dependem da identificação do endpoint efetivo.

**Atenção:** esta entrega não prova disponibilidade MCP. Não testa `initialize`, `tools/list`, nem OAuth, e não publica nenhum MCP.

## Antes de colocar em produção

- Inventariar as bases e privilégios reais do PostgreSQL em `applications` e reconciliar migrations pendentes.
- Validar lint, TypeScript, suíte Vitest e migration no banco descartável do CI.
- Confirmar acesso da role de banco do App a `operations.mcp_publications`.
- Testar cada publicação separadamente: descoberta, autenticação/OAuth, identidade de tenant, escopos, `initialize`, `tools/list` e invocação somente leitura.
- Para publicação e operações de escrita, adotar política de aprovação e auditoria.
- Atualizar o cadastro `enabled` **somente após homologação**; habilitar não deve ser confundido com disponibilidade em tempo real.
- Submeter a revisão e fazer deploy apenas pelo pipeline padrão, nunca diretamente a partir do PR em draft.

## Retificação do endereço MCP da Lojas — 06/11/2026

O endpoint contratual do Lojas é `https://lojas.avilaops.com/api/mcp`, conforme `lojas.avilaops.com/docs/MCP.md` e `src/app/api/mcp/route.ts`. O seed inicial cadastrava `/mcp`, que não corresponde à rota. A migração aditiva `20261106180000_correct_lojas_mcp_endpoint` ajusta exclusivamente esse registro caso continue desabilitado e com o endereço antigo. O teste sem credenciais encontrou `POST /api/mcp` com HTTP 401; isso verifica exigência de autenticação, **não homologação OAuth, escopos ou isolamento por tenant**. Mantenha `enabled=false` até os demais testes.

Auth, Mail e TMS ainda exigem reconciliação entre domínio, implantação atual e contrato MCP. HTTP 404 sem credencial não permite concluir que não existe outro endpoint válido.

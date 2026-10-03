# Instruções para o Claude neste repositório

@AGENTS.md

Ávila OS: aplicação interna da Ávila Ops. Operação, financeiro, clientes, Hub
Social e a tela de Saúde. Next.js com Prisma e PostgreSQL.

## Fluxo Git — obrigatório

Trabalho concluído não fica parado em PR draft. O ciclo completo, sempre:

1. criar branch de trabalho;
2. implementar;
3. rodar os testes (ver **Como validar**);
4. abrir o PR — **não como rascunho**;
5. aguardar e verificar o CI;
6. corrigir qualquer falha;
7. **mesclar na `main`**;
8. **confirmar que a `main` contém as alterações** — olhando o conteúdo, não só
   a resposta da API do GitHub;
9. apagar a branch temporária depois do merge, quando for seguro.

Não encerre a tarefa deixando PR em rascunho, ou PR aberto sem motivo.

**Só não mescle se houver bloqueio técnico real:** conflito, CI vermelho, ou
pedido explícito para não mesclar — inclusive um pedido escrito no próprio PR
("prints aprovados pelo Nicolas antes do merge" é um pedido explícito).

O deploy é por SSH, com `deploy/publicar.sh <ref>`: build no `orchestrator`,
imagem levada ao `applications` e troca do container. O GitHub Actions está
parado por cobrança da conta desde 19/09/2026, então push na `main` **não**
publica nada. Nunca rode `docker build` no `applications`: sem swap, o build
derruba os apps de cliente por falta de memória. O script para se o ref não
contiver o que está no ar ou se houver migração que produção ainda não tem.

PR de outra sessão que ainda está aberto não é seu para mesclar sem conferir: a
sessão dona pode estar no meio do trabalho.

## Como validar

Rode o mesmo encadeamento do CI antes de abrir PR:

```bash
npm ci
npx prisma generate
npm run lint               # eslint
npx tsc --noEmit
npm run db:test:up         # banco descartável (Docker)
npx prisma migrate deploy
npm test                   # vitest run
npm run db:test:down
```

O banco de teste precisa do papel `app_avila` antes das migrações: duas
migrações (`20260816020000_add_subscription_billing` e
`20260904190000_add_estudio_module`) fazem `ALTER TABLE … OWNER TO app_avila`,
que só existe em produção. Sem o papel, todo run falha nesse passo antes de
chegar em build ou deploy — e o job só aparece como `failure`, sem log que
deixe isso óbvio. O CI cria o papel num passo próprio; reproduza isso se montar
o banco à mão:

```sql
DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='app_avila')
  THEN CREATE ROLE app_avila; END IF; END $$;
```

Sem Docker, dá para subir um PostgreSQL local e apontar `DATABASE_URL` para ele.

`npm run test:unit` roda só `tests/unit` — útil no meio do trabalho, mas não
substitui a suíte antes do PR.

## Conferência visual

**Mudança de tela se confere no navegador.** Lint, tipos e testes passam com a
interface quebrada. Suba a aplicação e olhe: erro no console, estouro
horizontal, e os dois temas, em desktop e iPhone. Vários defeitos recentes só
apareceram assim — nenhum teste os reprovava.

Chromium está em `/opt/pw-browsers/chromium` nas sessões remotas.

## Regras de produto que valem para código novo

- **Todo número na tela abre a evidência**: origem, fórmula, horário da medição
  e dado bruto. É a regra da tela de Saúde (`docs/SAUDE-TEMPO-REAL-AUDITORIA.md`)
  e o Hub Social a seguiu. Número sem procedência não entra.
- **Nunca invente dado para preencher tela.** Já houve `Math.random()` e lista
  fixa de empresas fingindo vir de API. Se a API não devolveu, a tela diz que
  não devolveu.
- **Componente compartilhado antes de cópia.** A base visual é `src/components/
  shadcn` sobre os tokens da casa, com os primitivos de `src/components/
  hub-social` (cabeçalho, métricas, tabela responsiva, lista chave/valor, estado
  vazio, badge, folha de evidência). Tela nova reaproveita; não duplica.
- **Endereço que muda redireciona com 308**, mantendo a query string — os
  redirects ficam em `next.config.ts`, não espalhados pelas rotas. O link do
  painel é mandado a cliente por WhatsApp e vive em favoritos: o antigo precisa
  continuar chegando. `redirect_uri` de OAuth e URL de webhook não mudam sem
  combinar antes.

## Convenções

- Tudo em português: código, comentários, commits e PR.
- Commit explica **por que**, com a consequência concreta — não só o que mudou.
- Migração é aditiva por padrão. Migração já aplicada à mão em produção precisa
  ser dita no commit.
- Segredo só em variável de ambiente. Token da Meta é guardado cifrado
  (`META_TOKEN_ENCRYPTION_KEY`); o banco não guarda certificado, chave Pix nem
  segredo de aplicação em claro.
- Conciliação e exportação geram evento de auditoria.

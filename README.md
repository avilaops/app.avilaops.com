# Ávila OS

Aplicação interna da Ávila Ops para operação e controle financeiro. O módulo
financeiro conecta a conta Efí ao PostgreSQL, importa movimentações Pix de forma
idempotente e oferece conciliação manual, trilha de auditoria e relatórios CSV.

## Segurança da integração

- A sincronização com a Efí é somente leitura: saldo, Pix recebidos e Pix
  enviados.
- OAuth da Efí e certificado mTLS ficam apenas em variáveis de ambiente.
- O token da Meta é armazenado somente criptografado, usando
  `META_TOKEN_ENCRYPTION_KEY`; sem essa chave, o banco não permite recuperar o
  acesso.
- O banco não armazena certificado, chave Pix ou segredo de aplicação em claro.
- Rotas internas exigem uma identidade `ADMIN` válida do portal.
- O cookie da sessão é HTTP-only, `SameSite=Lax` e seguro em produção.
- Toda conciliação e exportação gera um evento de auditoria.

## Configuração

Copie `.env.example` para `.env.local` e preencha os valores usando o gerenciador
de segredos do ambiente:

```powershell
Copy-Item .env.example .env.local
npm install
npm run db:generate
```

Para um banco novo e isolado:

```powershell
npm run db:migrate
```

Se o `DATABASE_URL` apontar para o banco compartilhado com o portal
`cliente.avilaops.com`, primeiro alinhe o baseline do histórico de migrations. O
banco local atual já possui migrations do portal que não pertencem a esta
pasta; não execute migrations compartilhadas no ambiente de produção sem essa
reconciliação.

## Uso local

```powershell
npm run dev
```

Acesse `http://localhost:3000`. Se a porta estiver ocupada:

```powershell
npm run dev -- --port 3418
```

Para encerrar, pressione `Ctrl+C`. Para reiniciar, encerre o processo e execute o
mesmo comando novamente.

## Sincronização da Efí

Sincronização manual dos últimos 30 dias:

```powershell
npm run efi:sync -- --days=30
```

Rotas relevantes:

- `/financeiro`: painel, fluxo de caixa e fila de conciliação;
- `/relatorios`: exportações operacionais e resumo executivo;
- `POST /api/integrations/efi/sync`: sincronização autenticada;
- `PATCH /api/reconciliations/:id`: decisão de conciliação autenticada.

## Provisionamento pela ficha (via n8n)

A ficha do cliente (`/clientes/[id]`) tem dois painéis abaixo do dossiê:

- **Provisionamento** — acesso ao SSO, domínio na Cloudflare + DNS padrão +
  domínio no mail, caixa de e-mail, Google (GA4/GTM/Search Console) e loja.
  Cada botão chama uma rota `POST /api/organizations/[id]/<ação>` que fala
  com um workflow "Ávila OS — *" do n8n e grava o resultado.
- **Cobrança e cadastro** — assinatura a partir do catálogo (PIX/boleto pela
  Éfi), etapas do onboarding, marcas e cofre de credenciais.

Contrato completo, IDs dos workflows e variáveis de ambiente:
[`docs/provisionamento-n8n.md`](docs/provisionamento-n8n.md). Os scripts
`criar-assinatura.ts` e `sync-openai-project.ts` foram substituídos por essas
telas e ficam só por histórico.

## Assistente de cadastro (Receita Federal + IA)

Acima da ficha, na aba de cadastro, um painel mostra a completude do cliente e
de onde cada campo vazio pode ser preenchido:

- **Preencher pela Receita** — lê a consulta de CNPJ já guardada em
  `organizations.cnpj_data` e propõe razão social, segmento, endereço,
  telefone e e-mail. Não faz chamada externa e não depende da IA.
- **Redigir com IA** — passa pelo Ávila AI Core em saída estruturada e propõe
  só campos descritivos (descrição, serviços, produtos, diferenciais, área de
  atendimento). Documento, telefone, e-mail e endereço nunca são gerados por
  modelo, e um teste de unidade trava isso.

Nenhuma das duas escreve na ficha: cada campo proposto entra na fila
`operations.organization_registration_suggestions` e só vira dado quando uma
pessoa aprova, com autor, horário e evento de auditoria. Detalhes das
barreiras, do custo e da ativação:
[`docs/cadastro-assistido-ia.md`](docs/cadastro-assistido-ia.md).

## Vagas e recrutamento

As vagas de `jobs.avilaops.com` vivem em `operations.job_postings` e vão para o
site no build, o site continua sendo export estático, porque o JSON-LD
`JobPosting` precisa estar no HTML servido para o Google Jobs indexar.

Rotas relevantes:

- `/vagas`: listagem com filtro por estado, área e busca, e aviso de site
  desatualizado;
- `/vagas/[id]`: editor da vaga com prévia da página e as ações de publicação;
- `GET|POST /api/job-postings` e `GET|PUT|DELETE /api/job-postings/:id`;
- `POST /api/job-postings/:id/publish|pause|close`;
- `GET /api/public/job-postings`: consumida pelo build do site, com service JWT.

Publicar no painel **não** publica o site. Depois de mudar uma vaga no ar:

```powershell
cd ../jobs.avilaops.com
npm run deploy
```

O painel avisa quando isso está pendente comparando a última edição de vaga
publicada com o carimbo da última leitura feita pelo build.

## Integração Meta Business

Rotas relevantes:

- `/operacao/meta`: painel interno de conexão e sincronização;
- `GET /api/integrations/meta/oauth/start`: inicia o OAuth com a Meta;
- `GET /api/integrations/meta/oauth/callback`: recebe o retorno OAuth;
- `POST /api/integrations/meta/sync`: sincroniza negócios, páginas, Instagram e
  contas de anúncio;
- `GET/POST /api/webhooks/meta`: verificação e recebimento de eventos da Meta.

Variáveis obrigatórias para conectar:

```text
META_APP_ID
META_APP_SECRET
META_TOKEN_ENCRYPTION_KEY
META_WEBHOOK_VERIFY_TOKEN
APP_URL=https://app.avilaops.com
```

No painel da Meta, use:

```text
OAuth Redirect URI: https://app.avilaops.com/api/integrations/meta/oauth/callback
Webhook Callback URL: https://app.avilaops.com/api/webhooks/meta
```

## Produção

```powershell
npm run build
npm run start
```

O agendamento da sincronização deve chamar a API ou o script por um scheduler
confiável, com bloqueio para impedir execuções concorrentes. Esta entrega não
publica o app nem altera o banco de produção.

## Papéis e área do cliente (30/08/2026)

O `cliente.avilaops.com` não será construído: a área do cliente vive aqui, em
`/portal`.

| Papel | Quem é | Onde cai | O que pode |
|---|---|---|---|
| `OWNER` | a **plataforma**: Avila Ops (nicolas@avilaops.com) | `/operacao` | tudo, em todas as empresas |
| `ADMIN` | o **dono do negócio** que contrata: restaurante, loja, oficina | `/portal` | a própria empresa e a equipe dela |
| `CLIENT` | a **equipe** desse dono | `/portal` | usa o produto; não administra gente |

São três pessoas diferentes, não três níveis da mesma. Todas vivem na mesma
tabela (`public.portal_clients`) e entram pela mesma porta: o papel não decide
*se* entra, decide *para onde vai* e o que alcança.

`app.avilaops.com` é o painel da plataforma, então **só OWNER** passa de
`/operacao` para dentro. O dono do negócio e a equipe dele vivem em `/portal` e
no painel do produto que assinam (Lojas, Comandeiro).

### Quem administra quem

- **OWNER** administra qualquer conta pelo painel do `auth.avilaops.com/admin`:
  cria, troca papel, liga a empresa, desliga, redefine senha.
- **ADMIN** administra a equipe da **própria** empresa, no cartão "Quem tem
  acesso" do `/portal`: cadastra, dá nova senha provisória, desliga e religa.
  A empresa vem sempre do `organizationId` da sessão, nunca da tela: é o que
  impede o dono de um negócio mexer na equipe de outro. Ele também não desliga
  o próprio acesso, senão a empresa fica sem quem religue.
- **CLIENT** não administra ninguém.

Conta desligada (`ativo = false`) é recusada no login com a mesma resposta de
senha errada, e o histórico dela continua de pé. Desligar é sempre melhor que
apagar: a tabela tem pedido, domínio e auditoria apontando para cá, e o banco
recusa o delete quando há vínculo.

### A linha entre OWNER e ADMIN

São papéis diferentes, não graus do mesmo. **Do dono é o que não se delega:**

| Área | Rotas e telas |
|---|---|
| Dinheiro | `/financeiro/*`, `/relatorios`, `/api/ledger-entries`, `/api/bank-transactions`, `/api/reconciliations`, `/api/reports`, `/api/mercadopago/*`, `/api/organizations/[id]/assinatura`, `/api/service-plans`, `/api/integrations/wise/import` |
| Segredo | `/api/organizations/[id]/cofre*` |
| Acesso | `/clientes/solicitacoes`, `/api/registration-requests/[id]/approve` e `/reject`, `/api/organizations/[id]/acesso` |
| Gasto de IA | `/api/internal/ai-core/approvals/[id]` |

**Da equipe é a operação:** clientes e fichas, projetos, tarefas, entregas,
domínios, provisionamento (caixa, domínio, Google, loja, restaurante, marcas),
SEO, Meta, WhatsApp, newsletter, vagas, relatórios técnicos. Uma automação
sincroniza o Éfi (`/api/integrations/efi/sync` aceita `x-service-key`), mas não
cobra ninguém nem abre o cofre.

O menu já sai filtrado (`navegacaoDoPapel`), mas esconder não é proteger: cada
página do dono chama `ehDono(admin.role)` e redireciona para `/operacao`, e cada
rota responde `403`. A conta de automação que tentar cobrar recebe 403, não uma
tela vazia.

**Regra de ouro:** nunca compare `role === "ADMIN"`. Use `ehDaCasa(role)` de
`src/lib/auth.ts` (OWNER ou ADMIN) e `ehDono(role)` para o que só o dono pode.
Foi essa indireção que permitiu introduzir OWNER sem revisar as 70 rotas que
chamam `getAdmin()` — e a única comparação literal que restava (no login)
rebaixaria o dono a cliente se não tivesse sido corrigida antes da promoção.

**Ordem obrigatória ao mexer em papel:** primeiro o código aceita o papel novo
em produção, depois a conta é promovida no banco. O contrário tranca o acesso.

### Vínculo conta → empresa

`portal_clients.organization_id` diz qual empresa a conta representa. Sem ele,
`CLIENT` era um papel solto e a área do cliente não teria o que mostrar. Quem
grava:

- a aprovação de solicitação (`/api/registration-requests/[id]/approve`), logo
  depois de criar ou achar a organização;
- `scripts/vincular-contas-organizacoes.ts` para o que já existia — modo seco
  por padrão, `--aplicar` para gravar. Casa por e-mail do contato, CPF/CNPJ e
  domínio do e-mail contra o slug da organização, e **deixa de fora** o que não
  tiver candidato único: vincular no chute daria a um cliente a empresa de outro.

`/portal` filtra sempre pelo id da conta autenticada, nunca por parâmetro de
URL — não existe caminho para pedir a empresa de outro.

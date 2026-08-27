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

## Vagas e recrutamento

As vagas de `jobs.avilaops.com` vivem em `operations.job_postings` e vão para o
site no build — o site continua sendo export estático, porque o JSON-LD
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
APP_URL=https://app.avila.inc
```

No painel da Meta, use:

```text
OAuth Redirect URI: https://app.avila.inc/api/integrations/meta/oauth/callback
Webhook Callback URL: https://app.avila.inc/api/webhooks/meta
```

## Produção

```powershell
npm run build
npm run start
```

O agendamento da sincronização deve chamar a API ou o script por um scheduler
confiável, com bloqueio para impedir execuções concorrentes. Esta entrega não
publica o app nem altera o banco de produção.

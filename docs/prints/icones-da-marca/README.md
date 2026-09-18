# Conferência visual — gerador de ícones da marca

Prints de 17/09/2026 do bloco "Ícones a partir da logo"
(**Clientes → cliente → Arquivos**, ou Cadastro → Identidade e arquivos),
nos dois temas e nos dois tamanhos. Feitos com Chromium via Playwright contra
a aplicação rodando de verdade, não com mock.

| Arquivo | O que mostra |
| --- | --- |
| `desktop-dark-1-antes.png` / `desktop-light-1-antes.png` | 1440×900, estado "6 faltando" |
| `desktop-dark-2-codigo.png` / `desktop-light-2-codigo.png` | o mesmo com "Código para o site do cliente" aberto |
| `desktop-dark-3-depois.png` | depois de gerar: "conjunto completo", "Nada a gerar" e o recibo dos 6 arquivos |
| `desktop-dark-4-pagina.png` | a página inteira, para ver o bloco no contexto do dossiê |
| `iphone-*-1-antes.png` / `iphone-*-2-codigo.png` | 390×844 @2x, uma coluna |

## Dois defeitos que só apareceram aqui

Nenhum dos dois reprovava em lint, tipos ou teste:

1. **Caixa de marcação esticada.** `.icon-generator-tipo` é flex; sem tamanho
   fixo no `input[type=checkbox]` o navegador esticava a caixa até a altura do
   card — um quadrado cinza de ~85px ao lado de cada rótulo, empurrando o texto
   para a direita. Corrigido com `flex: none` e 18×18.
2. **Bloco mais largo que o iPhone.** Item de grade nasce com `min-width: auto`,
   então o `<pre>` do trecho de `<head>`, que tem linhas longas, alargava o
   bloco inteiro para ~537px numa tela de 390px — mesmo com `overflow-x: auto`
   no próprio `<pre>`. Corrigido com `min-width: 0` nos filhos da grade.

O segundo passou pela primeira versão do roteiro, que só media
`documentElement.scrollWidth`. O roteiro agora mede **também o bloco**
(`conferirLargura` em `conferir.mjs`) — sem isso a conferência dava "tudo certo"
numa tela visivelmente cortada.

## Como repetir

Precisa de um Postgres descartável. Docker não estava disponível nesta máquina;
o caminho abaixo usa o PostgreSQL 18 instalado localmente, criando um cluster
**novo**, em porta própria — o cluster de trabalho não é tocado.

```bash
PG="/c/Program Files/PostgreSQL/18/bin"
DIR=/tmp/pgdata-visual

"$PG/initdb" -D "$DIR" -U postgres --pwfile=<(echo postgres) -E UTF8 --locale=C
"$PG/pg_ctl" -D "$DIR" -l /tmp/pg.log -o "-p 55432" start

export PGPASSWORD=postgres
"$PG/psql" -h 127.0.0.1 -p 55432 -U postgres -c "CREATE DATABASE cliente_portal_dev;"
"$PG/psql" -h 127.0.0.1 -p 55432 -U postgres -d cliente_portal_dev \
  -c "DO \$\$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='app_avila')
      THEN CREATE ROLE app_avila; END IF; END \$\$;"

export DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:55432/cliente_portal_dev"
npx prisma migrate deploy
node docs/prints/icones-da-marca/seed-visual.mjs   # rode a partir da raiz do app
```

O `app_avila` precisa existir antes das migrações: duas delas fazem
`ALTER TABLE … OWNER TO app_avila` e o run inteiro falha sem ele.

Suba a aplicação com o banco descartável e sem credenciais de R2 — senão a
geração grava no bucket de produção:

```bash
DATABASE_URL="$DATABASE_URL" \
APP_JWT_SECRET="segredo-conferencia-visual-local" \
R2_BUCKET="" CLOUDFLARE_ACCOUNT_ID="" R2_ACCESS_KEY_ID="" R2_SECRET_ACCESS_KEY="" \
npx next dev -p 3210
```

Variável já presente no ambiente vence o `.env.local`, então o `DATABASE_URL` de
verdade não é usado. **Use `localhost`, não `127.0.0.1`**: o dev server bloqueia
recursos `/_next/*` de origem cruzada e a página não hidrata — os botões não
respondem e o erro não aparece em lugar nenhum óbvio.

Por fim:

```bash
cd docs/prints/icones-da-marca
npm install playwright-core            # os navegadores já estão em %LOCALAPPDATA%\ms-playwright
node -e "require('fs').writeFileSync('token.txt', require('jsonwebtoken').sign({sub:'admin-visual',role:'OWNER'},'segredo-conferencia-visual-local',{expiresIn:28800}))"
node conferir.mjs ./tiros
```

## Dados e credenciais do ambiente de conferência

Tudo descartável, criado só para esta conferência. Nada disto existe em produção
e nada disto é segredo de verdade.

| Item | Valor |
| --- | --- |
| Postgres | `postgresql://postgres:postgres@127.0.0.1:55432/cliente_portal_dev` |
| Cluster | criado com `initdb`, separado do PostgreSQL 18 de trabalho |
| `APP_JWT_SECRET` | `segredo-conferencia-visual-local` |
| Admin | `nicolas@avilaops.com` / `visual123` (id `admin-visual`, papel OWNER) |
| Cliente | `org-visual` — Saúde Pet Brasil, nº 100002, com `Logo principal` em SVG |
| Aplicação | `http://localhost:3210` |

O roteiro entra por **cookie de sessão** (`avila_ops_session`, JWT assinado com o
segredo acima), não pelo formulário: o clique em "Entrar" acontecia antes da
hidratação e virava POST nativo — o `/api/auth/login` espera JSON e devolvia 400.

## O que o roteiro reprova

- `console.error` ou exceção na página (menos o websocket do HMR, que é ruído do
  dev server nesta máquina);
- documento, bloco ou conteúdo do bloco mais largos que a tela;
- tema pedido diferente do tema pintado — o Ávila OS usa `data-theme` no `<html>`
  vindo do `localStorage`, **não** `prefers-color-scheme`, então
  `colorScheme` do Playwright sozinho não troca nada e as duas passagens saem
  idênticas sem ninguém perceber;
- geração que não termina com a mensagem de sucesso.

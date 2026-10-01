# Conferência visual — logotipos dos provedores no cofre

Prints de 19/09/2026 do **Operação → Cofre de credenciais**, com o logotipo do
provedor no cabeçalho de cada grupo. Nos dois temas e nos dois tamanhos, contra
a aplicação rodando de verdade.

| Arquivo | O que mostra |
| --- | --- |
| `desktop-light.png` / `desktop-dark.png` | 1440×900, os dez grupos do cofre |
| `iphone-light.png` / `iphone-dark.png` | 390×844 @2x, uma coluna |

Aparecem com marca: Google, Instagram, Meta/Facebook, Threads, WhatsApp e X.
Mercado Livre, Mercado Pago e "Outros" aparecem só com o título, porque não há
arquivo com procedência para eles em `public/marca/social/`.

## O defeito que só apareceu aqui

Metade das marcas estava em preto e a outra metade colorida, e nada disso
reprovava em lint, tipos ou teste.

Oito dos dezessete SVGs tinham sido trocados por versões monocromáticas do
`simple-icons`, vindas de um CDN, enquanto os outros nove continuavam sendo os
arquivos coloridos do Wikimedia Commons. No tema claro passava por escolha de
estilo; no escuro, Instagram e Google simplesmente sumiam no fundo.

Daí saíram duas coisas:

- `scripts/baixar-logos-sociais.mjs`, que compara cada arquivo com a página do
  Commons e **falha** quando algum divergir. Rode antes de mexer na pasta;
- a regra de inversão passou a distinguir traço preto de emblema fechado.
  `apple`, `github` e `threads` são traço preto sobre transparente e são
  invertidos no escuro. `x` e `tiktok` já trazem fundo próprio com o símbolo
  claro recortado: inverter faria dos dois um disco branco.

## O que o roteiro reprova

- `console.error` ou exceção na página (menos o websocket do HMR);
- documento ou grupo mais largos que a tela;
- logotipo que não carregou (`naturalWidth === 0`), que é como um caminho
  errado se manifesta: espaço em branco, sem erro em lugar nenhum;
- logotipo fora de 16×16, que é como uma marca amassada se manifesta;
- tema pedido diferente do tema pintado. O Ávila OS lê `data-theme` no `<html>`
  a partir do `localStorage`, então `colorScheme` do Playwright sozinho não
  troca nada e as duas passagens sairiam idênticas sem ninguém perceber.

## Como repetir

Precisa de um Postgres descartável. A receita completa (cluster próprio com
`initdb`, papel `app_avila` antes das migrações, entrar por cookie de sessão)
está em [`../icones-da-marca/README.md`](../icones-da-marca/README.md). Resumo:

```bash
export DATABASE_URL="postgresql://postgres@localhost:55432/avila_teste?schema=public"
npx prisma migrate deploy
node docs/prints/logos-sociais/seed-cofre.mjs   # admin + uma chave por categoria

DATABASE_URL="$DATABASE_URL" \
APP_JWT_SECRET="segredo-conferencia-visual-local" \
R2_BUCKET="" CLOUDFLARE_ACCOUNT_ID="" R2_ACCESS_KEY_ID="" R2_SECRET_ACCESS_KEY="" \
npx next dev -p 3210

npm install --no-save playwright-core
node docs/prints/logos-sociais/conferir-cofre.mjs docs/prints/logos-sociais
```

Use `localhost`, não `127.0.0.1`: o dev server bloqueia recursos `/_next/*` de
origem cruzada e a página não hidrata, sem erro óbvio em lugar nenhum.

Tudo do ambiente de conferência é descartável e nada disso existe em produção:
o admin é `admin-visual` (`nicolas@avilaops.com` / `visual123`), e as doze
chaves semeadas têm máscara de mentira e nenhum valor cifrado.

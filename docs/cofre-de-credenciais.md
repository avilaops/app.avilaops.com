# Cofre de credenciais

Onde ficam os segredos **da plataforma** — `META_APP_SECRET`, chaves do
Mercado Pago, consumer keys do X. Construído em 17/09/2026 para acabar com a
prática de copiar a mesma credencial em doze arquivos `.env` pelo parque
(o levantamento está em [inventario-chaves-integracoes.md](./inventario-chaves-integracoes.md)).

Tela: **/operacao/credenciais**, só OWNER. Nem o sócio entra — `ehDono()`,
não `ehDaCasa()`.

## As duas camadas

| | Credencial da plataforma | Token do cliente |
|---|---|---|
| Exemplo | `META_APP_SECRET` | access token da Meta do cliente X |
| Onde mora | `platform_credentials` (este cofre) | `OrganizationIntegrationConnection.tokenCiphertext` |
| Escopo | uma para toda a Ávila Ops | uma por organização |
| Chave de cifra | `CREDENCIAIS_ENCRYPTION_KEY` | `META_TOKEN_ENCRYPTION_KEY` |

A segunda camada já existia e está certa. Este documento é sobre a primeira.

## Como o código lê

Sempre por `obterCredencial()` / `exigirCredencial()` de
[`src/lib/credenciais.ts`](../src/lib/credenciais.ts). A ordem é **cofre, depois
`process.env`**.

```ts
import { exigirCredencial, obterCredencial } from "@/lib/credenciais";

const appId = await exigirCredencial("META_APP_ID");   // estoura se faltar
const versao = (await obterCredencial("META_GRAPH_VERSION")) ?? "v25.0";
```

O fallback para o ambiente é deliberado e é o que permite migrar chave a chave:
código que ainda lê `process.env` direto continua funcionando, e código já
migrado funciona tanto com a chave no cofre quanto sem. Também é a rede de
segurança quando o banco está fora — a integração cai para o `.env` em vez de
morrer.

Há cache de processo de 60s. `limparCacheDeCredenciais()` zera na hora; salvar
pela tela já invalida a chave alterada.

### Duas chaves que nunca vão para o cofre

`CREDENCIAIS_ENCRYPTION_KEY` e `META_TOKEN_ENCRYPTION_KEY` continuam
obrigatoriamente no ambiente: são o que **decifra** o cofre. Guardar a chave
dentro da caixa que ela abre não funciona.

## O que já foi migrado

`src/lib/meta.ts` e `src/app/api/webhooks/meta/route.ts` leem do cofre:
`META_APP_ID`, `META_APP_SECRET`, `META_GRAPH_VERSION`, `META_REDIRECT_URI`,
`META_OAUTH_SCOPES`, `META_WEBHOOK_VERIFY_TOKEN`.

Isso tornou assíncronas `metaGraphVersion()`, `metaOAuthScopes()`,
`metaRedirectUri()`, `buildMetaLoginUrl()` e `verifyMetaWebhookToken()`. Quem
chamar essas funções precisa de `await`.

Ainda em `process.env`: WhatsApp, Mercado Pago, Google e o resto do parque.
São os próximos, e a migração de cada um é trocar `process.env.X` por
`await obterCredencial("X")`.

## Classificação automática

`categoriaDaChave()` agrupa por prefixo (`META_`, `WHATSAPP_`, `MP_`, `X_`…).

`ehSegredo()` decide o que é máscara e o que aparece em claro. Versão da Graph,
redirect URI, escopos e App IDs são públicos por natureza — aparecem na própria
URL de consentimento. Tratar tudo como segredo obrigaria a revelar o que não
precisa, e treina o time a clicar em "revelar" sem pensar.

## Status

- **ATIVO** — tem valor guardado.
- **PENDENTE** — algum código lê a chave e ela não tem valor. É integração
  quebrada agora, não pendência futura.
- **APOSENTADA** — nenhum código lê. É anotação, não configuração. O cofre
  guarda mesmo assim, porque o dado existe e alguém precisa dele; só não finge
  que configurar aquilo muda alguma coisa.

## Carregar o cofre

```
npm run credenciais:importar              # simulação, não grava
npm run credenciais:importar -- --aplicar
npm run credenciais:importar -- --aplicar --so=META_,WHATSAPP_
```

Varre os `.env` do monorepo, apura quem lê cada chave no código e grava. Ignora
cópias de build (`.next`, `.deploy-health-runtime`, `.lojas-blog-release`,
`APK/app-build`) e `.env.example`.

Quando a mesma chave aparece com valores diferentes em arquivos diferentes, o
script **reporta em vez de escolher em silêncio** — escolher errado ali troca a
credencial de produção por uma de teste sem ninguém perceber. Na simulação de
17/09/2026 eram 18 chaves divergentes, entre elas `MP_ACCESS_TOKEN`,
`MP_WEBHOOK_SECRET` e `WHATSAPP_VERIFY_TOKEN`.

A ordem de precedência está em `PRIORIDADE`, no topo do script.

## Conferir a cifra

```
npm run cofre:verificar
```

Não precisa de banco. Testa ida e volta (inclusive valor de 4000 caracteres),
recusa de payload adulterado e de formato inválido, não determinismo da cifra,
e a classificação de segredo e categoria.

## Auditoria

Toda gravação e **toda revelação** viram `OperationsAuditEvent`
(`PLATFORM_CREDENTIAL_SET`, `PLATFORM_CREDENTIAL_REVEALED`,
`PLATFORM_CREDENTIAL_DELETED`), com autor e horário. O evento nunca carrega o
valor — registra que mudou, não o que virou.

Revelar é `POST`, não `GET`, de propósito: é um ato que fica no histórico, e não
algo que um prefetch do navegador dispare sozinho.

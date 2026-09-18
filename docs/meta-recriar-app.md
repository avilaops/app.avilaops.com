# Recriar os apps da Meta (Hub Social + WhatsApp)

Contexto: em 17/09/2026 todos os apps da Meta da Ávila Ops foram excluídos pelo
dono do portfólio. Os IDs antigos (`1670392484704840`, `1620177389769428`,
`992206093422063`, `452763450848980`) estão mortos e não devem voltar a aparecer
em nenhum `.env`. Este documento é o caminho de volta.

Os ativos do portfólio **não** foram perdidos: continuam lá as Páginas
Avila Ops Tecnologia e Mello Transportes, o Instagram `mellotransportes_riopreto`,
a conta WhatsApp "Auto Atendimento Avila Ops" e os 2 catálogos. Só a camada de
app precisa ser refeita.

## 0. Destravar o portfólio

Em Configurações > Usuários > Pessoas, os três usuários estão com
"Chave de acesso não ativada" / *Passkey required*. Enquanto a passkey não for
ativada, o usuário não consegue administrar o portfólio — e criar app exige isso.
Ative a passkey do usuário que vai criar o app antes de qualquer outra coisa.

## 1. Criar o app

developers.facebook.com > Meus apps > Criar app.

- Caso de uso: **Outro** > tipo **Empresa** (o tipo Empresa é o único que aceita
  Login do Facebook para Empresas + WhatsApp + Instagram no mesmo app).
- Portfólio empresarial: **Avila Ops Tecnologia** (`1340735580892153`).
  Vincular na criação evita ter que pedir acesso aos ativos depois.

A recomendação é **um app único** para tudo. O código aceita app separado para o
WhatsApp (`WHATSAPP_APP_SECRET` é uma variável própria), mas aí são dois
processos de Verificação de Empresa e dois App Review.

## 2. Produtos a adicionar

| Produto | Para quê |
|---|---|
| Login do Facebook para Empresas | botão "Conectar Meta" do Hub Social |
| WhatsApp | Auto Atendimento, catálogo, flows |
| API do Instagram | leitura do `mellotransportes_riopreto` |
| Marketing API | contas de anúncio e campanhas |
| Webhooks | leads e eventos |

## 3. Configurações > Básico

- Domínios do app: `avilaops.com`
- URL da Política de Privacidade: obrigatória para sair do modo Desenvolvimento
- Ícone 1024x1024 e categoria: obrigatórios para publicar
- Copiar **ID do app** e **Chave Secreta do app**

## 4. Login do Facebook > Configurações

URI de redirecionamento do OAuth válido — exatamente esta, sem barra no final:

```
https://app.avilaops.com/api/integrations/meta/oauth/callback
```

Essa URL é contratual: está no painel do Hub Social e é montada em
`src/lib/meta.ts` (`metaRedirectUri`). Se divergir um caractere, o consentimento
volta com "URL bloqueada".

## 5. Webhooks

Callback: `https://app.avilaops.com/api/webhooks/meta`
Token de verificação: o valor de `META_WEBHOOK_VERIFY_TOKEN` no `.env.production`.

Assinar, no mínimo: `page` (campo `leadgen`) e `whatsapp_business_account`
(campos `messages`, `message_template_status_update`).

O handler valida `x-hub-signature-256` com `META_APP_SECRET` — se o WhatsApp
ficar em app separado, os eventos dele vão falhar na assinatura até o secret
certo ser usado.

## 6. Permissões (App Review)

Os escopos pedidos no OAuth estão em `META_OAUTH_SCOPES`:

```
business_management, pages_show_list, pages_read_engagement,
instagram_basic, ads_read, leads_retrieval
```

Em modo Desenvolvimento eles funcionam só para quem é admin/dev/testador do app —
o que basta para validar a conexão. Para uso normal, o app precisa ir para **Ativo**
e passar por App Review em `business_management`, `leads_retrieval` e `ads_read`.

## 7. Preencher as credenciais

Desde 17/09/2026 o lugar certo é o **cofre** (`/operacao/credenciais`), não o
`.env` — ver [cofre-de-credenciais.md](./cofre-de-credenciais.md). O `.env`
continua funcionando como queda, então preencher lá também não quebra nada;
só deixa de ser a fonte de verdade.

No `.env.production` (as duas chaves de token já foram geradas e não dependem
do painel da Meta):

```
META_APP_ID=            # Configurações > Básico
META_APP_SECRET=        # Configurações > Básico
WHATSAPP_APP_SECRET=    # mesmo secret, se for app único
WHATSAPP_API_TOKEN=     # WhatsApp > Configuração da API > token permanente do usuário do sistema
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_CATALOG_ID=    # Catálogo "Avila Ops Store - WhatsApp Catalog"
```

Use um **usuário do sistema** para o `WHATSAPP_API_TOKEN` (Configurações >
Usuários > Usuários do sistema). Token de usuário comum expira em 60 dias e
derruba o atendimento sem aviso.

## 8. Conferir

```
npm run meta:verificar -- --env=.env.production
```

Verifica as variáveis obrigatórias, se o app responde na Graph API, quais
webhooks estão assinados, se o número do WhatsApp está de pé, e imprime a URL de
login para testar o consentimento no navegador.

Depois disso: app.avilaops.com > Hub Social > Meta > selecionar o cliente >
**Conectar Meta**. O painel deve sair de "Nunca sincronizado" e os contadores de
Business Managers / Páginas / Instagram / Contas de anúncio devem deixar de ser 0.

---

# App recriado — estado em 17/09/2026

App **Avila Ops Tecnologia**, ID `1795781868119400`, categoria Business,
ainda **Não publicado** (modo desenvolvimento). Validado contra a Graph API:
responde, e o token de usuário enxerga 6 portfólios e 5 Páginas.

IDs apurados pela Graph API (não pelo painel):

| O quê | ID |
|---|---|
| App | `1795781868119400` |
| App do Threads | `1825239765510247` |
| Pixel | `1539758051169682` |
| Portfólio Avila Ops Tecnologia | `1340735580892153` |
| Ativo de negócio | `1279500135254209` |
| Catálogo "Avila Ops Store - WhatsApp" | `28685963341021342` (3 produtos) |
| WABA "Auto Atendimento Avila Ops" | `3651926981639261` — **sem número** |
| WABA de teste | `994385463428488`, número `1237541389436609` |

## Dois ajustes obrigatórios no painel

**1. Desligar "Aplicativo nativo ou para computador"** (Configurações >
Avançado). O Hub Social é servidor, não app nativo. Com esse modo ligado a Meta
recusa o app access token, e é por isso que `npm run meta:verificar` acusa
`code 104` ao listar webhooks. Enquanto estiver ligado não dá para assinar
webhook nem usar o Explorador com token de app.

**2. Decidir "A Chave Secreta do Aplicativo está incorporada no cliente?"**
Com isso ligado, toda chamada de servidor passa a exigir `appsecret_proof` —
foi o que derrubou o `/me` no primeiro teste
(`API calls from the server require an appsecret_proof argument`).

O código já foi ajustado: `graphGet()` em `src/lib/meta.ts` manda
`appsecret_proof` sempre, o que é mais seguro e funciona nos dois modos. Então
essa opção pode ficar como está — o registro fica aqui porque quem for depurar
uma chamada crua no Explorador vai esbarrar nela.

## Versão da API

O app está em **v26.0**; o `.env` estava em `v25.0`. Alinhado para `v26.0`.

## Pendência real: qual número do WhatsApp

A WABA "Auto Atendimento Avila Ops" (`3651926981639261`) **não tem número
registrado**. O número comercial **+55 17 99781-1471** (id `1271785459340597`,
qualidade GREEN) está na WABA `1701487744395869`, chamada "Nícolas Ávila".

Por isso `WHATSAPP_PHONE_NUMBER_ID` ficou em branco de propósito: escolher
sozinho arrisca mandar mensagem de cliente pelo número errado.

O número que o inventário antigo apontava como o da empresa
(`+5517991053597`, phone id `1370137702838905`, WABA `1055665857141232`) **não
existe mais** na conta — sumiu junto com a leva de apps excluída.

E há um problema em produção agora: `wa.avilaops.com/.env` está com
`WHATSAPP_PHONE_NUMBER_ID=1165155426689680`, que é exatamente o valor que o
próprio inventário rotulou como `WHATSAPP_PHONE_ID_PESSOAL_NAO_USAR`.

## Token

`WHATSAPP_API_TOKEN` e `META_TOKEN` estão com um token de **usuário**, válido
até **17/11/2026** (acesso a dados até 17/12/2026), com 36 escopos.

Token de usuário expira. Antes de 17/11 troque por **usuário do sistema**
(Configurações do portfólio > Usuários > Usuários do sistema), que não expira.

## Prazo

A Verificação do acesso precisa ser concluída até **16/11/2026** para o app não
sofrer restrição.

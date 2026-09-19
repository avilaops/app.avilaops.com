# Instagram com login próprio

Caminho de conexão para o cliente que tem Instagram e **não tem Página no
Facebook**. Pelo caminho da Meta (`src/lib/meta.ts`) a conta do Instagram só
aparece se estiver vinculada a uma Página — quem não tem Página simplesmente
não conseguia entrar na plataforma.

É outro app dentro do mesmo painel da Meta: credenciais próprias
(`INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`, que **não** são o App ID do
Facebook), outro host (`graph.instagram.com`) e outro consentimento.

## O que compartilha com a Meta, de propósito

| Compartilhado | Onde |
| --- | --- |
| Tabela de conexão | `OrganizationIntegrationConnection`, com `provider = instagram_login` |
| Cifra do token | `src/lib/token-de-conexao.ts` (`META_TOKEN_ENCRYPTION_KEY`) |
| Tabela de contas | `InstagramAccount`, com `origem = instagram_login` |
| Tela | aba Conexão em `/hub-social/meta` |

Duas cópias da cifra dariam certo até a primeira divergir, com o token gravado
por um lado deixando de abrir do outro meses depois — por isso módulo único.

## Escopos

Os nomes **não** são os mesmos do caminho pelo Facebook. Lá é `instagram_basic`;
aqui é `instagram_business_basic`. Trocar um pelo outro devolve erro de escopo
inválido, e a semelhança faz esse erro custar caro a quem depura.

Padrão (sobrescrevível pela chave `INSTAGRAM_OAUTH_SCOPES` no cofre):
`instagram_business_basic`, `instagram_business_manage_messages`,
`instagram_business_manage_comments`, `instagram_business_content_publish`.

## Renovação do token — a rotina diária

O token vale **60 dias** e a Meta **não renova token vencido**: passou da data,
o cliente precisa autorizar tudo de novo. Sem rotina, toda conexão que der certo
hoje quebra sozinha em dois meses.

`POST /api/integrations/instagram/renovar` percorre as conexões e:

| Situação | O que faz |
| --- | --- |
| Faltam ≤ 10 dias | renova; o token novo vale 60 dias a partir de agora |
| Vencido | marca a conexão como `EXPIRED` e escreve na tela que o cliente precisa reconectar |
| Sem validade gravada | tenta renovar, para a conexão passar a ter uma data |
| Validade confortável | não mexe |

Dez dias de janela, e não um ou dois, porque a rotina roda diariamente: é a
folga que permite falhar nove vezes seguidas sem ninguém perder a conexão.

Cada renovação, vencimento e falha grava evento de auditoria
(`INSTAGRAM_TOKEN_RENEWED`, `INSTAGRAM_TOKEN_EXPIRED`,
`INSTAGRAM_TOKEN_RENEWAL_FAILED`). A falha de um cliente não interrompe a
rodada dos outros.

### Como agendar

Uma chamada por dia, com a credencial "Ávila OS Service Key" que o n8n já usa:

```bash
curl -X POST https://app.avilaops.com/api/integrations/instagram/renovar \
  -H "x-service-key: $SERVICE_JWT_SECRET" \
  -H "content-type: application/json" -d '{}'
```

Corpo vazio roda em todos os clientes; `{"organizationId":"..."}` roda em um só.
Admin logado também pode chamar — é o botão "Renovar token agora" da tela, que
executa exatamente a mesma rotina.

Rodar mais de uma vez no dia não faz mal: quem está em dia é pulado, e o retorno
diz o desfecho de cada conexão.

## O que falta fora do código

1. Adicionar o produto "API do Instagram com login do Instagram" no painel da
   Meta — ele gera App ID e Secret próprios.
2. Cadastrar o redirect
   `https://app.avilaops.com/api/integrations/instagram/oauth/callback`.
3. Preencher `INSTAGRAM_APP_ID` e `INSTAGRAM_APP_SECRET` no cofre
   (`/operacao/credenciais`), hoje pendentes.
4. Agendar a chamada diária acima.
5. App Review próprio para os escopos do Instagram, separado do da Meta.

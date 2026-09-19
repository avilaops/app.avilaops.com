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

## Chaves que o caminho do Instagram lê

Nenhum valor aqui; só os nomes. Segredo vive no cofre ou na variável de
ambiente do servidor, nunca no Git, no `.env.example` ou nesta página.

| Chave | Onde vive | Obrigatória | Para quê |
| --- | --- | --- | --- |
| `INSTAGRAM_APP_ID` | cofre (`/operacao/credenciais`) | sim | identifica o app no consentimento |
| `INSTAGRAM_APP_SECRET` | cofre | sim | troca o código pelo token e renova |
| `INSTAGRAM_REDIRECT_URI` | cofre | não | sobrescreve o padrão derivado de `APP_URL` |
| `INSTAGRAM_OAUTH_SCOPES` | cofre | não | sobrescreve a lista de escopos padrão |
| `INSTAGRAM_GRAPH_VERSION` | ambiente | não | padrão `v23.0`; versionado à parte do Graph do Facebook |
| `META_TOKEN_ENCRYPTION_KEY` | ambiente | sim | cifra o token do cliente; **trocar torna ilegível o que já está gravado** |
| `APP_URL` | ambiente | sim | monta o redirect quando o cofre não traz um |
| `SERVICE_JWT_SECRET` | ambiente + credencial do n8n | sim para a rotina | autentica a chamada diária de renovação |

`exigirCredencial` derruba a operação com erro nomeado quando a chave não tem
valor — é de propósito: OAuth com credencial vazia falha lá na Meta, com
mensagem que não diz nada para quem está olhando a tela.

## O que a tela mostra, e de onde vem

O bloco "Instagram (login próprio)" na aba Conexão de `/hub-social/meta`:

| Linha | Origem |
| --- | --- |
| Conta conectada | `account_name` da conexão |
| Validade do token | `token_expires_at`, com os dias que faltam |
| Última renovação | `last_synced_at` |
| Status técnico | `last_sync_status` |
| Seguidores e publicações | `instagram_accounts`, **com a hora da leitura ao lado** |

Seguidor e publicação são lidos no consentimento e a cada **Sincronizar
Instagram** (`POST /api/integrations/instagram/sync`, só admin). Não há leitura
contínua — por isso a data aparece colada ao número, e não escondida na folha
de evidência: valor de dois meses atrás com cara de agora é pior do que valor
nenhum.

Leitura que falha não reescreve número: o erro vai para a conexão como
`SYNC_FAILED` e a tela mostra. Cada releitura grava `INSTAGRAM_ACCOUNT_SYNCED`
na auditoria.

Enquanto `INSTAGRAM_APP_ID` e `INSTAGRAM_APP_SECRET` não existirem no cofre, a
tela avisa antes do clique e o botão de conectar fica desligado — em vez de
deixar o operador atravessar o redirecionamento para voltar com um erro.

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

### Onde isso está agendado

No n8n da casa (`n8n.avilaops.com`), workflow **"Ávila OS — Instagram: renovar
tokens (diário)"** (`FfwwEVYxIMRZu4hf`): gatilho às 04:40, chamada HTTP
autenticada e uma conferência do relatório.

Não foi criada instância nova de n8n, nem scheduler paralelo. Ficou em workflow
próprio, e não dentro do "Ávila OS" onde moram as outras rotinas diárias do app,
por um motivo concreto: aquele workflow tem um nó *community* do Mercado Pago
(`@mercadopago/n8n-nodes-preview-mercadopago.mercadoPago`) que a API recusa
validar, então **qualquer** edição programática nele é rejeitada. Mesma
instância, mesma credencial "Ávila OS Service Key", mesmo handler de erro
central (`Handler de Erro Central → Todoist`), mesmo fuso.

Três decisões do workflow que valem registro:

- **Sem `neverError`.** Os outros nós HTTP daquela esteira engolem o erro de
  HTTP para não interromper a rodada. Aqui não: um 5xx precisa pintar a
  execução de vermelho, senão token vencido vira silêncio.
- **Conferência do relatório.** A rota devolve 200 mesmo quando um cliente
  falhou — são clientes independentes, e a falha de um não interrompe os
  outros. O nó `Alguma renovação falhou?` lê `falhas` e `vencidas` e derruba a
  execução, com o nome da conta e o motivo. Nunca com o token: o relatório da
  rota não devolve segredo.
- **Timeout de 90 s na chamada, 180 s na execução.** Nessa ordem de propósito:
  o corte vem da rota, não do n8n, e o erro diz qual conexão estava no meio.

Para chamar à mão, com a mesma credencial:

```bash
curl -X POST https://app.avilaops.com/api/integrations/instagram/renovar \
  -H "x-service-key: $SERVICE_JWT_SECRET" \
  -H "content-type: application/json" -d '{}'
```

Corpo vazio roda em todos os clientes; `{"organizationId":"..."}` roda em um só.
Admin logado também pode chamar — é o botão "Renovar token agora" da tela, que
executa exatamente a mesma rotina.

Uma ressalva para quem trocar o agendador: a porta do **admin** exige mesma
origem, porque sessão de admin é cookie e cookie viaja sozinho. A porta do
**serviço** não exige, porque quem chama de servidor não manda `Origin`. Se o
novo agendador mandar um `Origin` de outro domínio **e** não mandar a chave de
serviço, a resposta será 403 — e é isso mesmo.

Rodar mais de uma vez no dia não faz mal: quem está em dia é pulado, e o retorno
diz o desfecho de cada conexão.

## Conectar um cliente

1. `/hub-social/meta`, escolher o cliente no seletor.
2. **Conectar Instagram** — o botão grava um cookie de estado antes de mandar
   para o consentimento. Abrir a URL da Meta na mão faz o retorno ser recusado
   com "Retorno do Instagram inválido ou expirado", e isso é proposital: sem o
   cookie, qualquer um amarraria uma conta de Instagram a um cliente que não é
   dele.
3. Na volta, o token de uma hora já é convertido no de 60 dias e gravado
   cifrado. A tela passa a mostrar a conta, a validade e a última renovação.

## Reconectar depois de `EXPIRED`

Quando a rotina encontra um token vencido, ela marca a conexão como `EXPIRED`,
escreve o motivo em `last_sync_error` e grava `INSTAGRAM_TOKEN_EXPIRED` na
auditoria. A tela mostra a badge de expirado e o botão vira **Reconectar
Instagram**.

Não há atalho: a Meta não renova token vencido, e "Renovar token agora" vai
recusar com essa mesma mensagem. O cliente precisa passar pelo consentimento de
novo, pelo mesmo caminho de conectar. A linha da conexão é reaproveitada
(`organizationId + provider` é único), então histórico e auditoria continuam.

## Estado de cada parte

| Parte | Estado |
| --- | --- |
| Código do login próprio, renovação, releitura do perfil, auditoria e painel | implementado |
| Workflow diário no n8n | criado e configurado (`FfwwEVYxIMRZu4hf`) |
| Produto "API do Instagram com login do Instagram" no painel da Meta | **pendente** — exige acesso manual à conta Meta |
| `INSTAGRAM_APP_ID` e `INSTAGRAM_APP_SECRET` no cofre | **pendente** — só existem depois do produto acima |
| Redirect cadastrado na Meta | **pendente** — junto com o produto |
| App Review dos escopos do Instagram | **pendente** — separado do App Review da Meta |
| Primeira conexão de cliente | **pendente** — depende das credenciais |

Enquanto as duas credenciais não existirem, `exigirCredencial` recusa o OAuth
com erro nomeado na tela, e a rotina diária roda sem nada para renovar — que é
o comportamento correto, não uma falha.

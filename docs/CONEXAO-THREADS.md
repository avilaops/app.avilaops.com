# Conexão do Threads por empresa

Evolução em 01/11/2026: conexão, publicação pela fila editorial e métricas por empresa. Conta real e aprovação da Meta são verificações separadas dos testes automatizados.

O painel `/hub-social/meta` oferece **Entrar com Threads**, mantendo a empresa selecionada. Usa autorização própria do Threads e exibe somente a conta ativa com validade futura registrada no PostgreSQL. Facebook e Instagram não ativam esse estado.

## Configuração

Cadastrar `THREADS_APP_ID` e `THREADS_APP_SECRET` no cofre da plataforma. São as credenciais do aplicativo do Threads, não as do Facebook. A chave existente `META_TOKEN_ENCRYPTION_KEY` cifra os tokens de cada empresa.

A migration `20261101021000_threads_credenciais` cria as duas entradas pendentes
na interface do cofre, sem valores e sem substituir configurações existentes.

No caso de uso do Threads, cadastrar o retorno exato:

```
https://app.avilaops.com/api/integrations/threads/oauth/callback
```

Solicita `threads_basic`, `threads_content_publish` e `threads_manage_insights`. O callback inspeciona o token com `debug_token` e persiste apenas os escopos efetivamente concedidos. Cada operação verifica novamente empresa, validade, titularidade e permissão.

## Persistência e autorização

- Usa as tabelas existentes `organization_integration_connections`, `core.external_accounts`, `core.connections` e auditoria. A migration `20261101020000_threads_publicacoes` amplia a restrição de canal dos destinos editoriais e deve preceder o cadastro de destinos Threads.
- O cookie OAuth expira em dez minutos, é HttpOnly e vincula usuário, empresa e nonce. O callback consome o cookie uma vez.
- Empresa arquivada é recusada no início e no retorno. Conta já vinculada a outra empresa é recusada sob trava transacional para evitar disputa entre callbacks.
- Token guardado cifrado; erros do provedor não são expostos na interface. Credenciais não são enviadas ao navegador.
- Tokens expirados exigem reconexão. Renovação automática ainda não está implementada.

## Limites desta entrega

O compositor existente aceita texto, link, imagem e vídeo. O destino Threads exige `META_EMPRESA` e o ID da conta autorizada para a empresa do perfil. A aprovação editorial continua obrigatória. Containers em processamento são retomados por checkpoint; resultado incerto após envio exige reconciliação, sem republicação automática. O ID publicado é salvo antes de buscar o permalink.

A ativação depende das credenciais, da URL de retorno cadastrada e da autorização real da conta. Testes automatizados não publicam conteúdo na Meta. A consulta de resultados preserva período, pontos e totais do provedor, sem somar indicadores incompatíveis ou inventar zeros.

## CRM e Conta

O CRM consulta `GET /api/internal/threads` no Hub. Provisionar o mesmo segredo aleatório de pelo menos 32 caracteres em `CRM_THREADS_API_TOKEN` nos dois backends. No Hub, configurar `CRM_THREADS_TENANT_MAP` como JSON que relaciona UUID do tenant CRM ao ID da organização do Hub. Conferir o vínculo empresarial antes de cadastrar cada par; não inferir por e-mail ou nome parecido. Sem segredo ou par autorizado, o acesso é recusado. Nunca usar variável `VITE_*` para esse segredo.

O CRM obtém o tenant da sessão; o Hub exige mapeamento explícito. Nenhum token Threads é devolvido. O portal Conta consulta somente metadados da conexão da empresa vinculada ao cadastro ativo. O estado exibido reflete a autorização registrada; operações conferem acesso junto à Meta novamente.

## Permissão empresarial

`threads_business_basic` tem finalidade distinta: obter o `threads_user_id` associado para criação de anúncios. Não fundamenta a integração orgânica nem deve ser justificado à Meta com uma tela de perfil. Esta entrega não cria campanhas, envia mensagens privadas ou importa seguidores como leads. Anúncios precisam de fluxo próprio e evidência antes da solicitação.

Referências conferidas em 01/11/2026: [permissões](https://developers.facebook.com/docs/permissions/), [publicações](https://developers.facebook.com/documentation/threads/posts), [estados de containers](https://developers.facebook.com/documentation/threads/troubleshooting), [insights](https://developers.facebook.com/documentation/threads/insights) e [inspeção de tokens](https://developers.facebook.com/documentation/threads/troubleshooting/debug-access-token).

Referência: [coleção oficial da Meta — Threads API](https://www.postman.com/meta/threads/documentation/dht3nzz/threads-api).

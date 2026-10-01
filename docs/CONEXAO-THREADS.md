# Conexão do Threads por empresa

Implementação em 19/09/2026. Código preparado; ainda não validado com conta real nem publicado em produção.

O painel `/hub-social/meta` oferece **Entrar com Threads**, mantendo a empresa selecionada. Usa autorização própria do Threads e exibe somente a conta ativa com validade futura registrada no PostgreSQL. Facebook e Instagram não ativam esse estado.

## Configuração

Cadastrar `THREADS_APP_ID` e `THREADS_APP_SECRET` no cofre da plataforma. São as credenciais do aplicativo do Threads, não as do Facebook. A chave existente `META_TOKEN_ENCRYPTION_KEY` cifra os tokens de cada empresa.

No caso de uso do Threads, cadastrar o retorno exato:

```
https://app.avilaops.com/api/integrations/threads/oauth/callback
```

Solicita `threads_basic` e `threads_content_publish`. A consulta do perfil confirma acesso básico; somente esse acesso é registrado como comprovado. Os escopos solicitados ficam separados nos metadados. A presença do botão ou do token não comprova permissão de publicação.

## Persistência e autorização

- Usa as tabelas existentes `organization_integration_connections`, `core.external_accounts`, `core.connections` e auditoria. Não requer nova migration do Threads.
- O cookie OAuth expira em dez minutos, é HttpOnly e vincula usuário, empresa e nonce. O callback consome o cookie uma vez.
- Empresa arquivada é recusada no início e no retorno. Conta já vinculada a outra empresa é recusada sob trava transacional para evitar disputa entre callbacks.
- Token guardado cifrado; erros do provedor não são expostos na interface. Credenciais não são enviadas ao navegador.
- Tokens expirados exigem reconexão. Renovação automática ainda não está implementada.

## Limites desta entrega

Esta entrega implementa a conexão. O compositor e o envio de publicações de texto, imagem e vídeo no Threads ainda precisam ser implementados e validados. Nenhuma publicação real foi feita.

A ativação depende das credenciais, da URL de retorno cadastrada e da autorização real da conta. O CI do PR #54 está bloqueado pelo faturamento do GitHub; a nova versão não foi implantada. A validação completa com banco descartável também permanece pendente após rejeição da revisão automática da tentativa de iniciar esse banco na sessão anterior.

Referência: [coleção oficial da Meta — Threads API](https://www.postman.com/meta/threads/documentation/dht3nzz/threads-api).

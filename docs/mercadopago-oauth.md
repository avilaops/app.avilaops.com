# Conectar o Mercado Pago por OAuth

Feito em 08/10/2026. Fica em Empresa › Credenciais › Mercado Pago, acima dos
campos. Código em `src/lib/mercadopago-oauth.ts` e nas rotas
`/api/empresa/mercadopago/oauth/{start,callback}`.

## O que resolve e o que não resolve

Resolve: o `MP_ACCESS_TOKEN` deixa de ser colado. O dono autoriza na tela do
Mercado Pago, que mostra qual conta está logada, e o token (180 dias) passa a
ser renovado sozinho pelo `refresh_token`.

Não resolve: a **assinatura secreta do webhook** (`MP_WEBHOOK_SECRET`). Ela é da
aplicação, gerada no painel de desenvolvedor, e não vem em resposta nenhuma do
OAuth. Sem ela o webhook continua respondendo 503. Os eventos marcados na
aplicação (o de chargebacks, por exemplo) também só se conferem no painel.

## O que precisa existir antes, no painel do Mercado Pago

1. Uma aplicação de produção da conta do CNPJ.
2. O endereço de retorno cadastrado nela, em URLs de redirecionamento, letra
   por letra: `https://app.avilaops.com/api/empresa/mercadopago/oauth/callback`
   (a tela mostra o endereço para copiar). Este endereço não muda sem combinar.
3. `MP_CLIENT_ID` e `MP_CLIENT_SECRET` guardados nos campos da própria ficha.

Sem PKCE: a troca do código acontece no servidor, com o `client_secret`. Se a
aplicação estiver com PKCE ligado, o Mercado Pago recusa a troca e o motivo
aparece na tela.

## Como funciona

- **Começo** (`POST …/oauth/start`): só o dono, com origem estrita e senha
  confirmada há menos de 5 minutos — conectar troca a conta que recebe. Devolve
  o endereço de autorização e prende um `state` assinado (10 minutos, com o id
  de quem começou) num cookie.
- **Volta** (`GET …/oauth/callback`): confere `state` contra o cookie e contra o
  dono logado, troca o código, **recusa token de teste** e guarda no cofre.
  Grava `MERCADO_PAGO_CONECTADO_POR_OAUTH` na auditoria, com o `user_id` da
  conta e sem token; aparece em Empresa › Histórico.
- **Cofre**: `MP_ACCESS_TOKEN` (a mesma chave que o resto do código já lê),
  `MP_REFRESH_TOKEN`, `MP_PUBLIC_KEY` quando vem, e três chaves de controle que
  não são segredo: `MP_OAUTH_USER_ID`, `MP_OAUTH_EXPIRA_EM` e `MP_OAUTH_DIGITAL`.
- **Renovação**: antes de cada chamada à API, se faltarem menos de 30 dias para
  o vencimento. Uma por vez no processo. Falha não derruba a cobrança: sai no
  log como `[mercadopago-oauth] RENOVAÇÃO FALHOU` e a próxima tentativa fica
  para dali a uma hora; o token segue valendo até vencer.

## A digital do token

`MP_OAUTH_DIGITAL` é o SHA-256 do token que o OAuth guardou. A renovação só
acontece enquanto o `MP_ACCESS_TOKEN` em uso tiver essa digital.

Existe por um caso que custaria dinheiro: conectar por OAuth e, meses depois,
colar à mão o token de outra conta. Sem a digital, a renovação trocaria o token
colado pelo renovado da conta antiga, e o dinheiro voltaria a entrar nela sem
ninguém pedir. Com ela, a tela diz "token trocado à mão" e nada é renovado até
alguém conectar de novo.

## O que não foi conferido

A conversa com o Mercado Pago de verdade. Os testes cobrem a biblioteca e as
rotas com a API simulada, e a tela foi conferida no navegador (desktop e
iPhone) sem conexão. A primeira conexão real depende do Client Secret e do
endereço de retorno cadastrado, e é ela que prova o formato da resposta de
`/oauth/token` e o endereço de autorização.

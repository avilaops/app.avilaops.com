# Plano do módulo de bancos de dados

## Escopo

Implantar no `app.avilaops.com` um módulo interno para consulta, diagnóstico e,
em fases posteriores, administração controlada de bancos autorizados.

O backend operacional será o workflow único do n8n:

`Ávila OS - Processo Completo`

O app será responsável pela interface, sessão, autorização da pessoa logada,
validação de entrada, apresentação dos resultados e confirmação visual das
operações. O n8n será responsável pela execução das consultas, rotinas
agendadas, backups, alertas e integrações com os bancos.

## Local no app

Nova entrada em:

`Infraestrutura → Bancos de dados`

Rota principal sugerida:

`/operacao/bancos`

Rotas de detalhe podem usar o identificador interno da conexão, por exemplo:

`/operacao/bancos/[connectionId]`

O identificador não deverá conter senha, token ou string de conexão.

## Experiência do módulo

### Lista de conexões

Cada conexão exibirá:

- nome amigável;
- servidor e banco;
- ambiente: desenvolvimento, homologação ou produção;
- tipo de banco;
- disponibilidade;
- latência da última consulta;
- última atualização;
- alertas pendentes.

### Visão geral

- versão do banco;
- servidor e ambiente;
- tamanho total e por schema;
- quantidade de tabelas;
- conexões atuais;
- disponibilidade;
- última verificação.

### Estrutura

- schemas;
- tabelas;
- colunas e tipos;
- índices;
- chaves primárias;
- relacionamentos;
- constraints;
- tamanho das tabelas.

### Dados

Consulta paginada e controlada, com busca, filtros e ordenação. A primeira
versão não oferecerá SQL livre no navegador. Cada recurso consultável terá uma
consulta parametrizada e um limite máximo de linhas.

### Acessos

O painel terá duas áreas distintas:

1. **Usuários técnicos do banco**: logins, tipo, memberships e permissões.
2. **Usuários do sistema**: contas de `portal_clients`, papel, organização,
   status e último login.

Uma conta do sistema não será convertida automaticamente em usuário técnico do
banco.

### Atividade

- consultas em execução;
- conexões abertas;
- sessões ociosas;
- bloqueios;
- consultas lentas;
- transações abertas;
- consumo por usuário, quando disponível.

### Backups

- último backup;
- duração e tamanho;
- destino;
- histórico;
- sucesso ou falha;
- teste de restauração;
- último restore validado.

### Migrações

- migration atual;
- migrations aplicadas;
- migrations pendentes;
- checksum;
- data de aplicação;
- ambiente;
- divergências entre ambientes.

## Modelo operacional no n8n

O workflow único terá um roteamento interno por operação. A entrada externa
deve continuar sendo autenticada e cada operação terá validação própria.

Operações previstas:

- `database.overview`;
- `database.structure`;
- `database.data.read`;
- `database.users`;
- `database.activity`;
- `database.backups.status`;
- `database.backups.run`;
- `database.backups.restore-test`;
- `database.migrations`;
- `database.alerts.check`.

O workflow deverá:

1. validar o token de serviço;
2. validar `requestId`, `connectionId`, operação e ambiente;
3. selecionar a credencial permitida;
4. executar apenas consulta ou comando previamente aprovado;
5. remover campos sensíveis da resposta;
6. registrar a execução e o resultado;
7. responder ao app com formato uniforme;
8. encaminhar falhas ao Handler de Erro Central.

O app não enviará senhas, tokens ou strings de conexão no payload. As
credenciais permanecerão no cofre do n8n.

## Contrato de chamada

Exemplo de requisição do app para o workflow:

```json
{
  "requestId": "uuid",
  "operation": "database.structure",
  "connectionId": "app-production",
  "environment": "production",
  "parameters": {
    "schema": "public",
    "table": "organizations"
  },
  "actor": {
    "userId": "uuid",
    "role": "OWNER"
  }
}
```

Exemplo de resposta:

```json
{
  "ok": true,
  "requestId": "uuid",
  "operation": "database.structure",
  "connectionId": "app-production",
  "generatedAt": "2026-09-14T12:00:00.000Z",
  "data": {},
  "warnings": []
}
```

Operações demoradas poderão responder com estado `accepted` e um identificador
de execução para consulta posterior. O app deverá informar que a operação está
em andamento, sem repetir automaticamente uma ação que possa duplicar backup
ou restore.

## Segurança e permissões

### Usuários técnicos

A primeira conexão será criada com usuário somente leitura. Para PostgreSQL,
esse usuário deverá ter acesso apenas aos catálogos e tabelas autorizados.

Não será permitido ao usuário de diagnóstico:

- alterar dados;
- criar ou remover usuários;
- alterar permissões;
- executar DDL;
- apagar backups;
- restaurar produção.

### Usuários do app

- `OWNER`: acesso completo ao diagnóstico e às operações administrativas,
  mediante confirmação;
- `SOCIO`: consulta e diagnóstico, sem alterações em produção;
- `ADMIN`: sem acesso à infraestrutura da plataforma;
- `CLIENT`: sem acesso.

Cada rota deverá verificar o papel no servidor. Ocultar o item no menu não será
considerado proteção suficiente.

### Operações sensíveis

Alteração de permissões, encerramento de sessões, execução de manutenção e
restore exigirão:

- ambiente claramente identificado;
- resumo do impacto;
- confirmação explícita;
- auditoria com usuário, horário, conexão e operação;
- bloqueio de ações duplicadas por `requestId`.

Senhas, tokens, hashes, certificados e valores equivalentes nunca serão
exibidos na tela nem gravados em logs de execução.

## Fases de implantação

### Fase 1 - leitura e diagnóstico

- criar a entrada de navegação;
- criar `/operacao/bancos`;
- cadastrar a primeira conexão PostgreSQL;
- implementar visão geral;
- implementar estrutura;
- implementar leitura paginada de dados;
- implementar usuários técnicos e usuários do sistema;
- validar OWNER e SOCIO;
- ocultar dados sensíveis.

### Fase 2 - atividade e alertas

- consultas lentas;
- bloqueios;
- sessões e conexões;
- verificações agendadas;
- alertas de indisponibilidade;
- histórico curto de saúde;
- estados claros para falha do banco ou do n8n.

### Fase 3 - backups e migrações

- histórico de backups;
- execução de backup;
- verificação de integridade;
- teste de restauração isolado;
- migrations aplicadas e pendentes;
- comparação entre ambientes.

### Fase 4 - administração controlada

- revogar conexão;
- encerrar sessão;
- alterar permissões;
- manutenção autorizada;
- restore;
- confirmação reforçada;
- auditoria completa.

## Critérios de aceite

O módulo só será considerado pronto quando houver evidência de:

- leitura real do banco autorizado;
- isolamento entre conexões;
- paginação e filtros corretos;
- rejeição de SQL ou parâmetros não permitidos;
- ocultação de campos sensíveis;
- respostas corretas para n8n indisponível e banco indisponível;
- bloqueio de acesso por papel;
- idempotência para operações repetidas;
- execução agendada de alerta;
- backup e teste de restauração em ambiente isolado;
- auditoria verificável;
- validação autenticada no app publicado.

## Decisões preservadas

- haverá somente um workflow do Ávila OS;
- o workflow utilizado será `Ávila OS - Processo Completo`;
- o app continuará sendo a interface autenticada;
- credenciais técnicas ficarão no n8n;
- a primeira entrega será somente leitura;
- PostgreSQL será o primeiro banco suportado;
- o n8n será o motor de execução e orquestração, não um terminal SQL exposto
  ao usuário.

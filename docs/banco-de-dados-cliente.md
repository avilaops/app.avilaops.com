# Banco de dados do cliente

Seção **Banco de dados** da ficha (`/clientes/[id]?section=database`): o catálogo
do banco que o cliente opera — ERP, PDV, sistema legado — com todas as tabelas e
colunas, relacionamentos, contagens e as anotações da equipe sobre o que cada
dado significa.

O primeiro caso é o ProCommerce da Vedashow (SQL Server 2008 R2, 258 tabelas,
3.597 colunas, nenhuma documentação).

## O Ávila OS não conecta no banco

O servidor de produção não está na rede do cliente (a Vedashow só é alcançável
pela Radmin VPN, que não tem cliente Linux). Por isso a estrutura **chega
pronta**: um script roda numa máquina com acesso, lê o `INFORMATION_SCHEMA` e
envia o catálogo. Para a Vedashow é o `etl/sincronizar_catalogo.py` do repositório
`avilaops/Procommerce`.

Consequência: a tela mostra o retrato da última sincronização, com a idade dele
à vista. Não há consulta ao vivo. Se um dia fizer falta, o caminho é um túnel do
servidor até o cliente e um login somente leitura — decisão à parte, porque
expõe o ERP de produção de um cliente a uma aplicação web.

## Contrato

`POST /api/organizations/:id/bancos/sync` — `:id` é o id **ou o slug** do cliente.
Autenticação: `x-service-key` (ou JWT de serviço), como as demais chamadas de
máquina; sessão de admin também vale.

```jsonc
{
  "key": "procommerce",            // estável; casa esta sincronização com a anterior
  "name": "ProCommerce",
  "engine": "SQLSERVER",           // SQLSERVER | POSTGRES | MYSQL | FIREBIRD | ORACLE | OUTRO
  "engineVersion": "Microsoft SQL Server 2008 R2 (SP2)",
  "host": "26.46.242.185", "port": 1433,
  "databaseName": "Procommerce",
  "environment": "PRODUCTION",     // ou TEST: a tela avisa que contagem não vale
  "accessNotes": "Radmin VPN…",    // como se chega nele. Nunca senha.
  "syncedFrom": "hp",
  "tables": [{
    "schema": "dbo", "name": "PRODUTO", "rowCount": 5591,
    "columns": [{
      "name": "GRUPO_COD", "ordinal": 4, "dataType": "int", "nullable": true,
      "primaryKey": false, "referencesTable": "GRUPO", "referencesColumn": "GRUPO_COD",
      "filledCount": 5591, "distinctCount": 38, "minValue": "1", "maxValue": "41"  // opcionais
    }]
  }]
}
```

Reenviar é seguro e é o uso esperado:

- tabela e coluna casam por nome; os ids não mudam, então link e anotação seguem de pé;
- `description` (a anotação) nunca é tocada pela sincronização;
- o que sumiu da origem é apagado, **exceto o que tem anotação** — fica, marcado
  como "Ausente na origem", para uma coluna renomeada numa atualização do ERP não
  levar embora em silêncio o que alguém escreveu sobre ela.

## Estatísticas e dado pessoal

`filledCount`, `distinctCount`, `minValue` e `maxValue` são opcionais. Mínimo e
máximo só devem vir de coluna **numérica ou de data**: de texto eles trariam nome
e documento de cliente final para dentro do nosso banco. O catálogo guarda a
forma do dado, não o dado.

## Migração

`20260917200000_catalogo_banco_cliente` — aditiva e idempotente, três tabelas
novas em `operations`. Como as outras, é aplicada à mão em produção; nada além
da seção nova lê essas tabelas.

## Limitação conhecida

Entre 821px e ~1400px de largura a tabela de colunas, com estatísticas, não cabe
inteira e rola dentro do próprio contêiner. A página não estoura; abaixo de 821px
as linhas viram cartões.

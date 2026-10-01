# Cadastro de clientes e bloco fiscal no nível de um ERP

Data: 01/10/2026.

Esta entrega é a primeira frente da profissionalização do banco: o **cadastro
de clientes** e o **bloco tributário**. A referência de comparação é o cadastro
de clientes do Protheus (rotina CRMA980) — não para copiar seus campos, mas
para adotar os mecanismos que fazem dele um cadastro de ERP e não um formulário
com caixas de texto.

Escopo desta entrega: banco de dados. Interface, crédito e os outros módulos
estão no [roteiro](#roteiro-das-pr%C3%B3ximas-frentes) no fim do documento.

## O problema

O cadastro guardava informação e não garantia nada.

| Situação antes | Consequência |
|---|---|
| `status`, tipo de endereço, tipo de contato e origem eram texto livre | Qualquer palavra entrava. `STATUS_CLIENTE` existia só em TypeScript (`src/lib/clientes-busca.ts`); o banco aceitava o que viesse |
| Unicidade do documento por texto | `33.000.167/0001-01` e `33000167000101` conviviam como dois clientes diferentes |
| Nenhuma validação de dígito verificador no banco | CNPJ digitado errado entrava por importação, n8n ou SQL manual |
| CNPJ validado só com dígitos | Cliente aberto depois de julho de 2026, com CNPJ alfanumérico, não entrava no cadastro |
| Inscrição estadual e municipal em `organization_profiles` | Dado fiscal ao lado de "melhor horário para contato", sem tipo de pessoa, regime nem indicador de IE |
| Endereço sem código IBGE do município | **Não se emitia NFS-e a partir deste cadastro.** A prefeitura identifica a cidade pelo código, não pelo nome |
| `is_primary` sem restrição | Três endereços "principais" do mesmo tipo eram possíveis; a tela pegava o primeiro que viesse, e isso mudava entre consultas |
| Cadastro sem auditoria | Conciliação e exportação geravam evento; o cadastro, que é a origem de tudo, não |

## O que mudou

Migração `20261001200000_cadastro_e_fiscal_do_cliente`. Aditiva no que é dado:
nenhuma coluna removida, nenhum valor apagado. O que ela acrescenta é recusa.

### Validação do documento dentro do banco

`operations.cpf_valido`, `operations.cnpj_valido` e
`operations.documento_valido` implementam o módulo 11 em SQL imutável. A mesma
regra continua em `src/lib/cpf-cnpj.ts`.

Não é duplicação por descuido: a regra vale na API **e** no banco porque
importação, n8n e correção manual por SQL não passam pela API. As duas
implementações têm os mesmos casos de teste, em
`tests/unit/documento-cpf-cnpj.test.ts` e
`tests/integration/cadastro-fiscal.test.ts` — se divergirem, uma das suítes
reprova.

**CNPJ alfanumérico** (IN RFB 2.229/2024, em vigor desde julho de 2026): as
doze primeiras posições podem ter letras e os dois dígitos verificadores
continuam numéricos. O cálculo é o mesmo módulo 11 com o valor de cada
caractere lido como ASCII menos 48 — `'0'` vale 0 e `'A'` vale 17. O exemplo da
própria Receita, `12ABC34501DE35`, está nos testes.

Aceitar isso no validador não bastava: três caminhos aplicavam `onlyDigits`
antes de classificar, e tirar as letras transformava um CNPJ válido em doze
caracteres que não classificam como nada — a tela devolvia "CPF ou CNPJ
inválido" para um documento correto. Passaram a usar `normalizarDocumento`:
a edição do cliente (`PUT /api/organizations/[id]`), a consulta de CNPJ
(`/api/cnpj-lookup`) e a máscara do campo em `OrganizationForm`, que agora é
posicional em vez de regex de dígito — `\d` descartava justamente o que precisa
aparecer enquanto a pessoa digita.

O CNPJ da própria casa (`src/lib/dados-da-casa.ts`) continua só numérico de
propósito: é um CNPJ existente, e CNPJ já emitido não vira alfanumérico.

### Domínios fechados

O vocabulário é o que a aplicação já usa. Fechar o domínio é o ganho; traduzir
os valores para português seria renomear o que circula em filtro, URL e PR
aberto de outras sessões, sem nada em troca.

| Coluna | Domínio |
|---|---|
| `organizations.status` | `ACTIVE`, `ONBOARDING`, `PAUSED`, `ARCHIVED` |
| `organization_addresses.type` | `MAIN`, `BILLING`, `DELIVERY`, `FISCAL` |
| `organization_addresses.source` | `MANUAL`, `FICHA_PDF`, `RECEITA_FEDERAL`, `SEFAZ`, `CEP`, `IMPORTACAO` |
| `organization_contacts.type` | `OWNER`, `BILLING`, `FINANCE`, `TECH`, `MARKETING`, `FISCAL`, `OTHER` |

Valor fora da lista encontrado na aplicação da migração é **registrado em
`operations.audit_events`** com o valor anterior antes de ser normalizado:
ninguém perde o que estava escrito.

### Um principal por papel

Índices únicos parciais: um endereço `is_primary` por `(cliente, tipo)` e um
contato `is_primary` por cliente. Endereço secundário do mesmo tipo continua
permitido — o cadastro guarda histórico.

Faturar num endereço e entregar em outro, que é o que o Protheus resolve com
`A1_ENDCOB`/`A1_ENDENT`, aqui é o tipo do endereço com essa garantia.

### Ficha fiscal do cliente

`operations.dados_fiscais_do_cliente`, 1:1 com a organização. Espelha
`identidade_da_casa`: lá está quem emite, aqui está para quem se emite.

Passa a ser a **fonte canônica** da inscrição estadual, da inscrição municipal
e do CPF do responsável. As colunas equivalentes em `organization_profiles`
continuam existindo por compatibilidade, mas não mandam mais. A migração copia
os valores que já existiam e preenche o CNAE a partir da consulta de CNPJ já
guardada em `organizations.cnpj_data` — dado de órgão, não inferência.

O que **não** mora nela, de propósito, para não existir em dois lugares:

| Informação | Onde mora |
|---|---|
| Razão social | `organizations.legal_name` |
| CPF/CNPJ | `organizations.cpf_cnpj` |
| Situação cadastral e data de abertura | `organizations.cnpj_data`, a resposta da Receita, com origem e data |
| Endereço | `organization_addresses`, tipo `FISCAL` quando difere do principal |

Enums nativos do Postgres: `tipo_pessoa`, `regime_tributario`,
`indicador_inscricao_estadual`. Vocabulário novo, em português, sem legado para
carregar.

### Integridade que um CHECK não alcança

O tipo de pessoa tem de concordar com o documento, e o documento mora em outra
tabela. Dois gatilhos cobrem os dois lados da mesma regra — mudar a ficha
fiscal e mudar o documento do cliente:

- `FISICA` exige documento de 11 caracteres;
- `JURIDICA` exige 14;
- `ESTRANGEIRA` não admite CPF/CNPJ cadastrado, e é a única que admite NIF.

Outras recusas: ISS retido sem alíquota (a prefeitura precisa do percentual
para calcular a retenção), inscrição estadual em quem está marcado como isento,
CNAE fora de sete dígitos, CPF de responsável com dígito errado, código IBGE
fora de sete dígitos, país fora de ISO 3166-1 alpha-2.

### Auditoria

`core.audit_change()` — que já existia e grava antes/depois em
`core.audit_events`, append-only — passa a disparar em
`dados_fiscais_do_cliente`, `organization_addresses` e `organization_contacts`.

Um detalhe que custou uma suíte inteira vermelha e vale registrar: a tabela
nova **não** recebe `ALTER TABLE … OWNER TO app_avila`. Em produção as
migrações rodam como `app_avila` e a tabela já nasce dele, então o ALTER seria
redundante; no CI o papel existe vazio e as outras tabelas pertencem ao
`postgres`. Com donos diferentes, a exclusão em cascata a partir de
`organizations` roda com os direitos do dono da tabela referenciante, e o
gatilho de auditoria tenta escrever em `core.audit_events` como `app_avila` —
que no CI não tem `USAGE` no schema `core`. O erro resultante,
`permission denied for schema core`, não aparece em produção e não diz o que
fazer.

### Fixtures de teste

Três suítes de integração criavam cliente com `${Date.now()}`.slice(0, 14):
catorze dígitos que davam unicidade e não eram CNPJ de verdade. Com a validação
no banco, o Postgres passou a recusá-los — com razão, porque nenhum cliente
real poderia ter um. `tests/fixtures/documento.ts` gera CNPJ único **e** com
dígito verificador calculado.

### Consultas

| View | O que responde |
|---|---|
| `operations.cliente_ficha_fiscal` | O destinatário da nota numa linha: documento, tributação e o endereço de maior precedência fiscal (`FISCAL`, senão `BILLING`, senão `MAIN`) |
| `operations.cadastro_pendencias` | Uma linha por lacuna, com código estável e o que ela impede: `EMITIR_NOTA`, `ENVIAR_NOTA` ou `COBRAR` |
| `operations.cadastro_completude` | Quantas pendências por cliente e se já dá para emitir nota |

As pendências têm código (`MUNICIPIO_IBGE_AUSENTE`, `REGIME_NAO_INFORMADO`,
`CPF_RESPONSAVEL_AUSENTE`, …) para a tela mostrar a lista e o motivo sem
reimplementar a regra em TypeScript. Vale a regra da casa: todo número abre a
evidência.

## Comparação com o cadastro de clientes do Protheus

A referência é a rotina CRMA980. A coluna "aqui" diz o que a Ávila Ops passou a
ter, o que adaptou e o que deliberadamente não tem.

### Identificação

| Protheus | Aqui |
|---|---|
| `A1_COD` + `A1_LOJA` | `organizations.client_number` (6 dígitos, imutável). **Loja não existe**: o equivalente de estabelecimento do cliente é o endereço tipado, e nenhum cliente da casa tem filial com condição comercial própria |
| `A1_NOME` / `A1_NREDUZ` | `organizations.legal_name` / `organizations.name` |
| `A1_PESSOA` | `dados_fiscais_do_cliente.tipo_pessoa`, com o gatilho que exige coerência com o documento |
| `A1_CGC` | `organizations.cpf_cnpj`, com dígito verificador validado no banco e suporte a CNPJ alfanumérico |
| `A1_INSCR` / `A1_INSCRM` | `inscricao_estadual` / `inscricao_municipal`, agora na ficha fiscal |
| `A1_CNAE` | `cnae`, preenchido da consulta de CNPJ |
| `A1_INSCRUR` | `inscricao_produtor_rural` |
| `A1_SUFRAMA` | `suframa` |
| `A1_DTCAD` / `A1_HRCAD` | `created_at` |
| `A1_TIPO` (consumidor final, revendedor, exportação) | `indicador_inscricao_estadual`, que é o que a nota exige. A classificação comercial completa do Protheus não tem consumidor aqui |

### Endereço e comunicação

| Protheus | Aqui |
|---|---|
| `A1_END`, `A1_BAIRRO`, `A1_CEP`, `A1_MUN`, `A1_EST` | `organization_addresses`, com `street`/`number` separados — o Protheus trata endereço e número a partir de `A1_END` em algumas versões |
| `A1_COD_MUN` | `municipio_ibge`, com formato garantido. **Era o que faltava para emitir NFS-e** |
| `A1_PAIS` | `pais_iso`, em ISO 3166-1 alpha-2 |
| `A1_ENDCOB` / `A1_ENDENT` | Tipo `BILLING` / `DELIVERY` do mesmo endereço, com um principal por tipo |
| `A1_TEL`, `A1_EMAIL`, `A1_HPAGE` | `organization_profiles`, `organization_contacts`, `organizations.site_url` |
| `A1_FAX`, `A1_CXPOSTA` | Não existem. Fax e caixa postal não têm uso na operação |

### Tributário

| Protheus | Aqui |
|---|---|
| `A1_CONTRIB` | `indicador_inscricao_estadual` (`indIEDest` da NF-e) |
| `A1_GRPTRIB` | `regime_tributario` e `codigo_servico`. A casa emite NFS-e de serviço, não NF-e de mercadoria: o que importa é o item da LC 116/2003 e o que o cliente retém |
| — (o Protheus trata retenção no pedido/nota) | `iss_retido`, `aliquota_iss_retido`, `retem_irrf`, `retem_inss`, `retem_pis_cofins_csll` no cadastro, porque a retenção é condição do cliente |
| `A1_NIF` | `nif`, só para `tipo_pessoa` `ESTRANGEIRA` |

### Comercial, logística e crédito

| Protheus | Aqui |
|---|---|
| `A1_VEND`, `A1_COND`, `A1_TABELA`, `A1_DESC` | **Ainda não existem por cliente.** Plano, preço, moeda e ciclo vivem em `ServicePlan`, `Subscription` e `core.contracts`; falta o padrão por cliente. Está no roteiro |
| `A1_TRANSP`, `A1_TPFRET` | Não existem e não devem existir: a casa vende serviço, não frete |
| `A1_LC`, `A1_RISCO`, `A1_VENCLC`, `A1_MOEDALC` | **Ainda não existem.** É configuração, e está no roteiro |
| `A1_SALDUP`, `A1_SALPEDL` | Já existem como acumulado, em `core.receivable_totals` e `core.receivables` — e é assim que deve ser |

A separação que o Protheus faz entre **o que se configura** e **o que o sistema
acumula a partir das movimentações** é a lição mais importante dessa
comparação, e o núcleo já a respeita: saldo em aberto é view sobre fatura e
pagamento, nunca coluna que alguém escreve.

### Mecanismos adotados, campos não copiados

O que faz o cadastro do Protheus ser de ERP não é a quantidade de campos:

1. **Domínio fechado por campo** (o dicionário SX3) → CHECKs e enums.
2. **Validação na entrada** → funções no banco, não só na tela.
3. **Papel explícito do endereço** → tipo com um principal por papel.
4. **Separar configurado de acumulado** → ficha fiscal versus views do núcleo.
5. **Trilha de alteração** → gatilhos para `core.audit_events`.
6. **Contrato por campo** (significado, quem escreve, o que fazer quando vazio)
   → `src/lib/cadastro-ia/campos.ts` já é isso para 25 campos; estender para os
   fiscais está no roteiro.

## O que ficou de fora, e por quê

| Item | Motivo |
|---|---|
| CEP normalizado para 8 dígitos | A coluna aceita máscara hoje e o formulário mostra o valor cru. Normalizar sem formatar na tela vira regressão visível. Vai junto com a frente de interface |
| Validação do dígito verificador já gravado | A restrição `organizations_documento_digito_verificador` entrou como `NOT VALID` de propósito: um CNPJ digitado errado em 2025 continua gravado, e derrubar a migração por causa dele deixaria a casa sem deploy. A regra vale para toda escrita nova e `cadastro_pendencias` lista quem precisa de correção. Depois de corrigidos: `ALTER TABLE operations.organizations VALIDATE CONSTRAINT organizations_documento_digito_verificador` |
| Crédito e condições comerciais por cliente | Frente própria, com consumidor definido antes da coluna. Coluna que nenhuma tela lê é peso morto que parece recurso |
| Campos fiscais no formulário e no assistente de cadastro | Esta entrega é banco. A tela e `CAMPOS_CADASTRO` são a frente seguinte |
| Migrar `MAIN`/`OWNER` para português | Renomear vocabulário que circula em filtro e URL, com quatro PRs abertos, custa conflito e não entrega nada |

## Roteiro das próximas frentes

Ordem proposta, com o motivo da sequência. Cada frente é um PR próprio.

1. **Interface do cadastro fiscal.** Expor a ficha fiscal e as pendências na
   tela do cliente, estender `CAMPOS_CADASTRO` com os campos fiscais, e
   normalizar o CEP junto com a máscara de exibição. Sem isso o que esta
   entrega criou só é preenchível por SQL.
2. **Emissão de NFS-e.** Com `identidade_da_casa` (emitente, certificado A1) e
   `cliente_ficha_fiscal` (destinatário), o que falta é o provedor da
   prefeitura. `cadastro_completude.pode_emitir_nota` já diz quem está pronto.
3. **Crédito e condições comerciais por cliente.** Política de crédito
   (limite, moeda, classe de risco, vencimento) como configuração, cruzada com
   `core.receivable_totals` como acumulado — a separação do Protheus. Definir
   antes quem lê: bloqueio de contratação, régua de cobrança, ou os dois.
4. **Lojas: o tributário de mercadoria e o vínculo com o núcleo.**
   `lojas.avilaops.com` é projeto separado, com repositório e banco próprios.
   Levantamento feito em 01/10/2026 sobre `prisma/schema.prisma` daquele
   projeto (1.306 linhas, 49 migrações), e ele está mais adiantado do que a
   comparação sugeriria: já tem enums (`Plano`, `TenantStatus`,
   `PedidoStatus`), `Variante` com `PrecoVariante`, e `SaldoEstoque` separado
   de `ReservaEstoque` e `MovimentoEstoque` — a modelagem de comércio que
   importa já existe.

   Dois buracos concretos, nenhum deles de catálogo:

   - **`Produto` não tem NCM, CEST, origem da mercadoria nem CST/CSOSN.** Com
     isso não se emite NF-e de venda. É o mesmo defeito que esta entrega acabou
     de corrigir no cadastro de clientes, um nível acima: lá faltava o
     destinatário, aqui falta o item. E é o que o Protheus resolve com grupo
     tributário por produto, não por cliente.
   - **`Tenant` não tem vínculo com `Organization`.** Não existe
     `organizationId` em nenhum modelo daquele schema. A loja guarda
     `razaoSocial` e `cnpj` própios, sem validação, e o `cnpj` da loja não
     conversa com o `cpf_cnpj` do cliente no núcleo. Enquanto isso não existe,
     não há como responder "quais lojas são deste cliente" por dado, só por
     semelhança de nome — exatamente o que a arquitetura do núcleo proíbe.

   A comparação com a VTEX (tabela de preço por canal, promoção, fulfillment
   por doca) vem depois desses dois: é otimização de um catálogo que já
   funciona, enquanto NF-e e vínculo são bloqueio.
5. **CRM e força de vendas (o que o Protheus chama SFA).** Já existem `Lead`,
   `MetaLead` e `OrganizationServiceOpportunity`, e a ficha do cliente lê as
   oportunidades. A oportunidade é uma linha por tipo de serviço, com
   `commercial_status` em texto livre: falta fechar esse domínio, e falta dono,
   data prevista, valor e histórico de mudança de estágio para virar funil.
6. **GFE e logística.** Sem aplicação na operação atual. Fica registrado como
   avaliado e descartado, não como pendência.

Cada frente que mexer em banco segue o que esta usou: Docker local para rodar
as 57 migrações desde o zero, teste que prova a recusa de cada regra nova, e
migração aditiva no dado.

## Como validar

```bash
npm run db:test:up
npx prisma migrate deploy
npx prisma generate
npm test                     # inclui tests/integration/cadastro-fiscal.test.ts
npm run db:test:down
```

Para conferir as migrações desde o zero num Postgres próprio, sem disputar o
container da suíte:

```bash
docker run -d --name pg-cadastro-fiscal \
  -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=cadastro_fiscal_test \
  -p 127.0.0.1:55439:5432 postgres:18-alpine

docker exec pg-cadastro-fiscal psql -U postgres -d cadastro_fiscal_test \
  -c "DO \$\$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='app_avila')
      THEN CREATE ROLE app_avila; END IF; END \$\$;"

for d in prisma/migrations/*/; do
  docker exec -i pg-cadastro-fiscal psql -U postgres -d cadastro_fiscal_test \
    -v ON_ERROR_STOP=1 -q < "$d/migration.sql" || break
done
```

O papel `app_avila` precisa existir antes das migrações: duas delas fazem
`ALTER TABLE … OWNER TO app_avila` e falham sem ele, como o `CLAUDE.md` já
registra.

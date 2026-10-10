# O que está pendente

Levantado em 19/09/2026, ao final da rodada que fechou a migração visual do
painel. Cada item diz o que é, como foi constatado e o que decidir. Número de
linha e contagem vêm de medição, não de impressão: onde há número, ele foi
tirado do banco de produção ou de uma varredura do código.

Ordem dentro de cada bloco é a de quanto estrago evita, não a de esforço.

## Atualização de 08/10/2026

Conferido contra o código e os servidores nesta data. O texto abaixo é o
levantamento original de 19/09; o que mudou desde então:

- **2.2 resolvido.** A mensagem "Escolha a logo de origem." sai da tela quando
  a logo é escolhida.
- **1.2 segue aberto.** `src/lib/campos-explicados.ts` continua sem nenhum
  importador. O cadastro foi refeito em 01/10
  (`docs/cadastro-cliente-nivel-erp.md`), então a contagem de 76 campos e a
  lista dos 24 sem leitor precisam ser medidas de novo antes de cortar.
- **3.2:** a frase "não há migration pendente" valeu até 19/09. Em 08/10
  produção recebeu as 11 migrações acumuladas até
  `20261006120000_parametros_de_politica`, aplicadas como `app_avila`, sem o
  erro de dono. O procedimento está no `AGENTS.md`.
- **4.2 superado.** O deploy é `deploy/publicar.sh <ref>`, com build fora do
  `applications`. O roteiro de `docker compose build` no servidor não deve mais
  ser usado: foi ele que derrubou apps de cliente em 28/09.
- **4.3 e 4.4 encerrados.** Os contêineres do n8n antigo, minas-espetinhos,
  sorroche e mello foram removidos do `applications` em 06/10; o Comandeiro foi
  religado em 07/10 e o n8n roda nativo lá desde 08/10.
- **Produção** roda a `main` (imagem `avilaops-app:<sha>` em
  `/opt/app-avilaops/docker-compose.yml`), não mais `7e4765a`.
- **Novo, e parado em produção:** o webhook do Mercado Pago responde 503
  enquanto `MP_WEBHOOK_SECRET` não for gravado em Empresa › Credenciais. A
  baixa automática de fatura depende disso.
- **Novo:** conexão do Mercado Pago por OAuth (`docs/mercadopago-oauth.md`).
  Falta a primeira conexão real: guardar o Client Secret e cadastrar o endereço
  de retorno na aplicação. Não substitui o `MP_WEBHOOK_SECRET`.
- **Novo:** a suíte recusa rodar se o Postgres em `DATABASE_URL` tiver outros
  bancos (`tests/global-setup.ts`). Motivo e data no próprio arquivo.

## Atualização de 10/10/2026

- **Faturamento recorrente pronto e desligado.** A rotina existe, o workflow do
  n8n existe (`S7FwBU1svbXAYbnJ`) e não foi publicado: a primeira rodada cria a
  fatura de outubro da Vedashow com R$ 357, valor ainda por confirmar (350 ou
  357), e a da Minas Espetinhos com R$ 250. Detalhe e passos para ligar em
  `mercadopago-auditoria-e-roadmap.md`, Fase 2.
- **Gateway padrão da cobrança de entregável** passou a `MERCADO_PAGO` no
  schema e no banco.
- **Pix direto na chave tem baixa.** A ficha do cliente ganhou "Registrar
  pagamento" na fatura aberta (data e ID da transação do comprovante); a rota é
  `POST /api/billing/faturas/[id]/baixa`. Antes, fatura paga por Pix direto
  ficava aberta para sempre: o Mercado Pago não avisa Pix recebido por chave.
- **Comissão sobre vendas é só registro.** O percentual mora na assinatura e
  aparece na ficha. Não há cálculo nem fatura de comissão: falta decidir a base
  (com ou sem frete, pedido pago ou entregue) e o dia de fechamento. A leitura
  dos pedidos existe na plataforma de lojas
  (`GET /api/admin/tenants/<slug>/pedidos`).
- **As telas novas da ficha não foram conferidas no navegador** (dois botões e
  um trecho de texto na lista de assinaturas). Lint e testes passaram.

---

## 1. Cadastro do cliente

### 1.1 A lista "Só o cliente responde" não deixa responder

`src/components/CadastroAssistidoPanel.tsx`, por volta da linha 384.

A tela mostra os campos que faltam, com o motivo de cada um, usando `LinhaInfo`
— que é linha de leitura. Não há onde digitar. O formulário editável existe,
mas fica mais abaixo na mesma aba, e parte dos campos listados nem está nessa
aba (razão social, por exemplo). Então a tela diz o que falta e não deixa
resolver.

Para resolver falta um endpoint de escrita por chave. Os dois que existem hoje
(`cadastro/sugestoes` e `cadastro/sugestoes/decidir`) só trabalham com sugestão
da IA: geram e aprovam. Nenhum aceita "grave este valor neste campo".

### 1.2 Campo sem finalidade declarada

Levantado com o Nícolas diante do campo "Provedor atual", que ele preencheu com
`????` por não saber o que a pergunta queria. Se o dono do produto não sabe, o
campo está quebrado.

A ficha tem **76 campos**. Auditando cada um contra o código, **24 não são
lidos por nada** além do próprio formulário e da rota que salva:

| Grupo | Campos |
|---|---|
| Redes sociais | `facebookPageName`, `facebookUrl`, `instagramUrl`, `linkedinUrl`, `tiktokUrl`, `youtubeUrl`, `otherSocialProfiles`, `socialMediaOwnerStatus` |
| Oportunidade | `hasPdfCatalog`, `hasProfessionalEmail`, `hasCompleteBrandIdentity`, `onlineStoreInterest`, `onlineStoreNotes`, `emailOpportunityStatus`, `brandOpportunityPlan`, `catalogOpportunityPlan`, `socialOpportunityPlan`, `onlineStoreOpportunityStatus` |
| Integrações | `metaPixel`, `metaBusiness`, `googleAds`, `whatsappBusiness`, `transactionalEmail` |
| Contato e endereço | `ownerRole`, `bestContactTime`, `contactNotes`, `complement`, `municipalRegistration` |
| Implantação | `onboardingStage`, `internalOwnerName` |

Três são pior que isso: `autoRenewal`, `renewalOwner` e `currentProvider` não
aparecem em lugar nenhum do código, nem para salvar. `currentProvider` é
duplicata de `siteProvider` e é justamente o "Provedor atual" da tela.

**Decidir:** cortar os que não têm leitor, ou ligar algum deles a quem deveria
usá-lo. O Instagram e o Facebook fariam sentido no Hub Social, mas hoje o
módulo Meta busca pela API e não lê desses campos.

**Já escrito, faltando ligar:** `src/lib/campos-explicados.ts` tem os 76 campos
com duas frases cada — a pergunta em português claro e o destino real do valor.
Onde não há destino, o texto diz isso. Falta o componente do "i" na ficha.

### 1.3 O formulário salva, mas quase nunca salvou

No banco de produção, para 24 organizações:

| Tabela | Linhas |
|---|---|
| `operations.organizations` | 24 |
| `operations.organization_profiles` | 11 |
| `operations.organization_web_presence` | 7 |

A Saúde Pet (cliente 100022) tem **zero** linhas nas duas. O
`https://saudepet.app.br` que aparece na tela vem de `organizations.site_url`,
outra coluna, preenchida em outro lugar. Vale conferir se é só falta de uso ou
se o salvamento falha em algum caminho.

---

## 2. Identidade visual

### 2.1 Prévia do que cada ícone vira

`src/components/GeradorDeIcones.tsx`.

Cada tipo já tem a explicação escrita e ela é boa ("Atalho no iPhone. O iOS não
respeita transparência: vai com fundo sólido"). Falta ver. A prévia deve
responder à margem e ao fundo enquanto a pessoa mexe, antes de gerar arquivo:

| Contexto | O que mostrar |
|---|---|
| Aba do navegador | favicon de 16px ao lado do título |
| Tela do Android | ícone de 192 no quadrado arredondado |
| Tela do iPhone | Apple Touch no squircle, com o fundo sólido que o iOS força |
| Maskable | o círculo do Android por cima, mostrando o que sai da zona segura de 80% |
| WhatsApp | card 16:9 |
| Compartilhar link | retângulo Open Graph 1200×630 |

O maskable é o que mais justifica: é onde a logo é cortada sem avisar, e hoje
só se descobre depois de gerar.

### 2.2 Mensagem de erro que não some

Mesmo arquivo, linha 90. `setErro("Escolha a logo de origem.")` nunca é
limpo quando a pessoa escolhe a logo. A tela fica mostrando o erro em vermelho
ao lado do seletor preenchido.

### 2.3 A logo do cliente replica em dois lugares, podia replicar em seis

Hoje alimenta a geração de ícones e o Estúdio (que prefere a horizontal e
congela os bytes na peça, de propósito, para o snapshot não mudar depois).

Não alimenta, e podia:

- **Lista de clientes** — o ativo já está gravado, é só exibir. É o mais barato.
- **Site interno do cliente** — hoje sai sem logo, e é o único lugar onde a
  ausência é visível para o cliente final.
- **Cobrança e nota** — saem com a marca da Ávila.
- **Newsletter** — cabeçalho podia usar a do cliente quando a campanha é em
  nome dele.

### 2.4 `public/favicon.svg` não é vetor

São 30 KB de um PNG em base64 dentro de uma casca `<svg>`. Funciona, não escala
como vetor e pesa mais que devia. Trocar se existir o vetor original.

---

## 3. Banco de dados

### 3.1 Vínculo que o banco não garante

88 chaves estrangeiras no total, mas **22 tabelas sem nenhuma FK**, nem
entrando nem saindo.

Aceitáveis (série temporal, não precisa de vínculo): `service_health_checks`,
`server_health_snapshots`, `audit_events` nos dois schemas, e o `ai_core`
inteiro.

**Preocupantes:** `finance.ledger_entries` (contas a pagar e receber) e
`operations.integration_connections`. O vínculo com a organização existe por
uma coluna de id solta. Apagar uma organização deixa lixo órfão sem o banco
reclamar.

### 3.2 Migration que quebra por dono da tabela

Três das 63 migrations já falharam com `ERROR: must be owner of table`, todas
pelo `ALTER TABLE ... OWNER TO app_avila` que algumas fazem:

| Migration | Falhou em |
|---|---|
| `20260726060000_add_dns_and_cloudflare_fields` | 04/09 |
| `20260814020000_add_recruitment_module` | 12/09 |
| `20260910230000_credit_score_readings` | 16/09 |

As três foram reaplicadas com sucesso depois, então o estado atual está limpo e
não há migration pendente. Mas a armadilha continua armada: o CI contorna
criando o papel `app_avila` antes de migrar, e quem rodar migração à mão sem
esse passo vai bater no mesmo erro.

### 3.3 Trinta e três tabelas vazias

De 54 em `operations`. Estão zeradas: leads, vagas e candidaturas, newsletter
inteira, Meta inteira (contas, páginas, campanhas, formulários), estúdio,
entregas e cobranças, planos de serviço, DNS, arquivos, sugestões de cadastro,
catálogo de banco do cliente.

O que domina em volume é monitoramento: 107.160 linhas em
`service_health_checks` e 10.664 em `server_health_snapshots`. Máquina falando
com máquina. O conteúdo humano são 11 perfis e 5 projetos.

**Decidir, tabela por tabela:** é módulo esperando uso ou módulo que não
vingou? Enquanto a resposta não vem, cada um desses custa manutenção de schema
e espaço na navegação.

---

## 4. Infraestrutura

### 4.1 GitHub Actions bloqueado por faturamento

Desde as 05:14 de 19/09 todos os jobs do repositório são recusados com
*"recent account payments have failed or your spending limit needs to be
increased"*. Isso derruba CI e deploy de **todas** as sessões, não de uma só.

Enquanto não for resolvido no painel de billing do GitHub, cada entrega precisa
do caminho manual descrito abaixo, e nenhuma é verificada pelo CI antes de ir
ao ar.

### 4.2 O deploy manual funciona, com uma armadilha

Passos que deram certo em 19/09, para a imagem `7e4765a`:

```
git archive --format=tar HEAD | gzip -1 > fonte-<sha>.tgz
scp fonte-<sha>.tgz root@178.105.82.48:/tmp/
# no servidor, em /opt/app-avilaops:
find . -mindepth 1 -maxdepth 1 \
  ! -name '.env*' ! -name 'storage' ! -name '*.tgz*' ! -name '*.bak*' \
  -exec rm -rf {} +
tar -xzf /tmp/fonte-<sha>.tgz -C /opt/app-avilaops
GIT_SHA=<sha> BUILT_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ) docker compose build app
GIT_SHA=<sha> docker compose up -d app
```

**A armadilha é o `find ... -exec rm -rf`.** Sem ele o `tar` só acrescenta
arquivos: o que foi apagado no git continua no servidor. Foi o que quebrou a
primeira tentativa — um `route.ts` excluído dias antes seguia lá, importando
uma função que não existe mais, e o build morreu com
`Export urlLoginCliente doesn't exist`.

O `.env.production` e o `storage/` ficam de fora da limpeza de propósito: um é
segredo, o outro é bind mount com arquivo de cliente dentro.

### 4.3 n8n antigo parado, migração não feita

O n8n do servidor de aplicações (178) foi parado em 19/09. Ele tinha 52 fluxos
ativos disparando a cada 15 minutos e **falhando todos**, porque as credenciais
não existiam mais ali (`Credential with ID ... does not exist`). Nenhum host do
Caddy roteava para ele, então webhook nunca chegava: era cópia velha disparando
em paralelo com a instância viva.

Os dados continuam em `/opt/n8n/dados` (15 MB), e há um
`LEIA-ANTES-DE-SUBIR.txt` ao lado explicando o porquê. Reverter é
`docker start n8n-n8n-1`.

**Pendente:** o Nícolas quer o n8n no servidor de aplicações. `n8n.avilaops.com`
aponta para o 204, que tem a versão consolidada (16 fluxos, com os mesmos IDs
dos 52). Se a migração acontecer, **o que migra é o conteúdo do 204**. O que
estava no 178 está desatualizado.

### 4.4 Containers que o Nícolas pediu para apagar e seguem de pé

No 178: `minas-espetinhos` (app, banco e poller do iFood), `sorroche-web`,
`mello-app`, `mello-db`, e o próprio `n8n` (parado, não removido).

Não foram esquecidos: em 18/09 o pedido foi *"não precisa apagar nada, por
enquanto, vamos continuar melhorando a interface"*. Ficam até alguém retomar.

### 4.5 Fênix Eletrodos com TLS quebrado

Conferido em 19/09: o certificado servido em `fenixeletrodos.com.br` não bate
com o domínio (`SEC_E_WRONG_PRINCIPAL`). A hospedagem é de fora, então quem
resolve é o provedor deles.

### 4.6 Google sem dados reais de Perfil da Empresa

A API do Google Business Profile está com cota zero na conta e a Places precisa
de faturamento e permissão ativados. Enquanto isso o app mostra "não conectado"
em vez de inventar número, que é o comportamento pedido.

---

## 5. Interface, o que sobrou

### 5.1 Aba "Banco de dados" aparece para todo cliente

É o catálogo do banco **do cliente**, não do Ávila Ops. Nasceu para a Vedashow:
o Procommerce roda num SQL Server dentro da rede deles, e o app precisa saber
que tabelas existem. O app não conecta lá — um script roda onde há acesso e faz
`POST` no endereço que a tela mostra.

A tabela `client_databases` tem zero linhas. Para quem não tem banco para
catalogar, a aba é ruído.

**Decidir:** esconder quando não houver banco catalogado, ou deixar.

### 5.2 Nomes de classe antigos no markup

25 arquivos ainda usam `section-panel`, `metric-grid`, `ios-row`,
`operations-panel`. **Não desenham mais o visual antigo**: a definição dessas
classes foi reescrita para a linguagem do sistema, então elas já são superfície
sem contorno, raio médio e sombra 1.

Trocar o nome seria higiene de código, não mudança visual, e cada troca é uma
chance de quebrar uma regra de negócio numa tela que hoje funciona. Baixa
prioridade, e talvez nunca.

---

## Estado atual, para quem chegar agora

A migração visual está fechada. Medido em 25 rotas × 6 perfis (celular 390 e
430, desktop 1440, cada um claro e escuro), no build de produção:

| | |
|---|---|
| Botões e links sem nome acessível | 0 |
| Campos sem rótulo | 0 |
| Estouro horizontal fora de trilho | 0 |
| Rolagem horizontal de página | 0 |
| Erros de console | 0 |
| Textos abaixo de 12px | só o título de grupo, 11px em caixa alta, de propósito |

Tipografia: body, h1, h2, botão, input, select, textarea, badge, linha, barra
de abas e coluna do desktop convergem todos para Manrope. Monoespaçada só em
`code` e `pre`.

`main` está em `7e4765a`, implantada à mão no servidor de aplicações.

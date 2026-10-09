# Lojas: catálogo da loja — origem dos dados, o que se edita, auditoria e medições

Levantado em 08–09/10/2026, junto com a reorganização de `/lojas/<slug>`. Cada
afirmação diz como foi verificada: **código** (lido no repositório),
**execução** (rodado e conferido) ou **não verificado**. Onde a execução foi no
**ambiente de conferência** e não em produção, está dito.

Estado no ar em 09/10/2026: painel `854314c`, plataforma de lojas `d64c500`.

## 0. Ambientes: o que foi provado onde

| Ambiente | O que é | O que prova | O que não prova |
|---|---|---|---|
| **Produção** | `app.avilaops.com` e `lojas.avilaops.com` | deploy concluído, rotas protegidas (401/307 sem sessão), consulta da plataforma medida no próprio servidor, só leitura | nenhuma tela foi aberta com sessão de usuário: não há sessão autorizada disponível para o agente |
| **Conferência** | a **mesma imagem** publicada em produção (`ghcr.io/…:sha-854314c…`), rodando no `apps-noclient` com banco descartável e três contas de teste (dono, sócio, cliente). As **leituras** vão à plataforma de produção por um intermediário; toda **escrita** para nele e é simulada em memória | comportamento da tela com os dados reais das lojas, em desktop e celular; tempos de clique; permissões; o que o painel envia | a gravação de verdade na plataforma (isso é provado pelos testes de integração dela, com banco próprio) e o tempo exato em produção (a conferência tem um salto de rede a mais) |
| **Testes da plataforma** | `tests/integration` do `lojas.avilaops.com`, Postgres descartável, Mercado Pago simulado em memória | gravação, histórico, isenção, ciclo da assinatura | a conversa com o Mercado Pago real |

Nenhuma cobrança real foi criada, nenhum produto e nenhuma loja de produção
foram alterados para testar.

## 1. Arquitetura

São dois sistemas e dois bancos, de propósito:

| | Painel (`app.avilaops.com`) | Plataforma de lojas (`lojas.avilaops.com`) |
|---|---|---|
| Banco | `cliente_portal` | `lojas` |
| É dono de | cliente, vínculo loja → cliente, auditoria do painel | loja, catálogo, pedido, estoque, mensalidade, isenção, histórico de catálogo |
| Como o painel lê e grava | Prisma | API de administração (`LOJAS_API_URL` + `LOJAS_ADMIN_TOKEN`), nunca o banco |

O painel **não guarda cópia** do catálogo e, desde 09/10, **não tem cache**: cada
abertura, filtro, ordenação ou página pede à plataforma só aquela página (§6).

## 2. Origem de cada informação da página da loja

| Informação | Endpoint (`/api/admin/tenants/<slug>…`) | Tabela e campo (banco `lojas`) | Regra | Editável aqui? |
|---|---|---|---|---|
| Situação da loja, domínio, plano | `GET` (ficha) | `Tenant.status`, `dominioPrincipal`, `plano` | valor gravado | não |
| Cliente vinculado | — (Prisma) | `cliente_portal`: `organization_integrations` | um vínculo por loja | **sim**: "Vincular" |
| Assinatura | `GET` (ficha) | `Tenant.assinaturaId`, `assinaturaStatus`, `ultimoPagamentoEm` | §5 | criar: dono; demais ações em Financeiro › Mercado Pago |
| Isenção | `GET /isencao` | `Tenant.cobrancaIsenta` + régua calculada | §5 | **sim**, só o dono |
| Lista, total, página, facetas, grupos, indicadores | `GET /produtos/consulta?…` | `Produto`, `Categoria`, `Variante`, `SaldoEstoque` | uma consulta SQL: busca, filtros, ordem, página e agregações no banco | não (calculado) |
| Estoque | idem | `SaldoEstoque.fisico − reservado` das variações ativas | §3 | não: é do lojista ou do ERP |
| Situação, categoria e preço do produto | `GET /produtos/<id>`, `PATCH /produtos/<id>` | `Produto.ativo`, `categoriaId`; `Variante` + `PrecoVariante` | §4 | **sim** |
| Histórico do produto | `GET /produtos/<id>` | `HistoricoCatalogo` (origem, campos, antes, depois, versão) | 20 mais recentes | não (histórico) |

A consulta devolve `{ itens, total, pagina, paginas, por, de, ate, grupos,
resumo, facetas, lidoEm }`. `resumo` e `facetas` são sempre da **loja inteira**
(os indicadores não mudam com o filtro); `total` e `grupos` são do resultado
filtrado inteiro, não da página. **Execução (conferência, dados reais):** nas
duas lojas, total, cada indicador, combinação de categoria + marca + situação +
sem foto e contagem por grupo batem com uma fonte independente (a lista enxuta
antiga, `?resumo=1`, contada em JavaScript): 224 de 224 na Brilhax, 5.634 de
5.634 na Vedashow.

### O que não é zero

- **Falha de leitura** não vira zero: a tela mostra "Não consegui ler o catálogo"
  e nenhum indicador. **Execução:** com a leitura falhando de propósito, a tela
  avisa; a leitura seguinte traz o catálogo (a falha não fica guardada).
- **Estoque** tem três estados que não se confundem (§3).
- **Preço**: `precoCentavos <= 0` é "sob consulta", regra da vitrine. O campo
  de preço vazio na edição grava isso; texto que não é número é recusado
  ("Preço inválido"), não vira zero.

## 3. Estoque: fonte oficial e regra

Fonte oficial (**código**, plataforma): `SaldoEstoque`, por variação e local.
Disponível = `fisico − reservado`, somado nas variações **ativas que vendem**:
com grade, as variações; sem grade, a apresentação única (com grade, a
apresentação única é só o molde e não conta). `Produto.estoque` é projeção.

| Estado | Quando | Na tela |
|---|---|---|
| Não controla | algum saldo com `fisico` nulo | "Não controla" |
| Desconhecido | nenhuma linha de saldo | "Desconhecido" |
| Controlado | saldo numérico | o número; filtros "Com saldo" e "Zerado" |

Indicador "Anuncia sem saldo": ativo, declarado `in_stock`, controlado e com
disponível ≤ 0.

**Execução (produção, só leitura, 09/10):** 6.713 produtos, **0 divergências**
entre `Produto.estoque` e o saldo das variações, 0 reservas, 0 produtos com
grade, preços iguais entre produto e variação. Vedashow: 5.634 controlam (3.418
com saldo + 2.216 zerados), igual à projeção. Brilhax: 224 não controlam. Não
havia divergência a corrigir; o que mudou é que a tela passou a ler a fonte
oficial, e uma divergência futura aparece em vez de ficar escondida.
**Não verificado:** produto com grade (não existe nenhum em produção; a regra
está coberta por teste de integração da plataforma).

## 4. Edição de produto e auditoria

Pela ficha do produto dá para alterar **situação, categoria e preço**. Estoque,
fotos e textos não: são do lojista, da importação ou do ERP.

- Quem pode: gente da casa (`OWNER`, `SOCIO`). Conta de cliente (`ADMIN`) não
  entra em Lojas (**execução**: 307 para o login e 401 no `PATCH`).
- O painel lê o estado atual, compara e manda **só o que mudou**, com `autor`
  (nome de quem está logado) e `versao` (a que a pessoa via). **Execução:** o
  envio foi `{"autor","versao","precoCentavos"}`; uma segunda aba aberta na
  versão antiga recebe "O produto mudou depois que você abriu".
- A plataforma grava pelo mesmo caminho do painel dela
  (`ajustarOfertaNoCatalogo` / `editarProdutoPelaApi`), na mesma transação do
  histórico. Produto com grade recusa preço (409): é de cada variação.
- Se a última alteração veio de integração, a ficha avisa que a próxima
  sincronização pode sobrescrever.

Rastro, nos dois lados:

| Onde | O que guarda |
|---|---|
| `HistoricoCatalogo` (plataforma) | versão, origem, campos, antes, depois, data |
| `operations.audit_events` (painel), `LOJA_PRODUTO_ALTERADO` | quem (`actor_id`), loja, produto, campos, antes, depois, versão |

Origem, a partir de 09/10: `avilaops:<nome>` (painel da Ávila Ops),
`painel:<e-mail>` ou `painel:dono` (painel da loja), `api:<chave>`,
`importacao`, `migracao:<nome>`, ou o nome da execução (`auditoria-…`).
A tela mostra pessoa ("Painel da Ávila Ops · Fulana") ou automática
("Importação em lote · automática"). **Registro antigo não ganha autor:** o
painel da loja gravava só `painel`, e isso aparece como "autor não registrado".
**Execução (dado real):** `Execução auditoria-individual-brilhax-20260928 ·
automática`, `Painel da loja · autor não registrado`, `Importação em lote ·
automática`.

Limite conhecido: a origem identifica a integração ou a execução pelo nome
gravado; não há identificador de execução separado para importações (todas
gravam `importacao`).

## 5. Assinatura e isenção

| Ato | O que é | Onde fica | Quem faz |
|---|---|---|---|
| Vincular plano | qual plano a loja tem | `Tenant.plano` | plataforma (lojista ou suporte) |
| Conceder acesso | loja no ar ou suspensa | `Tenant.status` | plataforma; a régua de inadimplência só **lista** quem seria suspenso (`LOJAS_SUSPENSAO_AUTOMATICA` desligada em produção) |
| Isentar | tirar a loja da régua | `Tenant.cobrancaIsenta` | dono, pelo painel |
| Iniciar cobrança | criar a mensalidade no Mercado Pago; o lojista cadastra o cartão no link | `Tenant.assinaturaId`, `assinaturaStatus = PENDENTE` | dono, "Criar mensalidade" |
| Confirmar pagamento | marcar como pago | `ultimoPagamentoEm`, `Fatura` | **só** o aviso do Mercado Pago |

**Isenção.** Guardada em `Tenant.cobrancaIsenta`. Efeito: a loja sai da régua
de inadimplência e criar mensalidade por aqui fica bloqueado. Não cancela
mensalidade que já exista. Quem altera: só o dono (`ehDono`), com origem
estrita e senha confirmada há pouco; a plataforma exige o token de
administração. **Tirar a isenção não cobra:** não cria assinatura, não gera
fatura, não muda o status da loja e não avisa o lojista. Se a loja cairia na
régua, a plataforma recusa (409) sem `cienteDaRegua`, e a confirmação na tela
diz o motivo antes do clique. Auditoria no painel: `LOJA_ISENCAO_ALTERADA`
(antes, depois, o que a régua dizia na hora, se havia assinatura) e
`LOJA_ISENCAO_RECUSADA`.

**Execução (conferência):** a confirmação mostra a consequência; pede a senha;
o único envio é `POST …/isencao {"isenta":false,"cienteDaRegua":true}`, nenhum
para `/assinatura`; a tela relê e mostra "não isenta" e "Nenhuma cobrança foi
criada"; o sócio abre a loja mas não vê o botão e recebe 403; o evento ficou
gravado. **Produção, 09/10 (leitura):** Brilhax, Vedashow e FX Eletrodos estão
isentas e cairiam na régua ("período de teste encerrado sem assinatura"); PK
Vedações está isenta e não cairia.

**Ciclo da assinatura, em ambiente de teste** (plataforma, 12 testes de
integração, Mercado Pago simulado em memória, nenhuma cobrança real):

| Caso | Resultado |
|---|---|
| Criar | nasce `PENDENTE`, com o valor do plano e o link de cartão; nada é marcado como pago |
| Pedir de novo | não cria segunda assinatura: devolve a mesma pendente |
| Loja isenta, cancelada ou sem e-mail | recusa sem chamar o Mercado Pago |
| Aviso de autorização | ativa; repetido, não faz nada de novo |
| Alterar valor, pausar, retomar | chegam ao Mercado Pago e persistem depois de reler |
| Mercado Pago fora do ar | a ação devolve erro e o estado local não muda |
| Cancelar | só marca cancelada depois de o Mercado Pago confirmar (antes marcava mesmo com falha: corrigido) |
| Pagamento | só o aviso marca como pago; o mesmo aviso duas vezes não duplica fatura nem evento |
| Aviso que falha | fica registrado com o erro e a nova entrega é processada |

**Não verificado:** a conversa com o Mercado Pago de verdade (nem em sandbox).

## 6. Desempenho dos filtros

**Antes (08/10):** cada clique refazia a página e baixava o catálogo inteiro
para filtrar em memória. **Depois (09/10):** busca, filtros, ordenação,
paginação e agregações numa consulta SQL na plataforma; o painel recebe a
página e os totais. Ordenação por nome usa a colação `ptbr_natural`
(migração `20261009030000`), com o id como desempate.

Leitura do catálogo na plataforma, **produção**, no próprio servidor, mediana:

| Loja | Produtos | Catálogo completo (antes de 08/10) | Lista enxuta (08/10) | Consulta paginada (09/10) |
|---|---|---|---|---|
| Brilhax | 224 | 0,12 s · 1,05 MB | 0,06 s · 0,12 MB | **0,03 s · 15,7 KB** |
| Vedashow | 5.634 | 1,82 s · 16,1 MB | 0,66 s · 2,88 MB | **0,27 s · 21,5 KB** |

Vedashow, por tipo de consulta: inativos 0,24 s; sem foto 0,30 s; 100 por
página ordenado por preço 0,28 s · 63,7 KB; agrupado, página 3, 0,31 s; busca +
três filtros 0,27 s. O cálculo de estoque custava ~300 ms por consulta e caiu
para ~90 ms (uma agregação por loja em vez de uma subconsulta por produto,
mesmo resultado nas quatro lojas com catálogo). O que sobra são as contagens da
loja inteira, as facetas e a ordenação sobre 5,6 mil linhas, refeitas a cada
consulta; baixar disso pede coluna pré-calculada ou cache das agregações.

**Clique → lista pronta** (conferência, imagem de produção, Chromium; "frio" =
primeira vez depois de o painel subir, "morno" = mediana das três seguintes;
cada clique faz 3 leituras na plataforma: ficha, isenção e consulta):

| Cenário | Brilhax desktop | Brilhax celular | Vedashow desktop | Vedashow celular |
|---|---|---|---|---|
| Abrir a loja (carga inteira) | 1.893 / 1.244 ms | 1.878 / 719 | 2.951 / 1.003 | 2.251 / 813 |
| Indicador "Inativos" | 582 / 466 | 694 / 593 | 770 / 600 | 672 / 599 |
| Indicador "Sem foto" | 299 / 331 | 433 / 334 | 619 / 640 | 610 / 702 |
| Categoria | 400 / 548 | 489 / 458 | 641 / 588 | 661 / 569 |
| Marca | 698 / 379 | 628 / 472 | 755 / 548 | 644 / 642 |
| Busca (inclui 350 ms de espera da digitação) | 738 / 651 | 709 / 696 | 1.090 / 885 | 1.118 / 1.050 |
| Ordenar por maior preço | 480 / 434 | 542 / 486 | 758 / 604 | 688 / 717 |
| Agrupar por categoria | 475 / 415 | 480 / 429 | 646 / 690 | 607 / 736 |
| Próxima página | 638 / 506 | 585 / 457 | 720 / 717 | 762 / 660 |
| Combinado (categoria + marca + ativos + sem foto) | 318 / 262 | 423 / 401 | 521 / 564 | 634 / 583 |

Por clique o navegador recebe ~35 KB de dados da página (1 pedido), mais as
miniaturas novas (até 25). A consulta, vista da conferência, levou ~110 ms na
Brilhax e ~300–400 ms na Vedashow. Em produção o painel fala com a plataforma
pelo endereço público dela, no mesmo servidor, sem o salto extra da
conferência. Planilha bruta: `~/.agents/claude/out/lojas-2026-10-09/medidas-filtros.jsonl`.

**Não verificado:** o tempo em produção com sessão real (roteiro no §9).

### Defeito achado na medição: filtro preso em "Atualizando a lista…"

Sobre a imagem de produção, ~1 em cada 5 trocas de filtro não concluía: a
resposta chegava inteira, sem erro, e a tela não trocava. Acontece também com
`router.push` puro e com `<Link>` comum (Next 16.2.11), só na página da loja com
a lista cheia, nunca com lista vazia nem nas outras páginas, e **já estava no ar
desde 08/10**. Causa de fundo no Next/React **não identificada**. Conserto
(`854314c`): a navegação do catálogo confere se o endereço trocou; sem troca em
1,5 s tenta de novo e, na terceira vez, carrega a página inteira. **Execução:**
240 cliques seguidos, 0 sem efeito e 0 listas presas (antes: 8 a 10 em 40); o
vigia agiu em 20 deles, que levaram ~1,8 s em vez de ~0,4 s. Vale reavaliar
quando o Next for atualizado.

Também saiu o pré-carregamento da ficha de cada produto visível: eram até 90
pedidos ao servidor por lista de 100, sem nada a aproveitar (`f18a529`).

## 7. Cache e consistência

Não há mais cache do catálogo no painel (o de 1 minuto, em memória, foi
removido: podia esconder por até um minuto uma alteração recém-feita). Cada
tela mostra "lido da plataforma em …" e "Atualizar" lê de novo (**execução**:
uma leitura nova a cada clique). Depois de editar produto ou isenção a tela
relê o estado. Isolamento: a consulta leva o slug no endereço e a plataforma
filtra por `tenantId`; **execução**: nenhuma linha listada numa loja pertence à
outra. Falha de leitura não é guardada. As preferências de coluna ficam no
navegador, por pessoa e loja, e não são dado de catálogo.

## 8. Campos secretos que a API devolvia (alcance)

Até 08/10, `GET /api/admin/tenants/<slug>` devolvia três colunas **cifradas**:
`mlAccessTokenEnc`, `mlRefreshTokenEnc` e `apiKeyEnc`. Desde `1366b75` da
plataforma nenhuma coluna `…Enc` sai na resposta (conferido em produção).
Nenhum valor foi lido nem reproduzido nesta análise.

| Pergunta | Resposta | Como |
|---|---|---|
| O que havia de fato | só `apiKeyEnc` tinha valor, em 2 de 7 lojas (`sandromotos`, `vedashow`): a chave antiga do conector MCP. As colunas do Mercado Livre estavam vazias | execução (contagem de não nulos) |
| Em que forma | AES-256-GCM com `LOJAS_SECRET`, que só existe em `/opt/lojas/.env` | código e execução |
| Quem conseguia a resposta antiga | quem tem o `LOJAS_ADMIN_TOKEN`: a própria plataforma e o painel (`.env` no servidor) e o fluxo do n8n "Lojas - Operação Completa" | execução |
| Onde aparecia na tela | na folha de evidência de `/lojas/<slug>`, de 18/09 (`86948e8`) a 08/10 (`99de2f9`), para contas da casa: 2 `OWNER` e 1 `SOCIO`. Conta `ADMIN` (cliente) não entra em Lojas | código e execução |
| Cópias em cache, log ou artefato | página `no-store`; 0 ocorrências nos logs dos dois contêineres; 0 em 2.868 execuções guardadas do n8n; o Caddy não grava corpo. Os backups do banco `lojas` contêm a coluna, como sempre contiveram | execução |

Alcance comprovado: texto cifrado visto por três contas internas. Sem a
`LOJAS_SECRET` o texto não vira chave. Medida adicional recomendada, por
precaução e não por evidência de vazamento: gerar de novo as duas chaves do
conector (`sandromotos` e `vedashow`) no painel de cada loja. Não há evidência
que peça trocar a `LOJAS_SECRET`.

## 9. Validação e roteiro para conferir em produção

**Executado (conferência, imagem `854314c`):** roteiro
`~/.agents/claude/out/lojas-2026-10-09/validar-lojas-v2.cjs`, **78 de 78**,
nas duas lojas, em 1440, 1280 e celular de 390 px: sem rolagem horizontal,
totais e indicadores contra fonte independente, busca por SKU, ordenação,
combinação de filtros, três estados de estoque, agrupamento, paginação,
"Atualizar", isolamento entre lojas, tela de falha, edição de produto (envio
mínimo, histórico com autor, conflito de versão, preço inválido), isenção
(consequência, senha, sem cobrança, sócio barrado, cliente barrado, sem
sessão), alvos de toque de 44 px e console sem erro. Resultado em
`validacao-v2-resultado.txt`, capturas `v2-*.png` na mesma pasta.

Testes automatizados: painel 1.292 (117 arquivos); plataforma 117 de integração
e 928 de unidade.

**Roteiro para o Nicolas, em produção (uns 5 minutos, no computador e no
celular):**

1. Abra `app.avilaops.com/lojas/vedashow`. Confira "lido da plataforma em" com
   a hora de agora e 5.634 produtos.
2. Clique em "Sem foto", depois "Limpar filtros", depois "Inativos", umas dez
   vezes seguidas. Nenhum clique pode ficar sem efeito nem a lista presa em
   "Atualizando a lista…".
3. Combine categoria + marca + "Ativos" e ordene por maior preço; vá à página 2
   e volte. O total no alto da lista deve acompanhar.
4. Abra um produto. Não altere nada: confira o estoque, o bloco "Alterar" com o
   botão desligado e o histórico com "autor não registrado" nos registros
   antigos. Volte: a lista deve estar na mesma página e linha.
5. Em "Gerenciar assinatura e isenção", clique em "Tirar a isenção", **leia a
   confirmação e cancele**. Não confirme: é só para ver o texto.
6. No celular: abra a loja, toque em "Filtros", escolha uma marca, "Aplicar".

Se quiser provar a edição de verdade, escolha um produto inativo de teste,
troque a categoria, salve, confira a linha nova no histórico com o seu nome e
desfaça.

## 10. Pendências

1. Tempo dos filtros e as telas novas em produção com sessão real (§9).
2. Causa de fundo do travamento de navegação (§6): contornado, não explicado.
3. Vedashow a ~0,27 s por consulta: agregações da loja inteira refeitas a cada
   clique.
4. Ficha da loja, isenção e consulta são três leituras por clique; dá para
   juntar numa só.
5. A seta "voltar" do cabeçalho da ficha usa o link comum do painel, sem o
   vigia da navegação; os links do caminho ("Produtos") usam.
6. Mercado Pago real (sandbox ou produção) não exercitado; faltam
   `MP_WEBHOOK_SECRET` e `MP_CLIENT_SECRET`.
7. Preferência de colunas vive no navegador, não na conta.
8. Importações gravam todas a origem `importacao`, sem identificador da
   execução.

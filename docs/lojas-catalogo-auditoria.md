# Lojas: catálogo da loja — origem dos dados, o que se edita, auditoria e medições

Levantado em 08–09/10/2026, junto com a reorganização de `/lojas/<slug>`. Cada
afirmação diz como foi verificada: **código** (lido no repositório),
**execução** (rodado e conferido) ou **não verificado**.

## 1. Arquitetura encontrada

São dois sistemas e dois bancos, e isso é de propósito:

| | Painel (`app.avilaops.com`) | Plataforma de lojas (`lojas.avilaops.com`) |
|---|---|---|
| Banco | `cliente_portal` | `lojas` |
| É dono de | cliente, vínculo loja → cliente, auditoria do painel | loja, catálogo, pedido, estoque, mensalidade, histórico de catálogo |
| Como o painel lê | Prisma | API de administração (`LOJAS_API_URL` + `LOJAS_ADMIN_TOKEN`), nunca o banco |

O painel **não guarda cópia** do catálogo. O que existe é um cache em memória de
um minuto por loja (`catalogoDaLoja()` em `src/lib/lojas-servidor.ts`), e a tela
mostra a hora da leitura e um "Atualizar".

## 2. Origem de cada informação da página da loja

| Informação | Onde aparece | Endpoint / função | Tabela e campo (banco `lojas`) | Regra | Editável aqui? |
|---|---|---|---|---|---|
| Situação da loja | selo no cabeçalho | `GET /api/admin/tenants/<slug>` · `lerLoja()` | `Tenant.status` | valor gravado | não (muda na plataforma) |
| Domínio | subtítulo | idem | `Tenant.dominioPrincipal`, senão `<slug>.lojas.avilaops.com` | `enderecoDaLoja()` | não |
| Cliente vinculado | bloco da loja | Prisma, `montarDetalheDaLoja()` | banco `cliente_portal`: `organization_integrations` (`provider = lojas_avilaops`, `publicId = slug`) | um vínculo por loja | **sim**: "Vincular" → `POST /api/lojas/<slug>/vincular` |
| Assinatura | bloco da loja | `lerLoja()` | `Tenant.assinaturaId`, `assinaturaStatus`, `ultimoPagamentoEm`, `cobrancaIsenta` | ver §5 | criar: sim (dono); demais ações em Financeiro › Mercado Pago |
| Pedidos, categorias | bloco da loja | `lerLoja()` | `count(Pedido)`, `count(Categoria)` da loja | contagem da plataforma | não (calculado) |
| Total, ativos, inativos | indicadores | `GET …/produtos?resumo=1` · `listarCatalogoResumido()` | `Produto.ativo` | `resumirCatalogo()` | não (calculado) |
| Sem foto | indicador e filtro | idem | `Produto.imagens` (contagem em `fotos`) | ativo e `fotos === 0` | não (calculado) |
| Sem preço | indicador e filtro | idem | `Produto.precoCentavos` | ativo e `precoCentavos <= 0` | não (calculado) |
| Anuncia sem saldo | indicador e filtro | idem | `Produto.disponibilidade`, `Produto.estoque` | ativo, `in_stock` e `estoque <= 0` | não (calculado) |
| Foto de outro item | indicador e filtro | idem | `Produto.imagemOrigem` | ativo, com foto e origem ≠ `propria` | não (calculado) |
| Nome, marca, SKU, categoria, preço, estoque | tabela e ficha | idem; ficha em `GET …/produtos/<id>` | `Produto.*`, `Categoria.nome` | valor gravado | não: mudam no painel da loja, por importação ou pelo ERP |
| Histórico do produto | ficha do produto | `GET …/produtos/<id>` · `lerProduto()` | `HistoricoCatalogo` (origem, campos, antes, depois) | 20 mais recentes, só os campos alterados | não (histórico) |

Verificado por **execução** contra produção (só leitura): os dois endpoints
novos respondem 200, 401 sem token e 404 para produto de outra loja.

### O que não é zero

- **Falha de leitura** não vira zero: se o catálogo não pôde ser lido, a tela
  mostra "Não consegui ler o catálogo" e **nenhum indicador** (`catalogoLido`).
  Antes, a falha devolvia lista vazia e os indicadores mostravam 0.
- **Estoque `null`** é "não controla estoque", nunca zerado. Na Brilhax todos os
  224 produtos são `null`: a tela esconde o indicador, o filtro, a ordenação e a
  coluna de estoque, e diz por quê.
- **Preço**: o modelo é `Int` não nulo, então "sem valor" e "zero" são o mesmo
  dado gravado. A plataforma trata `precoCentavos <= 0` como **preço sob
  consulta** (`sobConsulta()` em `produto-regras.ts` de lá), que é regra
  comercial, não defeito. A tela chama de "Sem preço (sob consulta)", e a faixa
  de preço nunca inclui esses produtos.

### Valores fixos ou de demonstração

Nenhum encontrado nesta página (**código**). Havia um defeito de outra
natureza: a folha de evidência incluía a ficha inteira da loja no HTML, e a API
devolvia três segredos **cifrados** (`mlAccessTokenEnc`, `mlRefreshTokenEnc`,
`apiKeyEnc`). Corrigido nas duas pontas: a plataforma não devolve mais nenhuma
coluna `…Enc` (commit `1366b75` de lá, conferido em produção) e a página não
despeja mais a ficha na tela.

## 3. Semântica dos rótulos

| Antes | Agora | Por quê |
|---|---|---|
| "No ar" / "Fora do ar" (produto) | "Ativos" / "Inativos" | "fora do ar" é estado de loja; produto inativo só não aparece na vitrine |
| "Estoque zerado" | "Anuncia sem saldo" (indicador) e filtro de estoque com "Com saldo", "Zerado", "Não controla estoque" | o indicador antigo já era "diz que tem e não tem"; o nome dizia outra coisa |
| "Sem preço" | "Sem preço (sob consulta)" | é a regra da vitrine |
| "Foto de outro item" | igual | vem de `imagemOrigem`, declarado por quem gravou a foto; o painel não classifica foto |

Contagem e listagem saem do **mesmo predicado** (`src/lib/lojas-catalogo.ts`):
clicar num indicador abre `situacao=ativos&pend=<indicador>`, e há teste que
confere que a lista tem exatamente o número contado.

A plataforma tem variantes, saldo por local e reservas (`Variante`,
`SaldoEstoque`, `ReservaEstoque`). **Não verificado:** se algum saldo por
variante diverge de `Produto.estoque`. Em 08/10 havia 6.713 variantes (uma
padrão por produto) e nenhuma reserva; a tela usa `Produto.estoque`, o mesmo
campo que a vitrine usa (`emEstoque()`).

## 4. O que se edita, o que é calculado e a auditoria

| Tipo | Itens | Onde muda | Rastro |
|---|---|---|---|
| Editável no painel | vínculo loja → cliente | "Vincular" | `operations.audit_events`, ação `STORE_LINKED` (ator, cliente, loja) |
| Editável no painel (só dono) | criar mensalidade; valor, pausar, retomar, cancelar | página da loja e Financeiro › Mercado Pago | **novo:** `LOJA_MENSALIDADE_ALTERADA` e `LOJA_MENSALIDADE_RECUSADA` (ator, loja, ação, estado resultante) |
| Calculado | todos os indicadores, pedidos, categorias | não se edita; abre a lista que compõe o total | — |
| Da plataforma | produto (preço, estoque, foto, situação), status da loja | painel da loja, importação, ERP | `HistoricoCatalogo` na plataforma: origem, campos, antes e depois, por versão |
| Histórico | eventos de auditoria e histórico de catálogo | não se reescreve por edição comum | — |

**Edição de produto pelo painel não foi implementada**, de propósito: o pedido
era organizar a gestão sem alterar produto, e um preço editado aqui poderia ser
desfeito pela próxima importação sem aviso. A plataforma já tem o caminho certo
para isso (`salvarProdutoNoCatalogo`, que grava o histórico); ligar o painel a
ele é trabalho à parte.

Histórico de catálogo existente em produção em 08/10 (**execução**): 37.252
registros; origens mais comuns `importacao` (30.277), `migracao:catalogo-v1`
(5.867), `painel` (323). Limite conhecido: a origem diz **o caminho**
(painel, importação), não a pessoa — `HistoricoCatalogo` não tem coluna de
autor. Identificador de operação: a `versao` por produto.

As ações de mensalidade só gravam `…_ALTERADA` **depois** de a plataforma
confirmar; se a gravação do rastro falhar, a ação não é desfeita (já aconteceu
no Mercado Pago) e a falha sai no log como `[lojas] SEM RASTRO`. Não há segredo
nem link de cartão nos eventos.

## 5. Assinatura: respostas com evidência

- **Posso definir uma assinatura nesta página?** Criar, sim: "Gerenciar
  assinatura" → "Criar mensalidade" (**código** e teste da tela de mensalidades;
  **não verificado** com criação real no Mercado Pago). Alterar valor, pausar,
  retomar e cancelar ficam em Financeiro › Mercado Pago, que é onde o valor e a
  próxima cobrança são lidos do Mercado Pago.
- **Quem pode?** Só o dono (`ehDono`), conferido no servidor em
  `POST /api/mercadopago/assinatura`.
- **De quem é?** Da **loja**. Campos `assinaturaId`, `assinaturaStatus`,
  `assinaturaInitPoint`, `ultimoPagamentoEm`, `cobrancaIsenta` e `plano` em
  `Tenant`, no banco `lojas`. O cliente entra só pelo vínculo do painel.
- **O que ela controla?** Cobrança e acesso: a varredura de inadimplência da
  plataforma suspende a loja depois da tolerância. Loja `cobrancaIsenta` fica
  fora dessa varredura.
- **Provedor?** Mercado Pago (assinatura recorrente, "preapproval"). O valor
  vem do plano (`PRECO_PLANO`: Site R$ 110, Loja R$ 269, Loja Pro R$ 497).

| Ato | O que é | Quem faz |
|---|---|---|
| Vincular um plano | `Tenant.plano` | plataforma (lojista antes de assinar, ou suporte) |
| Conceder acesso | `Tenant.status` e `cobrancaIsenta` | plataforma |
| Ativar assinatura | criar no Mercado Pago e o lojista cadastrar o cartão | "Criar mensalidade" + link de cartão |
| Criar cobrança | o Mercado Pago, a cada ciclo | Mercado Pago |
| Confirmar pagamento | aviso do Mercado Pago → `ultimoPagamentoEm` | Mercado Pago; nada no painel marca como pago |

Em produção, em 08/10, as quatro lojas ativas estão **isentas**: a página diz
isso e não oferece criar mensalidade (criar faria o cliente pagar duas vezes).
Tirar a isenção é na plataforma; o painel não tem esse controle.

## 6. Lentidão dos filtros

Causa (**código** e **execução**): cada clique de filtro refazia a página no
servidor, e a página buscava o **catálogo completo** na plataforma — todas as
colunas de todos os produtos, com descrição e imagens — para filtrar em memória
e mostrar 50 linhas. Não havia consulta repetida por produto nem índice
faltando: era uma leitura grande, repetida a cada clique.

Leitura do catálogo na plataforma, produção, mediana de 3, no próprio servidor:

| Loja | Produtos | Antes (completo) | Depois (`?resumo=1`) |
|---|---|---|---|
| Brilhax | 224 | 0,12 s · 1,05 MB | 0,06 s · 0,12 MB |
| PK Vedações | 803 | 0,36 s · 3,78 MB | 0,12 s · 0,44 MB |
| Vedashow | 5.634 | 1,82 s · 16,1 MB | 0,66 s · 2,88 MB |

E essa leitura deixa de acontecer a cada clique: fica guardada por um minuto.
No roteiro de validação, sete cliques de filtro seguidos fizeram **zero**
leituras do catálogo (**execução**, contando as chamadas recebidas pela
plataforma de teste).

Clique → lista atualizada, medido no navegador (Chromium, 224 produtos,
**servidor de desenvolvimento**, que é bem mais lento que o de produção): 0,4 a
0,7 s quando o resultado é vazio ("Sem foto", "Sem preço" e "Foto de outro
item", que na Brilhax dão zero) e 1,0 a 1,4 s quando há 25 linhas a desenhar
("Inativos"). O que sobra é o servidor montando a página, não a leitura do
catálogo. **Não verificado:** o tempo em produção depois do deploy, que exige
uma sessão de usuário.

Também corrigido: enquanto a consulta nova não chega, a lista antiga fica
esmaecida com "Atualizando a lista…" (`aria-busy`), em vez de parecer o
resultado do filtro novo; e duas aberturas simultâneas da mesma loja fazem uma
leitura só. A busca espera 350 ms depois da última tecla; seletor aplica na hora.

Nenhum índice foi criado: a consulta é `Produto` por `tenantId`, que já tem
índice, e o gargalo era volume de dados, não plano de execução.

## 7. Tipografia e CSS

Estilos computados no navegador (**execução**), antes do ajuste: tudo em Inter,
com duas exceções — SKU em monoespaçada (mantido: é identificador) e o **nome do
produto em 12px**, menor que o resto da própria linha. Causa: uma regra global
`th { font-size: 0.75rem }` (linha 941 de `globals.css`), e o nome é um `th` de
linha. Corrigido com regra da própria tabela, sem `!important`.

A página passa a usar uma régua só (`--fonte`; 0,9375 / 0,875 / 0,8125 /
0,75 rem; controles de 40 px, 44 px no celular) e algarismos tabulares em preço,
estoque e contagens, na mesma família. A regra global de `th` **não foi
alterada**: outras tabelas do painel dependem dela, e mudá-la pede conferência
tela por tela.

## 8. Validação executada

Roteiro no navegador (Playwright, Chromium), com o catálogo real da Brilhax
servido por uma plataforma de teste: **39 verificações, 39 passando** — busca
por SKU; ordenação A–Z, preço crescente e decrescente sobre o catálogo inteiro;
categoria + marca + situação (+ sem foto); indicador = lista; agrupar por
categoria e marca com contagem do grupo inteiro; paginação preservando a
consulta; 25/50/100; abrir produto e voltar à mesma consulta, página e linha;
colunas por usuário e loja; outra loja não enxerga este catálogo; desktop em
1440 e 1280 com preço e ações visíveis; celular (390 px) sem rolagem
horizontal, com folha de filtros ("Aplicar"/"Limpar"), alvos de 44 px e as
mesmas operações; zoom de 200%; sem erro de console.

Testes automatizados: `tests/unit/lojas-catalogo.test.ts` (regras),
`tests/unit/lojas-painel.test.ts` (inclui lojas por cliente).

## 9. Pendências concretas

1. Tempo dos filtros em produção, com sessão real.
2. Edição de produto pelo painel (preço, categoria, situação) pelo caminho que
   grava `HistoricoCatalogo` — hoje não existe, por decisão de escopo.
3. Autor (pessoa) no histórico de catálogo: a plataforma só registra a origem.
4. Controle de isenção de mensalidade no painel.
5. Divergência entre `Produto.estoque` e saldo por variante: não investigada.
6. Com catálogos bem maiores que o da Vedashow, a filtragem deve passar para a
   plataforma (SQL com paginação); hoje ela é feita no painel sobre a lista
   enxuta guardada em memória.
7. Preferência de colunas vive no navegador, não na conta: não acompanha a
   pessoa em outro computador.

# Score de crédito e contas a pagar (10/09/2026)

Tela `/financeiro/credito`, só para o dono. Responde três perguntas numa
página: como está o score do CPF, como está o score do CNPJ e o que há para
pagar.

## O que existe

- **Leituras de score** em `finance.credit_score_readings`: de quem (CPF ou
  CNPJ), de onde (Serasa, Boa Vista, Quod, SPC Brasil ou app do banco), o
  número, a escala (1000 ou 100), a data da leitura e uma nota. O documento em
  si não é gravado.
- **Cartão por documento** com a última leitura, a faixa (regras do Serasa:
  0–300 baixo, 301–500 regular, 501–700 bom, 701–1000 excelente, em proporção
  da escala), a variação contra a leitura anterior **do mesmo birô** e o alerta
  quando passam 30 dias sem conferir. Sem leitura, o cartão diz isso; nunca
  desenha um zero que pareceria score.
- **Contas a pagar em aberto**, com total, vencidas e as próximas oito por
  vencimento, na mesma lista das contas (`LedgerList`).
- **Onde conferir**: Serasa (CPF), Serasa Experian (CNPJ) e Registrato do Banco
  Central, que mostra empréstimos e dívidas em nome dos dois.

## Por que é registro manual

Nenhum birô abre API de score para pessoa física; o score de empresa é contrato
B2B da Serasa Experian. O app do banco mostra o número, mas não o expõe. A
rotina é: abrir o birô, ler, registrar na tela. Tarefa recorrente no Todoist
lembra todo mês.

## API

- `GET /api/credit-scores`: resumo por documento (sessão do dono).
- `POST /api/credit-scores`: `{ subjectKind: "CPF"|"CNPJ", bureau, score,
  maxScore?, readAt?, note? }`. Aceita sessão do dono **ou** `x-service-key`
  (o n8n), que grava `source = "N8N"`. Serve para o dia em que um fluxo
  conseguir ler o número de um e-mail de "seu score mudou".
- `DELETE /api/credit-scores/:id`: apaga uma leitura errada (sessão do dono).

Toda escrita entra em `finance.audit_events` (`CREDIT_SCORE_RECORDED`,
`CREDIT_SCORE_DELETED`).

## Migration

`prisma/migrations/20260910230000_credit_score_readings`, aditiva e
idempotente, aplicada à mão em produção em 10/09/2026 com
`--single-transaction -v ON_ERROR_STOP=1` (o `_prisma_migrations` é do
vizinho).

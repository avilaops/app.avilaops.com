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

## Meta: limpar o nome (11/09/2026)

O extrato do Serasa de 23/06/2026 (código WHJJ.LNCG.IIR6.ZV4L) trazia 13
anotações do CPF do Nicolas, anteriores à Ávila Ops: 9 dívidas negativadas e 4
protestos, R$ 199.221,22 no total. Foram lançadas como contas a pagar
`PESSOAL`, em aberto, com o vencimento original e `reference_type = "SERASA"`.

A tela ganhou o cartão **Meta: limpar o nome** (quanto falta, quanto já foi,
barra de progresso) e o bloco **Anotações no Serasa**, ordenado da menor para
a maior porque essa é a ordem de ataque de quem quita aos poucos. As "outras
contas a pagar" excluem essas 13 para não contar duas vezes.

O valor lançado é o anotado no extrato; o acordo pode sair por menos. Ao pagar,
dar baixa e anotar o valor pago na nota. Cancelada não conta nem como quitada
nem como pendente (anotação contestada ou baixada pelo credor).

**Defeito corrigido no caminho:** "Cancelar" conta nunca funcionou em produção.
A rota grava `CANCELLED` e o CHECK de 10/08 só aceitava `CANCELED`. Migration
`20260911010000_ledger_status_cancelled` recria o CHECK aceitando os dois.

Tarefas no Todoist: a meta (p2) e uma recorrente todo dia 20, "quitar ou
negociar uma anotação este mês".

# Régua automática de cobrança por e-mail

## Intenção

Enviar lembretes de cobrança sem depender de clique manual, interrompendo a régua assim que a fatura for paga ou cancelada e preservando a auditoria existente.

## Régua aprovada

• D−5 às 09:00 em `America/Sao_Paulo` • resumo amigável da fatura  
• D0 às 09:00 • fatura e meio de pagamento  
• D+3 às 09:00 • aviso de atraso com fatura e meio de pagamento  
• Falha do provedor • uma nova tentativa após 30 minutos  
• Fatura paga ou cancelada • qualquer envio pendente é cancelado

## Arquitetura

A fila vive no Postgres em `operations.billing_email_dispatches`. Cada item é único por fatura e etapa, guarda agendamento, estado, tentativas, erro e datas de processamento. O app reconcilia as três etapas para faturas abertas, cancela itens de faturas finais e reivindica itens vencidos antes de chamar o envio existente.

Uma rota interna autenticada por `x-service-key` processa lotes pequenos. O n8n chama essa rota periodicamente. Repetições do job não duplicam itens porque a chave única é `(invoice_id, stage)`; uma reivindicação com prazo impede dois workers de processarem o mesmo item ao mesmo tempo.

## Segurança e comportamento

• A régua nunca envia teste nem WhatsApp.  
• D−5 envia `fatura`; D0 e D+3 enviam `ambos`.  
• Sem cobrança ativa em D0 ou D+3, o item é recusado e auditado; o sistema não inventa link.  
• Itens vencidos há mais de 24 horas são ignorados para evitar disparar uma sequência antiga de uma vez.  
• O envio usa o destinatário cadastrado no momento do disparo.  
• Toda tentativa grava intenção e desfecho na auditoria com origem `regua-automatica`.  
• O painel da ficha do cliente mostra estado e horário das três etapas, com cancelamento individual para itens pendentes.

## Abordagens consideradas

1. Agenda somente no n8n • simples, mas esconde estado, idempotência e auditoria fora do sistema principal. Rejeitada.  
2. Fila no Postgres e n8n apenas como relógio • escolhida porque mantém regra, trava e evidência no app.  
3. Cron dentro do contêiner Next.js • rejeitada porque reinícios e múltiplas réplicas tornam o relógio menos previsível.

## Não objetivos

• Não alterar emissão de Pix, boleto ou PayPal.  
• Não criar régua por WhatsApp.  
• Não permitir cadências diferentes por cliente nesta entrega.  
• Não prometer entrega exatamente uma vez após uma queda entre o provedor aceitar o e-mail e o banco registrar o desfecho; esse caso fica evidenciado na auditoria.


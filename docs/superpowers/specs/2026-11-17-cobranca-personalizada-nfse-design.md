# Cobranças personalizadas • régua individual, boleto e NFS-e

## Intenção

Permitir que o dono controle, pela ficha do cliente no `app.avilaops.com`, cobranças avulsas completas: valor, descrição, vencimento, boleto, lembretes individuais e NFS-e. O app permanece responsável pelo relacionamento financeiro; o ERP em `C:\Users\nicol\source\P003` permanece responsável por toda operação fiscal.

## Decisões aprovadas

- `app.avilaops.com` orquestra • `erp.avilaops.com` emite.
- O boleto continua no Mercado Pago e vinculado à fatura do app.
- A NFS-e é emitida automaticamente após a confirmação do pagamento.
- A tela também oferece emissão manual para exceções elegíveis.
- O emitente é MEI estabelecido em Ribeirão Preto • SP, código IBGE `3543402`.
- A emissão usa exclusivamente o Ambiente Nacional da NFS-e • API da SEFIN Nacional. O MEI não usa o emissor municipal nesse fluxo.
- Bling não participa da solução.

## Abordagens consideradas

### App orquestra • ERP emite • escolhida

O app controla fatura, boleto, recebimento e comunicação. O ERP recebe um comando fiscal idempotente, valida, assina, transmite e preserva os artefatos oficiais. Evita duplicar certificado, schemas, regras fiscais e cancelamentos.

### ERP controla tudo

Levar cobrança e régua ao P003 centralizaria o processo, mas duplicaria ou migraria um módulo financeiro que já funciona no app. Aumenta escopo e risco sem melhorar a autoridade fiscal.

### App emite diretamente

Integração inicialmente menor, mas cria uma segunda implementação fiscal fora do ERP. Rejeitada por duplicar segredos, auditoria, layouts e manutenção legal.

## Escopo funcional no app

### Cobrança personalizada

Na ficha do cliente, somente o dono pode criar uma fatura avulsa informando:

- descrição do serviço;
- valor e moeda • inicialmente BRL;
- data de competência e vencimento;
- forma de cobrança • boleto ou PIX;
- emissão fiscal automática ligada ou desligada;
- código de serviço nacional, item da lista de serviços e descrição fiscal, preenchidos com padrões configuráveis e revisáveis;
- retenções e observações fiscais, quando aplicáveis;
- régua padrão, personalizada ou desativada.

A cobrança nasce como `SubscriptionInvoice` de tipo `CUSTOM`. Para não inventar uma assinatura técnica, a fatura passa a ter `organizationId` obrigatório e `subscriptionId` opcional. A migração preenche `organizationId` nas faturas existentes a partir da assinatura; faturas recorrentes continuam exigindo assinatura, enquanto `CUSTOM` exige `subscriptionId` nulo. A unicidade atual continua protegendo competências recorrentes e o PostgreSQL permite múltiplas faturas avulsas porque valores nulos não colidem no índice único. Ela participa do ledger, baixa, auditoria e conciliação existentes. O antigo gerador de link avulso do Mercado Pago deixa de ser o caminho recomendado porque não produz uma fatura rastreável.

### Controle individual

Cada fatura oferece:

- ativar ou pausar os lembretes;
- adicionar uma etapa em data e hora específicas;
- editar ou cancelar etapas ainda pendentes;
- escolher conteúdo • fatura, forma de pagamento ou ambos;
- enviar uma etapa imediatamente;
- consultar tentativas, erro e auditoria;
- restaurar a régua padrão somente para etapas futuras.

Etapas enviadas ou em processamento são imutáveis. Editar uma data vencida não provoca envio retroativo automático; o usuário escolhe enviar agora ou reagendar.

### Boleto e pagamento

O app usa o fluxo atual de `SubscriptionCharge` com Mercado Pago. A fatura guarda a cobrança emitida, link, linha digitável, vencimento e estado. Webhook confirmado baixa a fatura de forma idempotente e cria o comando de NFS-e quando a emissão automática estiver ligada.

## Escopo fiscal no ERP

### Autoridade e persistência

O P003 ganha um agregado próprio para NFS-e de saída, separado de NFS-e recebidas. Ele guarda:

- identificador interno e tenant;
- chave idempotente externa do app;
- referência da fatura do app;
- snapshot imutável de prestador, tomador, serviço, valores e tributação;
- DPS assinada e resposta original;
- chave, número, competência e estado da NFS-e;
- XML autorizado, hashes e representação para download;
- eventos, rejeições, consultas e cancelamentos;
- autor ou credencial de serviço que iniciou cada ação.

O ERP nunca reconstrói uma nota histórica a partir do cadastro atual. A emissão preserva o snapshot usado na transmissão.

### Integração Nacional

O `fiscal-engine` implementa DPS/NFS-e Nacional `v1.01`, assinatura com certificado A1 do emitente, validação XSD local e transporte mTLS para a SEFIN Nacional. Homologação usa Produção Restrita; produção permanece bloqueada até certificado, cadastro e cenários oficiais passarem.

Operações mínimas:

- emitir DPS e obter NFS-e;
- consultar processamento e situação;
- baixar XML autorizado;
- registrar e consultar eventos;
- cancelar quando a legislação e o estado permitirem.

O ERP deve distinguir rejeição fiscal permanente de indisponibilidade transitória. Só falhas transitórias recebem repetição automática com limite e backoff.

## Contrato entre app e ERP

O P003 já possui credenciais de serviço `erp_<tenant>_<secret>`, vinculadas ao tenant, armazenadas apenas por hash e revogáveis. O app usará uma credencial exclusiva chamada `app.avilaops.com • emissão fiscal`, enviada como `Authorization: Bearer ...`.

Endpoints privados propostos:

- `POST /api/v1/integrations/nfse/issuances` • solicita emissão;
- `GET /api/v1/integrations/nfse/issuances/{externalId}` • consulta estado;
- `GET /api/v1/integrations/nfse/issuances/{externalId}/xml` • baixa XML;
- `POST /api/v1/integrations/nfse/issuances/{externalId}/cancel` • solicita cancelamento.

Toda escrita exige `Idempotency-Key`. O `externalId` é o ID da fatura do app e só pode apontar para uma emissão no tenant. Repetir a mesma requisição devolve o mesmo resultado; repetir a chave com corpo diferente responde conflito.

O app não recebe o certificado, a senha nem detalhes de transporte fiscal. Ele guarda somente o ID fiscal, estado, número, chave, URLs internas e último erro seguro para exibição.

## Fluxos

### Criação e cobrança

1. O dono cria uma fatura personalizada na ficha do cliente.
2. O app valida cadastro financeiro e fiscal antes de emitir o boleto.
3. O Mercado Pago emite boleto ou PIX.
4. A régua individual agenda as etapas escolhidas.

### Pagamento e emissão automática

1. O webhook do Mercado Pago confirma o pagamento na fonte.
2. A baixa da fatura e a criação do comando fiscal ocorrem na mesma transação local.
3. Um processador reivindica o comando e chama o ERP com idempotência.
4. O ERP valida o snapshot e transmite a DPS.
5. O processador do app consulta estados não finais a cada cinco minutos e também permite atualização sob demanda na tela; não há callback fiscal na primeira versão.
6. O app mostra a nota e seus artefatos na fatura.
7. Falha fiscal não desfaz o pagamento; permanece visível como pendência fiscal.

### Emissão manual

O botão manual cria o mesmo comando idempotente. Ele não ignora cadastro incompleto, duplicidade, competência ou validação tributária. Serve para faturas pagas que tiveram a emissão automática desligada ou corrigida depois.

### Cancelamento

Cancelar fatura, boleto ou pagamento não cancela silenciosamente uma NFS-e autorizada. O dono solicita cancelamento fiscal em ação separada, informa justificativa e acompanha o evento retornado pelo ERP.

## Validações e bloqueios

- Cliente pessoa jurídica exige cadastro fiscal completo para emissão.
- MEI é dispensado para pessoa física quando a emissão não for solicitada; o app permite marcar a emissão fiscal como não exigida, com motivo auditável.
- Valor da NFS-e deve coincidir com o valor fiscal da fatura; desconto e retenção são campos explícitos.
- Competência é obrigatória e independente do vencimento e da data do pagamento.
- Nenhuma NFS-e é emitida duas vezes para a mesma fatura.
- Produção fiscal começa desabilitada e exige aprovação explícita após homologação.

## Segurança e auditoria

- Credencial ERP guardada no cofre do app e nunca enviada ao navegador.
- Certificado A1 e senha permanecem somente no cofre fiscal do ERP.
- Logs não contêm token, certificado, XML integral nem dados pessoais desnecessários.
- Toda criação, alteração de régua, emissão, rejeição, repetição e cancelamento gera auditoria.
- O app e o ERP correlacionam operações por `invoiceId`, `Idempotency-Key` e request ID.

## Testes e liberação

- Testes unitários de datas, idempotência, estados e validações.
- Testes de integração com bancos descartáveis nos dois repositórios.
- Fixtures oficiais e sintéticas da DPS/NFS-e Nacional sem dados reais.
- Testes do contrato app → ERP com credencial revogada, tenant incorreto, repetição e conflito.
- Testes em Produção Restrita com certificado do emitente.
- Liberação em duas chaves independentes • criação personalizada e emissão fiscal.
- Primeiro deploy com emissão fiscal desligada; ativação somente após evidência de homologação.

## Fora do escopo inicial

- NF-e de mercadorias, NFC-e e CT-e;
- integração com Bling ou outro ERP;
- parcelamento de uma única NFS-e em múltiplas faturas;
- emissão fiscal por municípios fora do Ambiente Nacional;
- cálculo contábil ou aconselhamento tributário automático.

## Chamadas do projeto

- Cobrança personalizada reutiliza `SubscriptionInvoice`; não cria um segundo contas a receber no app.
- O ERP cria seu registro fiscal próprio e não importa a fatura para o módulo geral de recebíveis.
- Padrões de serviço e tributação são configuráveis; o código não embute uma atividade específica da Ávila Ops.
- O processador fiscal é assíncrono e persistente; webhooks de pagamento não aguardam a SEFIN Nacional.
- A primeira versão sincroniza o estado por consulta idempotente; callback assinado fica fora do contrato inicial.

## Referências oficiais

- [Obrigatoriedade da NFS-e Nacional para MEI](https://www.gov.br/nfse/pt-br/nt-2023-001-obrigatoriedade-da-nfs-e-nacional-para-o-mei.pdf)
- [Documentação técnica atual da NFS-e Nacional](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual)
- [APIs de Produção Restrita e Produção](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/apis-prod-restrita-e-producao)
- [Município de Ribeirão Preto • código IBGE 3543402](https://www.ibge.gov.br/cidades-e-estados/sp/ribeirao-preto.html)

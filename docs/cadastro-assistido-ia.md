# Assistente de cadastro (Receita Federal + NF-e + IA)

Completa a ficha do cliente em `/clientes/[id]?section=registration`. Responde
três perguntas, nessa ordem: **o que falta**, **o que dá para preencher
sozinho** e **o que precisa ser perguntado ao cliente**.

Nada do que o assistente produz vira dado sem decisão de uma pessoa.

## Por que existe

O cadastro do cliente é a base da cobrança, do contrato, do site interno e do
SEO. Ficha pela metade trava tudo isso, e completar à mão significa repetir o
que a consulta de CNPJ já respondeu e redigir de novo o mesmo tipo de texto
comercial para cada cliente.

O que o assistente não faz é igualmente deliberado: ele não inventa telefone,
e-mail, documento nem endereço. Campo de dado verificável preenchido por
palpite é pior do que campo vazio, porque parece conferido.

## As três origens

O registro de campos (`src/lib/cadastro-ia/campos.ts`) é a única lista da
feature — análise, sugestão, schema do modelo e gravação leem dele. Cada campo
declara quem tem legitimidade para preenchê-lo:

| Origem | O que preenche | Como |
| --- | --- | --- |
| `RECEITA_FEDERAL` | Razão social, segmento (CNAE), endereço, telefone, e-mail | Lê `organizations.cnpj_data`, já guardado no cadastro. Sem rede, sem IA. |
| `SEFAZ` | Razão social, **inscrição estadual**, endereço, telefone, e-mail | Lê `organizations.sefaz_data`: o bloco `<dest>` da NF-e mais recente recebida, guardado pela sincronização fiscal. Sem rede, sem IA. |
| `IA` | Descrição da empresa, serviços, produtos, diferenciais, área de atendimento, segmento | Ávila AI Core em saída estruturada. |
| `CLIENTE` | Nome do responsável, WhatsApp, CPF do responsável, redes, site atual | Ninguém automatiza. Vira a lista "Só o cliente responde". |

### Por que a SEFAZ vale menos que a Receita

As duas são documento, mas não são a mesma coisa. A consulta de CNPJ é o
registro da empresa no órgão; o bloco `<dest>` é **o que um fornecedor
escreveu sobre o cliente** ao emitir uma nota para ele. Endereço de entrega e
dado desatualizado são casos comuns, não exceções.

Por isso a origem `SEFAZ` entra sempre depois da `RECEITA_FEDERAL` na ordem,
marca confiança `MEDIA` (a Receita marca `ALTA`) e a justificativa nomeia a
chave da nota e a data de emissão — quem revisa precisa poder perguntar "de
quando é isto?" sem sair da tela.

O que ela desbloqueia e nenhuma outra alcança: a **inscrição estadual**. Ela
não vem na consulta de CNPJ e a IA nunca poderia inventá-la; até aqui só
restava perguntar ao cliente.

### O que a SEFAZ NÃO traz, de propósito

Item de nota, fornecedor, valores e XML não são guardados. A sincronização
continua devolvendo tudo em memória para o módulo fiscal; o que fica gravado
em `sefaz_data` é apenas o bloco do destinatário.

A separação não é de escopo, é de natureza do dado. O bloco `<dest>` é dado do
cliente sobre o cliente — mesma natureza do `cnpj_data` que o cadastro já
guarda. Item de nota é dado fiscal de terceiro, com sigilo e retenção
próprios: guardá-lo para preencher campo de perfil comercial é outra
finalidade, e precisa estar no contrato com o cliente antes de estar no
código.

Se um dia os itens forem usados, o lugar certo deles é **o contexto da IA**,
não uma origem documental: o que a empresa compra é indício do que ela faz,
não declaração — e indício é exatamente o que a origem `IA` já trata, com as
barreiras que ela tem.

Documento, telefone, e-mail, CPF do responsável, inscrição estadual e endereço
**nunca** têm `IA` entre as origens, e um teste de unidade trava isso.

## Como o `sefaz_data` é preenchido

Pela sincronização fiscal que já existe (`/operacao/fiscal`, dono apenas). Ao
fim de uma sincronização bem-sucedida, a nota completa mais recente da leva
tem o bloco do destinatário extraído e gravado. Uma leva que só traz resumo
não grava nada — resumo não carrega esse bloco —, e uma nota mais antiga que a
já guardada não substitui a atual.

O assistente **nunca** chama a SEFAZ. Isso é deliberado: a distribuição de
DF-e tem ponteiro NSU e bloqueio anti-consumo indevido (rejeição 656, com
uma hora de espera). Uma tela de cadastro disparando consultas poderia
derrubar a sincronização fiscal, que importa mais.

## Como funciona

1. **Análise de lacunas** (`lacunas.ts`) — função pura sobre o retrato do
   cliente. Não consulta rede e não depende da IA estar ligada: com
   `AI_CORE_ENABLED=false` esta continua sendo a parte útil da tela. As
   origens contadas são as **efetivas**, não as do registro: sem `cnpj_data`
   a Receita não conta, sem `sefaz_data` a NF-e não conta.
2. **Geração** — `POST /api/organizations/[id]/cadastro/sugestoes` com
   `{ "origem": "RECEITA_FEDERAL" | "SEFAZ" | "IA" }`. Cada proposta entra na
   tabela `operations.organization_registration_suggestions` com status
   `PENDING`.
3. **Decisão** — `POST /api/organizations/[id]/cadastro/sugestoes/decidir` com
   `{ "aprovadas": [...], "descartadas": [...] }`. Só aqui algo é gravado na
   ficha, com quem decidiu, quando, e um evento em `operations.audit_events`.

`GET` na primeira rota devolve o painel inteiro (análise + fila) e funciona
com o Core desligado.

## As barreiras

Em ordem, do mais externo para o mais interno:

- **Enum fechado no schema.** O campo que o modelo pode nomear é um enum com
  as chaves de origem `IA`. Ele não consegue nomear um campo de documento nem
  um campo inexistente.
- **Filtro de saída** (`filtrarSugestoes`). Recusa campo fora do registro,
  campo que já tem valor, texto curto demais para revisão, proposta repetida
  e valor que contém sequência longa de dígitos — telefone, CNPJ ou CEP
  inventado em campo descritivo. Corta no tamanho da coluna.
- **Reconferência na gravação.** O campo é checado de novo no momento de
  aplicar: se alguém o preencheu enquanto a sugestão esperava, a sugestão vira
  `STALE` e o que estava escrito permanece. Trabalho de gente não é
  sobrescrito por decisão tomada com uma tela desatualizada.
- **Contexto mínimo.** Vai ao modelo só o que descreve a atividade da empresa
  (nome, CNAE, município, UF, porte, textos já cadastrados). Documento,
  telefone, e-mail, CPF e endereço ficam de fora — não ajudam a redigir texto
  comercial e não há razão para trafegar dado pessoal que o trabalho não usa.

## Custo, telemetria e limites

A chamada passa pelo `AiCoreStructuredClient`, então herda tudo que o Core já
tem: reserva de gasto antes da chamada, confirmação pelo custo real,
telemetria por organização e kill switch.

- Projeto no Core: `cadastro-assistido`. Agente: `cadastro-assistido-v1`.
- Modelo padrão: `gpt-4o-mini`.
- Teto por rodada: 8 sugestões.
- Limite de uso: 3 gerações por minuto, por admin e por cliente.
- O `request_id` gravado na sugestão é o mesmo de `ai_core.ai_core_telemetry`:
  dá para sair de um texto na ficha e chegar na chamada que o produziu, com
  modelo, tokens, custo e latência.

Para o teto de gasto valer, cadastre uma `AiCoreSpendPolicy` para
`(organizationId, projectId = "cadastro-assistido")`. Sem política cadastrada
o Core não bloqueia, mas também não hospeda gasto sem teto — ele apenas não
tem limite definido ainda.

## Ativação

O assistente aparece na aba de cadastro sempre. O botão **Preencher pela
Receita** funciona desde já para todo cliente com consulta de CNPJ guardada.

O botão **Redigir com IA** exige, nesta ordem:

1. `AI_CORE_ENABLED=true` no ambiente;
2. `AI_CORE_TOKEN_ENCRYPTION_KEY` configurado;
3. credencial OpenAI gravada para a organização, via `storeOpenAiKey`.

Faltando qualquer um, a rota responde `NOT_CONFIGURED` sem tentar chamada
nenhuma, e a tela diz isso em vez de dar erro.

## Editar antes de gravar

Não dá, por enquanto: aplicar grava o texto exato que está na tela. Para
ajustar a redação, aplique e edite na ficha logo abaixo — a alteração fica
registrada como edição de quem editou, e não como saída do modelo. A separação
é intencional: o que está guardado como sugestão é o que o modelo escreveu, e
não uma versão retocada depois.

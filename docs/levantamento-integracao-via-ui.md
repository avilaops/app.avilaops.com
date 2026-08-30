# O que falta para integrar um projeto novo 100% pela interface (30/08/2026)

> Regra da casa: "tudo tem que ser cadastrado via interface" (Nicolas,
> 18/08/2026). API sem tela é funcionalidade inexistente. Este levantamento
> pega a jornada de um cliente novo — do cadastro ao primeiro boleto — e diz,
> etapa por etapa, o que hoje é tela, o que é script, o que é formulário do
> n8n e o que é mão no servidor. Fonte: código do `app.avilaops.com` em
> `1cd0c45`, n8n e os docs de produto.

## 1. A jornada, etapa por etapa

| # | Etapa | Como é hoje | Estado |
|---|---|---|---|
| 1 | Cadastrar o cliente (organização, contatos, dossiê de 7 abas, CNPJ automático, domínio desejado com verificação) | `/clientes` → `OrganizationForm` → `/clientes/[id]` | **Tela** |
| 2 | Solicitação pública de acesso → aprovar | `/clientes/solicitacoes` → `POST /api/registration-requests/:id/approve` chama `cliente.avilaops.com/api/service/provision-client` | **Quebrado**: o portal foi apagado do Hetzner em 24/08. Aprovar hoje devolve "Falha ao provisionar" |
| 3 | Marcas do cliente | Só na criação da organização (`brands: { create }` aninhado) | **Meia tela**: não dá para adicionar marca depois |
| 4 | Projeto, tarefas, entregáveis | `/projetos` → `ProjectForm`, `TaskQuickAdd`, `DeliverableForm` | **Tela** |
| 5 | Cobrança avulsa do entregável (Pix/boleto Éfi, página pública `/entrega/[token]`) | `DeliverableForm` + `PaymentPanel` + webhook Éfi + n8n "Notificar Pagamento" | **Tela** |
| 6 | Mensalidade do cliente (assinatura + fatura de implantação) | `scripts/criar-assinatura.ts` — o próprio arquivo diz "existe porque a tela ainda não foi feita" | **Script**. A tela de assinatura que existe (`/financeiro/mercadopago`) só pausa/retoma/cancela/reajusta assinaturas de **lojas**, lendo da plataforma de lojas |
| 7 | Registrar o domínio | Verificação de disponibilidade na tela; registro no Porkbun/Registro.br à mão; zona Cloudflare à mão; `DomainAsset` só nasce quando o botão "Sincronizar Cloudflare" lê a zona | **Manual** (só a checagem é tela) |
| 8 | DNS padrão do domínio (o mesmo do avilaops.com) | À mão na Cloudflare, ou pelo n8n "Search Console — onboarding de domínio" (só o TXT) | **Manual** |
| 9 | E-mail profissional (caixa no mail.avilaops.com) | API de provisionamento pronta; n8n "Auth — Criar caixa de e-mail" (30/08) chamado pelo `/admin` do auth | **Tela em outro sistema**: o app não tem botão; a ficha do cliente não sabe quais caixas ele tem |
| 10 | Acesso do cliente (login SSO) | `auth.avilaops.com/admin` cria conta em `portal_clients` | **Tela em outro sistema**: a ficha do cliente não mostra nem cria o acesso |
| 11 | Loja virtual | Plataforma de lojas: "criar loja = INSERT"; formulário de onboarding vivia no portal apagado; n8n "Lojas — Onboarding" só reage a eventos | **Sem tela** para criar; o app só lê o estado |
| 12 | Site profissional | Repositório por domínio + deploy manual (`tar \| ssh`) | **Manual** — não é provisionamento, é obra |
| 13 | Google (GA4, GTM, Search Console, Perfil da Empresa) | Na ficha: campos de ID digitados à mão. Onboarding real é o **formulário n8n** "Google — onboarding de cliente" (30/08), que cria GA4 + GTM, verifica domínio, envia sitemap | **Formulário n8n**, desligado da ficha: o resultado não volta para o `OrganizationIntegration` |
| 14 | Meta (páginas, Instagram, anúncios, leads) | OAuth da conta da Ávila em `/operacao/meta`; por cliente só o "Meta Business ID" digitado | **Tela para a Ávila**, manual por cliente |
| 15 | WhatsApp Business | Uma conta, toda em variável de ambiente (`WHATSAPP_*`) | **Env**: não existe "por cliente" |
| 16 | Cofre de credenciais por cliente (`OrganizationIntegrationConnection`) | Criado só pelo OAuth da Meta e pelo `scripts/sync-openai-project.ts` | **Sem tela** (a ficha até avisa: "use o cofre de integrações", mas o cofre não tem UI) |
| 17 | Etapas do onboarding (`OrganizationOnboardingStep`, estágio no dossiê) | Select manual "Cadastro básico → … → Publicação" | **Manual**: nada avança sozinho quando a etapa acontece |
| 18 | Rotinas: auditoria SEO, PageSpeed, links, expiração de domínio, IndexNow, Bing | n8n "Rodada Diária" chama as seis rotas | **Automático** |
| 19 | Rotina: sincronizar o Éfi | Botão "Sincronizar agora" ou `npm run efi:sync` | **Manual** — sem cron; o saldo do painel envelhece |
| 20 | Saúde semanal (`/api/reports/weekly-health/run`) e renovação de domínios (`/api/domains/check-renewals/run`) | Rotas com `x-service-key`; a Rodada Diária cobre expiração; saúde semanal sem chamador conhecido | **Meio automático** |

## 2. Scripts que ainda substituem tela

| Script | O que faz | Tela que falta |
|---|---|---|
| `criar-assinatura.ts` | Mensalidade + fatura de implantação | Etapa 6 |
| `sync-openai-project.ts` | Grava o projeto OpenAI na conexão do cliente | Etapa 16 |
| `efi-chave-pix.ts`, `efi-testa-pix.ts`, `efi-homologacao.ts` | Operação única da conta Éfi | Nenhuma — é ferramenta de quem administra a conta, uma vez |
| `importar-wise.ts`, `newsletter-import.ts`, `seed-job-postings.ts` | Carga inicial em volume | Nenhuma — a tela existe para o dia a dia (`/financeiro/importar`, `/operacao/newsletter`, `/vagas`) |
| `reset-admin-password.ts`, `check-admin.ts` | Contas de admin | Já é tela no `auth.avilaops.com/admin` |

## 3. O que construir, na ordem que destrava venda

Ordem pelo que a meta de 30 dias precisa (5 clientes pagando recorrência;
pacote "site + domínio + e-mail" com 2 fechamentos):

1. **Consertar a aprovação de acesso** (etapa 2). Trocar a chamada ao portal
   morto por: criar a conta em `portal_clients` pela API do `auth.avilaops.com`
   (ou pelo n8n "Auth — Criar caixa", que já fala com o auth), mandar a senha
   provisória, marcar a solicitação. Sem isso, o formulário público está
   coletando pedidos que ninguém consegue aprovar. **1 dia.**
2. **Assinatura na ficha do cliente** (etapa 6). Aba "Cobrança": escolher um
   plano do catálogo (`ServicePlan`) → cria `Subscription` + fatura de
   implantação, mostra faturas e estado, botões pausar/retomar/cancelar. A
   lógica já está em `lib/assinaturas.ts`; falta a tela e a rota `POST`.
   Aposentar o script. **2 dias.**
3. **Domínio e e-mail em um clique** (etapas 7–9). Na ficha, "Adicionar
   domínio": registra no Porkbun pela API (ou recebe um já registrado), cria a
   zona na Cloudflare, aplica o DNS padrão da casa, cria `DomainAsset`, e
   "Criar caixa" chama o mail.avilaops.com. Mostrar as caixas do cliente na
   ficha. Reaproveita a chave global da Cloudflare e a API do mail que já
   existem. **3 dias.** É o pacote de entrada inteiro virando tela.
4. **Acesso do cliente na ficha** (etapa 10). "Criar acesso" e "Reenviar
   senha" chamando o auth; lista de contas vinculadas. **1 dia.**
5. **Google pela ficha** (etapa 13). Botão que dispara o sub-workflow n8n
   com os dados do cliente e grava GA4/GTM/Search Console de volta em
   `OrganizationIntegration` quando o n8n responder. **1 dia** — o workflow
   já existe.
6. **Cofre de credenciais** (etapa 16). Tela na aba Integrações: provedor,
   rótulo, segredo cifrado com a chave já existente, teste de conexão.
   Aposenta `sync-openai-project.ts`. **1 dia.**
7. **Marcas depois da criação** (etapa 3). Lista + "Nova marca" na aba
   Identidade. **Meio dia.**
8. **Criar loja pela ficha** (etapa 11). Botão que chama a API admin da
   plataforma de lojas (`lib/lojas-plataforma.ts` já é o cliente dela) com
   plano, domínio e dono; a plataforma continua dona do estado. **1 dia** no
   app + o endpoint do lado das lojas.
9. **Etapas do onboarding automáticas** (etapa 17). Cada ação acima marca a
   sua etapa; o estágio deixa de ser um select. **Meio dia**, depois dos
   itens acima.
10. **Cron do Éfi** (etapa 19). Um agendamento no n8n chamando
    `/api/integrations/efi/sync` com service key — hoje a rota só aceita
    sessão de admin, então precisa aceitar `x-service-key` como as outras.
    **Meio dia.**

Fora da lista, por decisão e não por esquecimento: **site profissional** (12)
continua sendo entrega de projeto, não provisionamento; **Meta e WhatsApp por
cliente** (14–15) exigem multi-tenant da conta da Meta e só compensam quando
houver cliente pagando por gestão de anúncios ou atendimento.

Total das dez: **~12 dias de código**, todos na coluna do Antigravity, cada
um com a razão comercial acima. Nenhum precisa de decisão de preço.

## 4. O que precisa de decisão do conselho

- Registro de domínio pela API do Porkbun (item 3) em nome da Ávila ou do
  cliente? Hoje a memória diz: titular no Whois é o cliente. A API registra
  com os dados que mandarmos — precisa do contato do titular na ficha
  (`OrganizationContact` já tem).
- Assinatura (item 2) cobra pelo Mercado Pago (como as lojas) ou pelo Éfi
  (como os entregáveis)? `lib/assinaturas.ts` foi escrito para Éfi; a
  plataforma de lojas usa MP. Duas cobranças recorrentes em dois gateways é
  o que o levantamento de 18/08 quis evitar.

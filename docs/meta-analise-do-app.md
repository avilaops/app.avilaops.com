# App Review da Meta — textos para colar

Textos prontos para a etapa **Uso permitido** da Solicitação de análise do app
`1795781868119400`. Cada bloco vai no campo "Forneça uma descrição detalhada de
como seu aplicativo usa a permissão".

Escrito para o analista da Meta, não para uso interno: por isso descreve o
produto de fora para dentro, cita a tela onde a permissão aparece e evita
jargão do repositório.

## Antes de tudo: tire `manage_fundraisers` do envio

Nenhuma linha do parque usa arrecadação de fundos — a busca por
`fundrais|arrecada` não retorna nada. A permissão entrou junto porque o caso de
uso "compartilhamento ou criação de campanhas de arrecadação de fundos" veio
ligado por padrão.

Pedir permissão que não dá para demonstrar em screencast é motivo comum de
recusa, e uma recusa trava o envio inteiro, não só aquele item. No topo da tela
há o link **"Se precisar remover alguma permissão do seu envio, edite-o"** —
use antes de enviar.

## Descrição do negócio (uma frase)

> Somos uma empresa de tecnologia que fornece uma plataforma de gestão para
> pequenas e médias empresas brasileiras, centralizando atendimento no WhatsApp,
> presença em redes sociais, captação de leads e acompanhamento de campanhas.

---

## business_management

> Nossa plataforma é usada por empresas clientes que nos contratam para
> administrar a presença digital delas. Depois que o cliente autoriza o acesso
> pelo Login do Facebook para Empresas, usamos business_management para ler a
> estrutura do portfólio empresarial dele — quais Páginas, contas do Instagram,
> contas de anúncio e contas do WhatsApp existem — e exibir tudo em um painel
> único dentro da nossa plataforma.
>
> Sem essa permissão, o cliente teria que informar manualmente os identificadores
> de cada ativo, e nós não teríamos como confirmar que aqueles ativos realmente
> pertencem a ele. A leitura acontece uma vez na conexão e depois em
> sincronizações periódicas para refletir ativos adicionados ou removidos. Não
> criamos, alteramos nem excluímos nada no portfólio do cliente.

## pages_show_list

> Usamos pages_show_list para listar as Páginas do Facebook que a pessoa
> administra, logo depois que ela conecta a conta à nossa plataforma. A lista
> aparece em uma tela de seleção onde ela escolhe quais Páginas quer que a
> plataforma acompanhe.
>
> É o primeiro passo de qualquer integração nossa: sem a lista, a pessoa não tem
> como indicar de qual Página estamos falando, e não conseguiríamos vincular os
> dados às empresas certas. Guardamos apenas o identificador e o nome das Páginas
> que a própria pessoa selecionou.

## pages_read_engagement

> Depois que o cliente seleciona as Páginas, usamos pages_read_engagement para
> ler as métricas de engajamento e montar o relatório de desempenho que
> entregamos a ele — alcance, interações e evolução ao longo do tempo.
>
> É o que sustenta a parte de relatórios do nosso serviço: o cliente nos contrata
> justamente para acompanhar esse desempenho sem precisar abrir várias
> ferramentas da Meta. Somente leitura; não publicamos nem respondemos nada.

## instagram_basic

> Usamos instagram_basic para identificar a conta profissional do Instagram
> vinculada a cada Página que o cliente conectou, e para ler dados básicos do
> perfil — nome de usuário, foto, número de seguidores e de publicações.
>
> Esses dados aparecem no mesmo painel que consolida Facebook, Instagram e
> WhatsApp, para o cliente ver a presença digital inteira em um lugar só. Sem a
> permissão, o painel mostraria a Página do Facebook e deixaria o Instagram de
> fora, que é metade do que o cliente contrata.

## ads_read

> Usamos ads_read para ler as campanhas publicitárias das contas de anúncio que o
> cliente autorizou, junto com as métricas de desempenho — investimento,
> impressões, cliques e resultados por campanha.
>
> Montamos com isso o relatório de mídia paga que entregamos ao cliente, na mesma
> tela dos dados orgânicos, para ele comparar os dois. É leitura apenas: não
> criamos, pausamos nem editamos campanhas, e não gastamos verba.

## leads_retrieval

> Nossos clientes veiculam anúncios com formulário de cadastro (Lead Ads). Usamos
> leads_retrieval para receber esses cadastros e entregá-los ao cliente dentro da
> nossa plataforma, onde a equipe dele faz o atendimento e acompanha o andamento
> de cada contato.
>
> É o que dá utilidade prática ao anúncio: sem a permissão, o cliente teria que
> baixar planilha no Gerenciador de Anúncios e importar manualmente, o que atrasa
> o retorno ao interessado em horas ou dias. Recebemos os cadastros por webhook,
> assim que acontecem, e eles ficam visíveis apenas para o cliente dono do
> anúncio.

## whatsapp_business_management

> Usamos whatsapp_business_management para configurar e manter a conta do
> WhatsApp Business do cliente depois que ele a conecta pelo Cadastro Incorporado
> — ler os números de telefone da conta, o status de verificação e os modelos de
> mensagem aprovados.
>
> É o que permite ao cliente ver dentro da nossa plataforma se o número está
> ativo, qual a qualidade dele e quais modelos estão liberados, sem precisar
> abrir o Gerenciador do WhatsApp.

## whatsapp_business_messaging

> Nossos clientes usam nossa plataforma como ferramenta de atendimento ao
> consumidor pelo WhatsApp. Usamos whatsapp_business_messaging para receber as
> mensagens enviadas pelos consumidores ao número da empresa e para enviar as
> respostas escritas pela equipe de atendimento do cliente.
>
> Toda conversa começa pelo consumidor ou por um modelo de mensagem previamente
> aprovado pela Meta, dentro da janela de atendimento permitida. Não enviamos
> mensagem não solicitada, e cada empresa só acessa as conversas do próprio
> número.

## catalog_management

> Nossos clientes de varejo mantêm um catálogo de produtos ligado ao WhatsApp.
> Usamos catalog_management para sincronizar esse catálogo com o estoque que o
> cliente já cadastra na nossa plataforma, mantendo preço e disponibilidade
> atualizados sem digitação dupla.
>
> Quem edita o catálogo é sempre o cliente, dentro do painel dele; nós só
> replicamos a alteração para a Meta.

## threads_business_basic

> Usamos threads_business_basic para identificar a conta do Threads associada à
> conta do Instagram que o cliente já conectou, e para ler dados básicos do
> perfil.
>
> Isso completa o painel de presença digital: o cliente vê Facebook, Instagram e
> Threads lado a lado, sem precisar informar manualmente qual conta do Threads é
> dele. Somente leitura.

---

## Sobre o screencast

Cada permissão pede uma gravação. O que a Meta espera ver, na ordem:

1. Uma pessoa entrando na plataforma como cliente.
2. O fluxo de autorização do Login do Facebook para Empresas **inteiro**, da
   tela de consentimento até a volta para a plataforma. A Meta recusa gravação
   que começa com a conta já conectada.
3. A tela onde o dado obtido por aquela permissão aparece.

Dá para gravar um único vídeo passando por todas as telas e enviar o mesmo
arquivo em cada permissão, desde que a tela específica de cada uma apareça nele.

## Ordem de envio — decidido em 18/09/2026

Vai **tudo**: as seis do Hub Social mais WhatsApp, catálogo e Threads. A única
mudança no envio é tirar `manage_fundraisers`, que não tem implementação.

O envio acontece **depois** de fechar a reconstrução da integração (app novo,
cofre de credenciais e a pendência do número do WhatsApp). Motivo: o screencast
precisa mostrar a tela funcionando, e a parte de WhatsApp só fica gravável
quando houver número definido na WABA.

Ordem prática:

1. Resolver o número do WhatsApp e assinar os webhooks no painel.
2. Conectar um cliente de verdade pelo Hub Social e conferir que os contadores
   saem de zero.
3. Gravar o screencast único, do consentimento até cada tela.
4. Enviar as dez permissões de uma vez.

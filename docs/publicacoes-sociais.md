# Publicações dentro do Ávila OS

## Escopo

O painel em `/hub-social/estudio/publicacoes` pertence ao app. Não usa Todoist
nem n8n. Acesso de equipe passa por `getAdmin()`; clientes não recebem acesso
às rotas internas. Apenas OWNER configura credenciais/destinos e autoriza
repetição ou conferência de entregas.

Cada perfil pertence a uma organização. A tela permite cadastrar perfis,
salvar/editar rascunhos, aprovar/agendar, cancelar antes do primeiro envio e
acompanhar o estado de cada canal. A listagem mostra as 200 publicações mais
recentes pelo agendamento. As 100 mídias concluídas mais recentes do Estúdio
podem ser selecionadas; a empresa e o formato precisam coincidir com o perfil.

## Banco e execução

A migration `20260927010000_publicacoes_sociais` cria cinco tabelas aditivas
em `operations`: perfis, destinos, publicações, entregas e eventos. Não
modifica cadastros ou credenciais existentes, nem cria perfis fictícios.

- UUID enviado pelo formulário impede duplicação por reenvio da requisição.
- Aprovação congela os destinos, cria uma entrega por canal e registra o autor.
- Versão do rascunho impede gravação sobre uma edição mais recente.
- Postgres reserva o post e sua entrega com `FOR UPDATE SKIP LOCKED`.
- A reserva dura cinco minutos e cada checkpoint a renova.
- Chamada externa tem timeout de 25 segundos; resultado ambíguo vai para
  `RECONCILIAR`, sem reenvio automático. Processo interrompido segue a mesma regra.
- Erro transitório conhecido usa espera exponencial e até cinco tentativas.
- Todos os canais obrigatórios precisam de ID externo confirmado para concluir.
- ID externo, URL, motivo de erro e eventos são persistidos. Logs não recebem
  token nem corpo bruto da resposta do provedor.
- OWNER pode repetir falha em quarentena após registrar a correção. Resultado
  ambíguo exige informar o ID externo e verificá-lo no destino pela API.
- A tela mostra as entregas que precisam de atenção; alerta externo ainda não
  está conectado a e-mail/WhatsApp e não deve ser considerado entregue.

## Conectores e limites atuais

| Canal | Implementado | Ainda pendente |
|---|---|---|
| Instagram (Facebook Login) | Contêiner, consulta de processamento, publicação, ID e permalink | Validar contas/permissões reais; carrosséis |
| Facebook | Texto, link e imagem em página | Vídeo, validação de permissões reais |
| Reddit | Texto `self` e link, erros de negócio, ID e URL | Upload nativo de imagem/vídeo; autorização dos perfis |
| TikTok | Cadastro de destino e bloqueio explícito de aprovação | Integração aprovada e UX exigida pela plataforma |
| WhatsApp | Cadastro de destino e bloqueio explícito de aprovação | Validar destino suportado; comunidade pelo nome não é endereço de API |

O cadastro consulta o destino antes de habilitá-lo. Isso prova acesso de leitura,
não prova escopo de publicação. Um token consultável pode ser recusado no envio;
o resultado real sempre determina o estado da entrega. Conta/perfil não informado
não é inferido a partir de label ou nome comercial.

Referências de contrato: [publicação Instagram](https://developers.facebook.com/docs/instagram-platform/content-publishing/),
[API Reddit](https://www.reddit.com/dev/api/#POST_api_submit),
[diretrizes TikTok](https://developers.tiktok.com/docs/en/content-sharing-guidelines).
O TikTok restringe ferramentas limitadas ao uso interno da equipe; liberar esse
canal exige resolver a elegibilidade do produto, não apenas cadastrar um token.

## Configuração

1. Aplicar a migration no banco do app, usando o fluxo de deploy vigente.
2. Para Meta, usar `META_EMPRESA`: o app recupera a conexão cifrada da organização
   do perfil e verifica que o ID selecionado é administrado por ela. Conexão
   revogada ou expirada é recusada. Para tokens individuais, cadastrar no cofre
   referências
   `SOCIAL_<PERFIL>_<CANAL>_TOKEN`. A tela recebe a referência, nunca o segredo.
3. Configurar `SOCIAL_WORKER_TOKEN` no app e no processo do worker.
4. Configurar `SOCIAL_MEDIA_SIGNING_KEY` com pelo menos 32 caracteres e `APP_URL`
   HTTPS. O worker gera links de mídia assinados com uma hora de validade,
   servidos com suporte a Range. O Estúdio não é tornado público por inteiro.
5. Executar `node scripts/publicacoes-worker.mjs` com `SOCIAL_WORKER_URL` apontando
   para `/api/internal/publicacoes/processar`. Há um modelo systemd em
   `deploy/publicacoes-worker.service`; usuário e diretório precisam corresponder
   ao host real. O intervalo é 30 segundos, sem cron no navegador.
6. Cadastrar perfil, conectar destino e validar entrega controlada antes de
   liberar uso editorial. Não ativar o JSON antigo do repositório canal-memes.

## Verificação

- `tests/unit/publicacoes.test.ts`: contrato editorial, Instagram em duas etapas,
  checkpoint, Reddit e classificação de falhas.
- `tests/unit/publicacoes-midia.test.ts`: expiração e integridade dos links.
- `tests/integration/publicacoes.test.ts`: Postgres real, criação concorrente,
  reserva, consolidação, conflito de versão e queda após iniciar uma entrega.

Teste de unidade ou banco não comprova publicação nas redes. Implantação e
validação com as contas reais devem ser registradas separadamente.

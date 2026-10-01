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

## Rede editorial importada

`node scripts/publicacoes-importar-rede.mjs <organizationId>` importa os sete
perfis do material do Nicolas. O destino é obrigatório e a empresa precisa estar
ativa. A execução é transacional e repetível: não sobrescreve configurações
existentes. Subreddits têm nomes explícitos e começam desabilitados, com uma
referência individual de cofre ainda sem token. Nomes de Instagram/Facebook não
são convertidos em IDs de API. O script não publica conteúdo.

| Perfil | E-mail de cadastro informado | Conversão editorial recomendada |
|---|---|---|
| Engenheiro Confuso | engenheiroconfuso@avilaops.com | Arxis / EngOps |
| Engenharia Descomplicada | engdescomplicada@avilaops.com | Arxis / Ávila Ops |
| Chef Confuso | chefconfuso@avilaops.com | Comandeiro |
| Contador Confuso | contadorconfuso@avilaops.com | CIFRA / Ávila Ops |
| Vendedor Confuso | vendedorconfuso@avilaops.com | CRM / Lojas Ávila Ops |
| Gestor Confuso | gestorconfuso@avilaops.com | Ávila Ops |
| Dog da Confusão | dogdaconfusao@avilaops.com | Saúde Pet |

Essas conversões são diretrizes fornecidas no pedido, não links publicados nem
declaração de propriedade dos produtos/clientes. A TV não foi usada como destino
comercial. Confirmar a URL pública antes de inserir uma chamada no conteúdo.

## Implantação e evidências — 27/09/2026

- PR de aplicação: `avilaops/app.avilaops.com#56`, branch `codex/hub-publicacoes`.
- Produção preservada: base `bffbfc7` mais a mudança social, código `4612828`,
  disponível em `codex/hub-publicacoes-release`. O núcleo ainda não estava na main.
- Imagem: `avilaops-app:publicacoes-4612828`. Health público confirmou `ok` e esse
  commit. O pacote passou na verificação de 210 manifests sem arquivos de ambiente
  nem artefatos de teste. Build, TypeScript e lint passaram (7 avisos anteriores).
- 526 testes na base main; 561 na release integrada com o núcleo. O importador foi
  executado duas vezes em banco descartável: criou 7 perfis na primeira, 0 na
  segunda. Nenhum destino ficou ativo.
- Teste de navegador: criação/persistência de rascunho, recusa de aprovação sem
  destino conectado, temas claro/escuro e celular sem transbordamento horizontal.
- Aplicada somente `20260927010000_publicacoes_sociais`, em transação com limite
  de lock e recibo Prisma. As cinco tabelas pertencem a `app_avila`. SHA256 da
  migration: `eb131f617f404dbe20ef7f0f946e892220ed13cae90a27db5a219a564dbe7eb2`.
- Backup anterior no host `applications`:
  `/var/backups/avilaops/publicacoes-20260927-4612828/cliente_portal.dump`.
  Índice validado; restauração integral não ensaiada. SHA256:
  `594fa5d5319f333e561759cd61c6cf6b10efd776fbb2be842b57298b92dc4200`.
- Worker nativo: `avila-publicacoes-worker.service`, com usuário dinâmico e
  arquivo de ambiente restrito. Retornou HTTP 200 e zero entregas processadas.
  Página sem sessão redireciona (307), API e worker sem token recusam (401).
- GitHub Actions não iniciou os jobs por cobrança/limite da conta. Os testes e
  build acima foram executados fora do Actions; o PR permanece aberto.

O acesso autenticado à tela foi testado no ambiente descartável. Não houve
publicação real nas redes nem teste de consentimento com as contas da rede.
Configurar e autorizar os destinos continua sendo necessário. TikTok, WhatsApp e
formatos não implementados permanecem bloqueados conforme a tabela de suporte.

Para retorno da aplicação, a imagem `avilaops-app:core-bffbfc7` e o compose anterior
estão preservados. Parar o worker antes do retorno e restaurar apenas a aplicação;
não apagar tabelas nem sobrescrever o banco com o backup automaticamente.

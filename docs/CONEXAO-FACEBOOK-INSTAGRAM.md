# Conectar redes sociais por empresa

Na tela Hub Social → Meta, selecionar a empresa antes de autorizar.

- **Entrar com Facebook:** usa o OAuth Meta existente e permite consultar Páginas e contas profissionais do Instagram associadas.
- **Entrar com Instagram:** usa o login direto de contas profissionais, com `INSTAGRAM_APP_ID` e `INSTAGRAM_APP_SECRET` próprios. Sem as duas credenciais, a opção aparece desabilitada com explicação.

Callback do Instagram: `https://app.avilaops.com/api/integrations/instagram/oauth/callback`. Cadastrar este endereço na configuração do Instagram no painel Meta. Não substituir pelo callback do Facebook nem reutilizar automaticamente seu App Secret.

A autorização valida sessão administrativa, empresa ativa e estado aleatório vinculado ao usuário. A gravação transacional mantém token cifrado em `organization_integration_connections`, perfil em `instagram_accounts` e autorização em `core.connections`. Uma conta já atribuída a outra empresa é recusada. Conectar uma rede não implementa publicação de posts.

Migration aditiva: `20260919210000_instagram_login`. Aplicar antes da imagem que consulta os novos campos. Este incremento não foi publicado junto com a versão anterior `bffbfc7`.

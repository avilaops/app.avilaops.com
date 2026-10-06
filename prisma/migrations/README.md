# Identidade e nomes das migrações

Novas migrações usam `YYYYMMDDHHMMSS_descricao`, com 14 dígitos antes do
primeiro sublinhado. Escolha o nome antes de aplicar a migração em qualquer
ambiente e confira as dependências na ordem dos diretórios.

Depois de compartilhada ou aplicada, preserve a pasta e o conteúdo SQL da
migração. O nome da pasta identifica a entrada no histórico do Prisma;
renomeá-la pode fazer o Prisma tentar executar novamente o SQL em bancos que
já registraram o nome anterior. Uma correção de esquema deve entrar em uma
nova migração, sem reescrever o histórico existente.

## Exceção histórica

`20260919_projeto_descricao_url_arquivos` mantém o nome original de oito
dígitos. Não renomeie para `20260919130000_projeto_descricao_url_arquivos`.
O SQL contém um `ADD CONSTRAINT` que falha se for executado novamente após
a aplicação original. Estar pendente em produção não comprova que a migração
também esteja pendente nos bancos de desenvolvimento e de teste.

Este diretório e seu SQL permanecem iguais aos da `main` anterior à proposta
de renomeação do PR #82. Nenhuma reconciliação de histórico ou execução de SQL
é necessária por causa desta documentação.

Se algum ambiente aplicou a branch com o nome de 14 dígitos, interrompa a
publicação nesse ambiente e confira `_prisma_migrations` e o esquema antes de
prosseguir. Faça dump do banco antes de qualquer correção de dados ou histórico;
não marque uma migração como aplicada sem verificar o SQL e o estado real.

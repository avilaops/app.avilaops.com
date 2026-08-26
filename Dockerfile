# Imagem de RUNTIME. Não compila nada.
#
# O `next build` sai da máquina de desenvolvimento (`output: "standalone"` no
# next.config) e chega aqui pronto, em `standalone.tgz`. O motivo é o servidor:
# compilar aqui produzia uma imagem de 3,5 GB, e o disco do Docker vive acima de
# 90% — em 26/08/2026 um build chegou a compilar com sucesso e morrer no export
# da imagem, com 1,1 GB livres. Esta imagem fica na casa dos 500 MB.
#
# Mesma receita já usada em cliente.avilaops.com e irlquest.
#
#   npm run build && (montar standalone.tgz) && docker compose up -d --build
FROM node:20-bookworm-slim

# O Prisma precisa do openssl no runtime. Sem ele o cliente cai no engine
# "openssl-1.1.x", que não existe nesta imagem, e a primeira consulta falha.
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ADD standalone.tgz /app/

# O Turbopack emite `require("@prisma/client-<hash>")` em ~111 arquivos, e quem
# cria esse nome apontando para `client` é o npm ao instalar no Linux. O bundle
# vem de uma máquina Windows, que não gera o symlink — sem recriá-lo aqui, a
# aplicação morre no primeiro require, já no ar.
#
# O hash muda a cada mudança de versão do Prisma, então é lido do próprio
# bundle em vez de ficar cravado.
RUN set -eu; \
    cd /app/node_modules/@prisma; \
    grep -rhos "@prisma/client-[0-9a-f]\{8,\}" /app/.next/server /app/server.js \
    | sed 's|@prisma/||' | sort -u | while read -r alvo; do \
        if [ ! -e "$alvo" ]; then ln -sfn client "$alvo"; echo "symlink $alvo -> client"; fi; \
    done; \
    test -e "$(grep -rhos '@prisma/client-[0-9a-f]\{8,\}' /app/.next/server | head -1 | sed 's|@prisma/||')"

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# Caminho explícito do engine: com o schema fora do bundle, a descoberta
# automática do Prisma erra o alvo e procura o binário do Windows.
ENV PRISMA_QUERY_ENGINE_LIBRARY=/app/node_modules/.prisma/client/libquery_engine-debian-openssl-3.0.x.so.node

EXPOSE 3000
CMD ["node", "server.js"]

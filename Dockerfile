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

# O mesmo apelido com hash acontece com qualquer pacote de escopo que o
# Turbopack externaliza: o @aws-sdk/client-s3 (upload de documento no cadastro)
# derrubou a tela de solicitações com "Cannot find module
# @aws-sdk/client-s3-<hash>", e o erro só aparecia em produção. A varredura
# abaixo é genérica: para todo `@escopo/pacote-<hash>` citado no bundle, cria o
# apelido apontando para o pacote real, quando ele existir.
RUN set -eu; \
    grep -rhos "@[a-z0-9-]\{2,\}/[a-z0-9._-]\{2,\}-[0-9a-f]\{8,\}" /app/.next/server /app/server.js \
    | sort -u | while read -r ref; do \
        escopo="${ref%%/*}"; resto="${ref#*/}"; real="${resto%-*}"; \
        if [ -d "/app/node_modules/$escopo/$real" ] && [ ! -e "/app/node_modules/$escopo/$resto" ]; then \
            ln -sfn "$real" "/app/node_modules/$escopo/$resto"; \
            echo "symlink $escopo/$resto -> $real"; \
        fi; \
    done

# ---------------------------------------------------------------------------
# Qual commit está rodando.
#
# Mesma correção feita no Comandeiro em 31/08/2026, e pelo mesmo motivo: sem
# isto nada no sistema sabe responder essa pergunta, e a árvore do servidor
# diverge do repositório sem ninguém perceber. Aqui a divergência já existia —
# o `/opt` estava 57 arquivos atrás da `main`.
#
# Fica no fim do arquivo de propósito: mais acima, mudar o SHA a cada commit
# invalidaria o cache do build e cada deploy recompilaria tudo.
# ---------------------------------------------------------------------------
ARG GIT_SHA=desconhecido
ARG BUILT_AT=desconhecido
ENV GIT_SHA=$GIT_SHA
ENV BUILT_AT=$BUILT_AT

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# Caminho explícito do engine: com o schema fora do bundle, a descoberta
# automática do Prisma erra o alvo e procura o binário do Windows.
ENV PRISMA_QUERY_ENGINE_LIBRARY=/app/node_modules/.prisma/client/libquery_engine-debian-openssl-3.0.x.so.node

EXPOSE 3000
CMD ["node", "server.js"]

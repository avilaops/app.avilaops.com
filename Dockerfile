# Build no GitHub Actions; o servidor recebe somente a imagem pronta.
FROM node:22-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
FROM base AS deps
COPY package.json package-lock.json ./
COPY packages ./packages
COPY prisma ./prisma
RUN npm ci
FROM deps AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# A checagem de tipos do `next build` passou de 1,8 GB (medido com
# `tsc --extendedDiagnostics`) e o teto padrão do Node 22 é ~2 GB: o build
# morria com "heap out of memory" em "Running TypeScript". Só vale neste
# estágio — a imagem final não herda.
ENV NODE_OPTIONS=--max-old-space-size=4096
RUN npm run build
FROM base AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma/client ./node_modules/@prisma/client
# `sharp` é externo (serverExternalPackages), e o rastreamento do standalone
# leva o pacote de libvips só pela casca: 20 KB com o index.js e sem o
# `libvips-cpp.so`, que tem 18 MB. Como a imagem final copia apenas o
# standalone, não sobra de onde carregar a biblioteca, e toda rota que gera
# imagem — peça do Estúdio, ícones da marca — morre com
# "ERR_DLOPEN_FAILED: libvips-cpp.so.8.18.3: cannot open shared object file".
COPY --from=build /app/node_modules/@img ./node_modules/@img
COPY --from=build /app/prisma ./prisma
ARG GIT_SHA=desconhecido
ARG BUILT_AT=desconhecido
ENV GIT_SHA=$GIT_SHA BUILT_AT=$BUILT_AT
ENV PRISMA_QUERY_ENGINE_LIBRARY=/app/node_modules/.prisma/client/libquery_engine-debian-openssl-3.0.x.so.node
EXPOSE 3000
CMD ["node", "server.js"]

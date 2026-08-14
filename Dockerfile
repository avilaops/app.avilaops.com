FROM node:20-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/avila-ai-core/package.json ./packages/avila-ai-core/package.json
RUN npm ci

COPY . .
RUN npx prisma generate
RUN NODE_OPTIONS="--max-old-space-size=3072" npx next build

EXPOSE 3000
CMD ["npm", "start"]

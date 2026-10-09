#!/usr/bin/env bash
# Publica o app.avilaops.com por SSH, sem GitHub Actions.
#
#   deploy/publicar.sh <ref-do-git>          # ex.: deploy/publicar.sh main
#
# Por que assim:
# - O build NÃO roda no servidor `applications`. Ele tem 3,8 GB de RAM e
#   nenhum swap; em 28/09/2026 o `next build` lá ficou 30 min em "Running
#   TypeScript", levou o load a 36 e o OOM killer matou apps de cliente.
#   O build roda na máquina que chama o script — o servidor `creators`, que
#   é o antigo `orchestrator` e tem 6 GB de swap — e a imagem atravessa pela
#   rede da Hetzner com `docker save | docker load`. O alias de SSH
#   `orchestrator` deixou de existir em 10/2026; para construir em outro
#   host, passe `BUILD_HOST=<alias>`.
# - O `creators` é também o servidor dos agentes (4 GB de RAM). Quando o build
#   é local e o `build-pesado` existe no PATH, o `docker build` passa por ele:
#   um build pesado por vez (quem chega depois espera a trava; sai com 75 se
#   ela não soltar no prazo). Só a trava: o heap de 4096 MB do Dockerfile fica
#   como está, porque o `next build` daqui não cabe em menos.
# - O container não roda migração. Se o ref tiver migração que o banco de
#   produção ainda não aplicou, o script para antes de trocar a imagem e diz
#   quais são: aplicar migração é decisão à parte, não efeito colateral.
#
# Precisa do host `applications` no ~/.ssh/config e de uns 4 GB livres em
# disco na máquina do build.
set -euo pipefail

REF="${1:?uso: deploy/publicar.sh <ref-do-git>}"
SHA="$(git rev-parse --short "$REF")"
TAG="avilaops-app:${SHA}"
BUILD_HOST="${BUILD_HOST:-local}"
BUILD_DIR="build/app-${SHA}"
APP_DIR="/opt/app-avilaops"
TMP="$(mktemp -d)"
BUILD_DIR_CRIADO=0

# Roda no host do build: aqui mesmo, ou por SSH quando BUILD_HOST aponta outro.
no_build() {
  if [ "$BUILD_HOST" = local ]; then bash -c "$1"; else ssh "$BUILD_HOST" "$1"; fi
}

# Em qualquer saída (fim, falha do build, 75 da trava do build-pesado, sinal)
# o diretório do build sai do host do build: são o código e o app.tgz de um
# commit, e ficavam para trás a cada deploy que parava no meio. Só apaga o que
# este script criou, e a falha da limpeza não muda o status de saída.
limpar() {
  rm -rf "$TMP"
  if [ "$BUILD_DIR_CRIADO" = 1 ]; then
    no_build "rm -rf ~/${BUILD_DIR}" \
      || echo "Aviso: não consegui apagar ~/${BUILD_DIR} do host do build (${BUILD_HOST}); apague à mão." >&2
  fi
}
trap limpar EXIT

echo "==> ${REF} (${SHA})"

echo "==> Conferindo se o ref contém o que está no ar"
# Produção nem sempre roda a `main`: em 28/09/2026 rodava a `main` mais os
# ramos codex/hub-publicacoes e o núcleo, ainda não mesclados. Publicar a
# `main` pura tiraria essas telas do ar sem ninguém perceber.
ATUAL="$(ssh applications "docker exec app-avilaops-app-1 printenv GIT_SHA" || true)"
git fetch -q origin || true
if [ -n "$ATUAL" ] && git cat-file -e "${ATUAL}^{commit}" 2>/dev/null; then
  if ! git merge-base --is-ancestor "$ATUAL" "$REF"; then
    echo "O que está no ar (${ATUAL}) não está contido em ${REF}; publicar removeria:" >&2
    git log --oneline "${REF}..${ATUAL}" | sed 's/^/  /' >&2
    [ "${FORCAR:-}" = 1 ] || { echo "Mescle antes, ou rode com FORCAR=1 se é isso mesmo." >&2; exit 1; }
  fi
else
  echo "Aviso: não achei o commit ${ATUAL:-desconhecido} do container no git local." >&2
fi

echo "==> Conferindo migrações pendentes em produção"
git ls-tree --name-only "$REF" prisma/migrations/ | xargs -n1 basename | grep -E '^[0-9]{14}_' | sort > "$TMP/no-ref"
# shellcheck disable=SC2029
ssh applications "U=\$(grep '^DATABASE_URL=' ${APP_DIR}/.env.production | cut -d= -f2- | tr -d '\"' | sed 's/[?&]schema=[^&]*//; s/host.docker.internal/127.0.0.1/'); psql \"\$U\" -X -At -c 'select migration_name from _prisma_migrations where finished_at is not null'" | sort > "$TMP/no-banco"
PENDENTES="$(comm -23 "$TMP/no-ref" "$TMP/no-banco")"
if [ -n "$PENDENTES" ]; then
  echo "Migrações do ${REF} que produção ainda não tem:" >&2
  echo "$PENDENTES" | sed 's/^/  - /' >&2
  echo "Aplique antes (e registre em _prisma_migrations) e rode de novo." >&2
  exit 1
fi

echo "==> Enviando o código para o build (${BUILD_HOST})"
git archive --format=tar.gz -o "$TMP/app.tgz" "$REF"
BUILD_DIR_CRIADO=1
no_build "rm -rf ~/${BUILD_DIR} && mkdir -p ~/${BUILD_DIR}"
if [ "$BUILD_HOST" = local ]; then
  cp "$TMP/app.tgz" ~/"${BUILD_DIR}/app.tgz"
else
  scp -q "$TMP/app.tgz" "${BUILD_HOST}:${BUILD_DIR}/app.tgz"
fi

echo "==> Build da imagem ${TAG} (uns 10 minutos)"
PESADO=""
if [ "$BUILD_HOST" = local ] && command -v build-pesado >/dev/null 2>&1; then
  PESADO="build-pesado "
fi
no_build "cd ~/${BUILD_DIR} && tar xzf app.tgz && ${PESADO}docker build -q \
  --build-arg GIT_SHA=${SHA} --build-arg BUILT_AT=\$(date -u +%FT%TZ) -t ${TAG} ."

echo "==> Levando a imagem para o applications"
# A cópia da imagem no host do build (~565 MB por deploy) só sai depois de o
# `applications` provar que a tem. Se o load falhar ou a tag não aparecer lá,
# ela fica onde está e o script para antes de trocar o container.
if ! no_build "docker save ${TAG} | gzip -1" | ssh applications "gunzip | docker load" | tee "$TMP/load.log"; then
  echo "Erro: o envio da ${TAG} (docker save | docker load) para o applications falhou. A imagem continua no host do build (${BUILD_HOST}); nada foi trocado em produção." >&2
  exit 1
fi
if ! ssh applications "docker image inspect ${TAG} >/dev/null 2>&1"; then
  echo "Erro: o docker load terminou, mas a tag ${TAG} não existe no applications. A imagem continua no host do build (${BUILD_HOST}); nada foi trocado em produção." >&2
  exit 1
fi

echo "==> Apagando a imagem ${TAG} do host do build (${BUILD_HOST})"
# Só esta tag, sem -f e sem prune. A tag pode já existir no applications de um
# deploy anterior do mesmo commit; por isso só apaga se o load disse que
# carregou esta. Falha aqui não derruba um deploy que deu certo: avisa e segue.
if grep -Eq "^Loaded image: (docker\.io/library/)?${TAG}\$" "$TMP/load.log"; then
  no_build "docker rmi ${TAG} >/dev/null" \
    || echo "Aviso: não consegui apagar a ${TAG} do host do build; apague à mão com 'docker rmi ${TAG}'." >&2
else
  echo "Aviso: o docker load não confirmou 'Loaded image: ${TAG}'; mantive a imagem no host do build." >&2
fi

echo "==> Trocando o container (backup do compose em deploy-backups/)"
ssh applications "cd ${APP_DIR} \
  && mkdir -p deploy-backups/\$(date +%Y%m%d)-${SHA} \
  && cp docker-compose.yml deploy-backups/\$(date +%Y%m%d)-${SHA}/ \
  && sed -i 's#image: avilaops-app:.*#image: ${TAG}#' docker-compose.yml \
  && docker compose up -d"

echo "==> Conferindo"
ssh applications "for i in \$(seq 1 40); do c=\$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3004/login); [ \"\$c\" = 307 ] || [ \"\$c\" = 200 ] && break; sleep 2; done; echo \"login: \$c\"; \
  echo \"GIT_SHA no container: \$(docker exec app-avilaops-app-1 printenv GIT_SHA)\""

echo "==> Publicado ${SHA}. Para voltar: copie o compose de ${APP_DIR}/deploy-backups/ e rode docker compose up -d."

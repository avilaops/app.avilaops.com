#!/usr/bin/env bash
# avila-server-health v2 — instalado em /usr/local/bin/avila-server-health nos
# dois hosts e disparado pelo avila-monitoring.timer a cada 15 s.
#
# v2 (16/09/2026): envia a hora da medição (observedAt, do relógio do host),
# os valores brutos que sustentam cada percentual, containers existentes e
# parados, hostname, versão do coletor e um request id que o backend grava e
# devolve. Antes a hora era carimbada pelo backend ao receber, e a tela dizia
# "há 2s" sobre uma leitura cuja idade real ninguém sabia.
set -euo pipefail

: "${MONITORING_INGEST_URL:?MONITORING_INGEST_URL ausente}"
: "${MONITORING_INGEST_TOKEN:?MONITORING_INGEST_TOKEN ausente}"
: "${MONITORING_SERVER_KEY:?MONITORING_SERVER_KEY ausente}"
: "${MONITORING_SERVER_NAME:?MONITORING_SERVER_NAME ausente}"

COLLECTOR_VERSION="avila-server-health/2"
request_id="host-${MONITORING_SERVER_KEY}-$(cat /proc/sys/kernel/random/uuid)"

# Hora da medição: antes de ler qualquer coisa.
observed_at=$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)

read -r mem_total mem_available < <(awk '/MemTotal/ {t=$2} /MemAvailable/ {a=$2} END {print t, a}' /proc/meminfo)
read -r swap_total swap_free < <(awk '/SwapTotal/ {t=$2} /SwapFree/ {f=$2} END {print t, f}' /proc/meminfo)
cpu_idle=$(LC_ALL=C top -bn2 -d .2 | awk '/Cpu\(s\)/ {idle=$8} END {print idle+0}')
cpu=$(awk -v idle="$cpu_idle" 'BEGIN {printf "%.2f", 100-idle}')
mem_used=$(awk -v t="$mem_total" -v a="$mem_available" 'BEGIN {printf "%.2f", (t-a)*100/t}')
mem_available_mb=$((mem_available / 1024))
swap_used=$(awk -v t="$swap_total" -v f="$swap_free" 'BEGIN {printf "%.2f", t ? (t-f)*100/t : 0}')
read -r disk_size_kb disk_used_kb disk disk_mount < <(df -P / | awk 'NR==2 {gsub(/%/,"",$5); print $2, $3, $5, $6}')
load1=$(awk '{print $1}' /proc/loadavg)
running=$(docker ps -q | wc -l | tr -d ' ')
unhealthy=$(docker ps --filter health=unhealthy -q | wc -l | tr -d ' ')
total=$(docker ps -aq | wc -l | tr -d ' ')
stopped=$((total - running))
host_name=$(hostname)

payload=$(printf '{"serverKey":"%s","serverName":"%s","cpuPercent":%s,"memoryUsedPercent":%s,"memoryAvailableMb":%s,"swapUsedPercent":%s,"diskUsedPercent":%s,"load1":%s,"containersRunning":%s,"containersUnhealthy":%s,"containersTotal":%s,"containersStopped":%s,"observedAt":"%s","collectorVersion":"%s","hostname":"%s","requestId":"%s","raw":{"cpu_idle":%s,"mem_total_kb":%s,"mem_available_kb":%s,"swap_total_kb":%s,"swap_free_kb":%s,"disk_size_kb":%s,"disk_used_kb":%s,"disk_mount":"%s","loadavg_1":%s}}' \
  "$MONITORING_SERVER_KEY" "$MONITORING_SERVER_NAME" "$cpu" "$mem_used" "$mem_available_mb" "$swap_used" "$disk" "$load1" "$running" "$unhealthy" "$total" "$stopped" \
  "$observed_at" "$COLLECTOR_VERSION" "$host_name" "$request_id" \
  "$cpu_idle" "$mem_total" "$mem_available" "$swap_total" "$swap_free" "$disk_size_kb" "$disk_used_kb" "$disk_mount" "$load1")

curl --fail --silent --show-error --max-time 10 \
  -H "Authorization: Bearer $MONITORING_INGEST_TOKEN" \
  -H "Content-Type: application/json" \
  -H "X-Request-Id: $request_id" \
  --data "$payload" "$MONITORING_INGEST_URL" >/dev/null

# Um único host dispara a rodada de URLs. Assim o histórico continua sendo
# coletado mesmo sem ninguém com o painel aberto, sem duplicar as 20 chamadas.
if [[ "$MONITORING_SERVER_KEY" == "apps-client" ]]; then
  curl --fail --silent --show-error --max-time 15 \
    -X POST -H "Authorization: Bearer $MONITORING_INGEST_TOKEN" \
    -H "X-Request-Id: ${request_id}-collect" \
    "${MONITORING_INGEST_URL%/servers}/collect" >/dev/null
fi

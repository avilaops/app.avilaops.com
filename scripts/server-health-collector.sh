#!/usr/bin/env bash
set -euo pipefail

: "${MONITORING_INGEST_URL:?MONITORING_INGEST_URL ausente}"
: "${MONITORING_INGEST_TOKEN:?MONITORING_INGEST_TOKEN ausente}"
: "${MONITORING_SERVER_KEY:?MONITORING_SERVER_KEY ausente}"
: "${MONITORING_SERVER_NAME:?MONITORING_SERVER_NAME ausente}"

read -r mem_total mem_available < <(awk '/MemTotal/ {t=$2} /MemAvailable/ {a=$2} END {print t, a}' /proc/meminfo)
read -r swap_total swap_free < <(awk '/SwapTotal/ {t=$2} /SwapFree/ {f=$2} END {print t, f}' /proc/meminfo)
cpu_idle=$(LC_ALL=C top -bn2 -d .2 | awk '/Cpu\(s\)/ {idle=$8} END {print idle+0}')
cpu=$(awk -v idle="$cpu_idle" 'BEGIN {printf "%.2f", 100-idle}')
mem_used=$(awk -v t="$mem_total" -v a="$mem_available" 'BEGIN {printf "%.2f", (t-a)*100/t}')
mem_available_mb=$((mem_available / 1024))
swap_used=$(awk -v t="$swap_total" -v f="$swap_free" 'BEGIN {printf "%.2f", t ? (t-f)*100/t : 0}')
disk=$(df -P / | awk 'NR==2 {gsub(/%/,"",$5); print $5}')
load1=$(awk '{print $1}' /proc/loadavg)
running=$(docker ps -q | wc -l | tr -d ' ')
unhealthy=$(docker ps --filter health=unhealthy -q | wc -l | tr -d ' ')

payload=$(printf '{"serverKey":"%s","serverName":"%s","cpuPercent":%s,"memoryUsedPercent":%s,"memoryAvailableMb":%s,"swapUsedPercent":%s,"diskUsedPercent":%s,"load1":%s,"containersRunning":%s,"containersUnhealthy":%s}' \
  "$MONITORING_SERVER_KEY" "$MONITORING_SERVER_NAME" "$cpu" "$mem_used" "$mem_available_mb" "$swap_used" "$disk" "$load1" "$running" "$unhealthy")

curl --fail --silent --show-error --max-time 10 \
  -H "Authorization: Bearer $MONITORING_INGEST_TOKEN" \
  -H "Content-Type: application/json" \
  --data "$payload" "$MONITORING_INGEST_URL" >/dev/null

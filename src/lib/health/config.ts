/**
 * Regras e constantes da tela Saúde em tempo real, num lugar só.
 *
 * Antes, o limite de "lento" vivia no probe, o de CPU no componente, a janela
 * de histórico na query e o intervalo de coleta só no systemd. Quem quisesse
 * saber por que um número aparecia precisava ler quatro arquivos e um host.
 * Tudo que decide um status ou um frescor sai daqui e aparece no painel
 * "Detalhes da medição".
 */

/** Versão das regras de cálculo. Muda quando uma fórmula ou limite mudar. */
export const HEALTH_RULES_VERSION = "health-v2";
/** Versão do probe HTTP que roda dentro do app. */
export const PROBE_VERSION = "probe-v2";

/** O timer `avila-monitoring.timer` roda a cada 15 s nos dois hosts. */
export const COLLECT_INTERVAL_MS = 15_000;
/** Dado com mais de três intervalos sem chegar é desatualizado. */
export const STALE_AFTER_MS = COLLECT_INTERVAL_MS * 3;
/** A tela pede medição a cada 5 s; abaixo disto reaproveita a última rodada. */
export const MIN_REFRESH_MS = 5_000;
/** Resposta 2xx acima disto é "com atenção". */
export const SLOW_THRESHOLD_MS = 2_500;
/** O probe desiste depois disto e registra TIMEOUT. */
export const PROBE_TIMEOUT_MS = 8_000;
/** Janela do histórico e dos sparklines. */
export const HISTORY_WINDOW_MS = 30 * 60_000;
export const HISTORY_POINTS = 30;
/** Retenção das duas tabelas. ~20 serviços × 5,8 mil checks/dia ≈ 115 mil linhas. */
export const RETENTION_MS = 24 * 60 * 60_000;

/** Limites de cor das barras de capacidade (em %). */
export const CAPACITY_LIMITS = {
  cpu: { warning: 70, critical: 90 },
  memory: { warning: 75, critical: 90 },
  disk: { warning: 75, critical: 90 },
} as const;

export type ServerKey = "apps-client" | "apps-noclient";

/** Os dois hosts que enviam leituras. IP conferido por SSH em 16/09/2026. */
export const SERVERS: Record<ServerKey, { key: ServerKey; alias: string; ip: string; hostname: string }> = {
  "apps-client": { key: "apps-client", alias: "applications", ip: "178.105.82.48", hostname: "ubuntu-4gb-nbg1-1" },
  "apps-noclient": { key: "apps-noclient", alias: "apps-noclient", ip: "204.168.249.111", hostname: "ubuntu-4gb-hel1-2" },
};

/**
 * Serviços testados por URL. `server` é o servidor DECLARADO (agrupa a tela);
 * o servidor comprovado vem do IP que o probe resolve a cada rodada.
 */
export const MONITORED_SERVICES = [
  { key: "n8n", name: "n8n", server: "apps-noclient", url: "https://n8n.avilaops.com/healthz" },
  { key: "notas", name: "Notas", server: "apps-noclient", url: "https://notas.avilaops.com/" },
  { key: "ia", name: "Ávila IA", server: "apps-noclient", url: "https://ia.avilaops.com/" },
  { key: "sms", name: "Ávila SMS", server: "apps-noclient", url: "https://sms.avilaops.com/" },
  { key: "crm", name: "CRM", server: "apps-noclient", url: "https://crm.avilaops.com/" },
  { key: "arxisvr", name: "ArxisVR", server: "apps-noclient", url: "https://arxisvr.avilaops.com/" },
  { key: "alo-barbeiro", name: "Alô Barbeiro", server: "apps-noclient", url: "https://alobarbeiro.com/" },
  { key: "cdda", name: "CDDA Judô", server: "apps-noclient", url: "https://cdda.avilaops.com/" },
  { key: "engops", name: "EngOps", server: "apps-noclient", url: "https://engops.avilaops.com/" },
  { key: "app-avila", name: "App Ávila Ops", server: "apps-client", url: "https://app.avilaops.com/api/health" },
  { key: "site-avila", name: "Site Ávila Ops", server: "apps-client", url: "https://avilaops.com/" },
  { key: "saude-pet", name: "Saúde Pet", server: "apps-client", url: "https://saudepet.app.br/" },
  { key: "lojas", name: "Lojas Ávila Ops", server: "apps-client", url: "https://lojas.avilaops.com/api/health" },
  { key: "mail", name: "Ávila Mail", server: "apps-client", url: "https://mail.avilaops.com/" },
  { key: "brasa", name: "Brasa Mineira", server: "apps-client", url: "https://brasa.comandeiro.com.br/api/health" },
  { key: "cifra", name: "CIFRA", server: "apps-client", url: "https://cifrainssdeobras.com.br/healthz" },
  { key: "mello", name: "Mello Transportes", server: "apps-client", url: "https://mellotransportesriopreto.com.br/" },
  { key: "fenix", name: "Fênix Eletrodos", server: "apps-client", url: "https://fenixeletrodos.com.br/" },
  { key: "despolariza", name: "DespolarizaMED", server: "apps-client", url: "https://despolarizamed.com.br/" },
  { key: "sorroche", name: "Sorroche", server: "apps-client", url: "https://sorroche.beauty/" },
] as const satisfies readonly { key: string; name: string; server: ServerKey; url: string }[];

export type MonitoredService = (typeof MONITORED_SERVICES)[number];

/** De onde saem as requisições dos probes: o container do app no servidor de aplicações. */
export const PROBE_ORIGIN: ServerKey = "apps-client";

/**
 * Faixas IPv4/IPv6 da Cloudflare (api.cloudflare.com/client/v4/ips). Um IP
 * resolvido aqui dentro significa proxy laranja: a origem real fica escondida
 * e o servidor declarado não pode ser comprovado pelo DNS.
 */
export const CLOUDFLARE_V4 = [
  "173.245.48.0/20", "103.21.244.0/22", "103.22.200.0/22", "103.31.4.0/22", "141.101.64.0/18",
  "108.162.192.0/18", "190.93.240.0/20", "188.114.96.0/20", "197.234.240.0/22", "198.41.128.0/17",
  "162.158.0.0/15", "104.16.0.0/13", "104.24.0.0/14", "172.64.0.0/13", "131.0.72.0/22",
];
export const CLOUDFLARE_V6_PREFIXES = ["2400:cb00:", "2606:4700:", "2803:f800:", "2405:b500:", "2405:8100:", "2a06:98c", "2a06:98d", "2a06:98e", "2a06:98f", "2c0f:f248:"];

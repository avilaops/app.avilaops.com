/**
 * Controle global de ativação do Ávila AI Core. Por padrão o Core fica
 * DESATIVADO — nenhuma rota deve realizar chamada externa até
 * AI_CORE_ENABLED=true ser setado explicitamente no ambiente.
 *
 * Isso é intencional para o deploy inicial da infraestrutura: código em
 * produção, tabelas criadas, rota existente — mas sem nenhuma via de
 * chamada real possível até decisão explícita e posterior configuração da
 * credencial.
 */
export function isAiCoreEnabled(): boolean {
  return process.env.AI_CORE_ENABLED === "true";
}

export class AiCoreDisabledError extends Error {
  constructor() {
    super('Ávila AI Core está desativado (AI_CORE_ENABLED não é "true")');
    this.name = "AiCoreDisabledError";
  }
}

/**
 * Kill switch global: bloqueia TODA chamada ao Core, independente de
 * tenant/agente/projeto — diferente do KillSwitchRegistry do pacote, que é
 * por agente/projeto específico. Usar este como a primeira barreira de toda
 * rota; o KillSwitchRegistry por tenant continua disponível para bloqueios
 * mais granulares depois que o Core estiver ativo.
 */
let globalKillSwitchEngaged = !isAiCoreEnabled();

export function isGlobalKillSwitchEngaged(): boolean {
  return globalKillSwitchEngaged;
}

export function engageGlobalKillSwitch(): void {
  globalKillSwitchEngaged = true;
}

export function disengageGlobalKillSwitch(): void {
  globalKillSwitchEngaged = false;
}

/**
 * Se o Core pode ser chamado agora. Serve a dois públicos com a mesma
 * resposta: a rota, que precisa recusar antes de sair para a rede, e a tela,
 * que precisa saber disso ANTES de oferecer o botão — senão ela convida a um
 * clique que já nasce recusado.
 */
export function aiCoreDisponivel(): boolean {
  return isAiCoreEnabled() && !isGlobalKillSwitchEngaged();
}

/** Chamar no início de toda rota que usa o Core, antes de qualquer outra lógica. */
export function assertAiCoreAvailable(): void {
  if (!aiCoreDisponivel()) {
    throw new AiCoreDisabledError();
  }
}

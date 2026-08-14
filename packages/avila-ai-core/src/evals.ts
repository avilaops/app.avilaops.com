export type EvalCase<TInput, TOutput> = {
  id: string;
  description: string;
  input: TInput;
  expected: TOutput;
  /** Comparação customizada; por padrão usa igualdade estrutural via JSON.stringify. */
  matches?: (actual: TOutput, expected: TOutput) => boolean;
  /** Falha aqui bloqueia deploy — não é só um alerta informativo. */
  critical?: boolean;
};

export type EvalResult<TInput, TOutput> = {
  caseId: string;
  passed: boolean;
  input: TInput;
  expected: TOutput;
  actual: TOutput;
  critical: boolean;
};

export type EvalSummary<TInput, TOutput> = {
  total: number;
  passed: number;
  failed: number;
  criticalFailures: number;
  results: EvalResult<TInput, TOutput>[];
  /** true quando existe pelo menos uma falha crítica — deploy deve ser bloqueado. */
  shouldBlockDeploy: boolean;
};

function defaultMatches<T>(actual: T, expected: T): boolean {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

/**
 * Roda um conjunto de casos versionados contra uma função (tipicamente um
 * agente ou uma chamada estruturada) e resume o resultado. Casos marcados
 * como `critical` que falham devem impedir o deploy de uma nova versão de
 * prompt/modelo — ver `shouldBlockDeploy`.
 */
export async function runEvalSuite<TInput, TOutput>(
  cases: EvalCase<TInput, TOutput>[],
  run: (input: TInput) => Promise<TOutput>,
): Promise<EvalSummary<TInput, TOutput>> {
  const results: EvalResult<TInput, TOutput>[] = [];

  for (const evalCase of cases) {
    const actual = await run(evalCase.input);
    const matches = evalCase.matches ?? defaultMatches;
    const passed = matches(actual, evalCase.expected);
    results.push({
      caseId: evalCase.id,
      passed,
      input: evalCase.input,
      expected: evalCase.expected,
      actual,
      critical: evalCase.critical ?? false,
    });
  }

  const failed = results.filter((result) => !result.passed);
  const criticalFailures = failed.filter((result) => result.critical);

  return {
    total: results.length,
    passed: results.length - failed.length,
    failed: failed.length,
    criticalFailures: criticalFailures.length,
    results,
    shouldBlockDeploy: criticalFailures.length > 0,
  };
}

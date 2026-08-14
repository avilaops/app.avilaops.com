import { test } from "node:test";
import assert from "node:assert/strict";
import { runEvalSuite } from "../evals";

test("runEvalSuite: todos os casos passam quando actual bate com expected", async () => {
  const summary = await runEvalSuite(
    [
      { id: "c1", description: "soma simples", input: 2, expected: 4 },
      { id: "c2", description: "soma simples 2", input: 5, expected: 10 },
    ],
    async (input: number) => input * 2,
  );

  assert.equal(summary.total, 2);
  assert.equal(summary.passed, 2);
  assert.equal(summary.failed, 0);
  assert.equal(summary.shouldBlockDeploy, false);
});

test("runEvalSuite: falha crítica marca shouldBlockDeploy como true", async () => {
  const summary = await runEvalSuite(
    [
      { id: "c1", description: "caso normal", input: 2, expected: 4, critical: false },
      { id: "c2", description: "caso crítico", input: 3, expected: 999, critical: true },
    ],
    async (input: number) => input * 2,
  );

  assert.equal(summary.failed, 1);
  assert.equal(summary.criticalFailures, 1);
  assert.equal(summary.shouldBlockDeploy, true);
});

test("runEvalSuite: falha não-crítica não bloqueia deploy", async () => {
  const summary = await runEvalSuite(
    [{ id: "c1", description: "caso não crítico", input: 2, expected: 999, critical: false }],
    async (input: number) => input * 2,
  );

  assert.equal(summary.failed, 1);
  assert.equal(summary.shouldBlockDeploy, false);
});

test("runEvalSuite: comparador customizado é respeitado", async () => {
  const summary = await runEvalSuite(
    [
      {
        id: "c1",
        description: "case-insensitive",
        input: "OLÁ",
        expected: "olá",
        matches: (actual: string, expected: string) =>
          actual.toLowerCase() === expected.toLowerCase(),
      },
    ],
    async (input: string) => input,
  );

  assert.equal(summary.passed, 1);
});

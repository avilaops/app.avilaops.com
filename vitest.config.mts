import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    // Só o que está em `tests/`. O `ai-core` já tem suíte própria escrita para
    // o `node:test`, com `test()` em vez de `it()` — o vitest a coleta e
    // reprova por não achar suite, o que encheria a saída de vermelho sem
    // nenhum defeito real. Unificar os dois runners é trabalho à parte.
    include: ["tests/**/*.test.{ts,tsx}"],
    // Confere uma vez, antes de qualquer arquivo, que o servidor é o descartável.
    globalSetup: ["tests/global-setup.ts"],
    setupFiles: ["tests/setup.ts"],
    // Os testes de integração criam organização, assinatura e fatura reais no
    // Postgres descartável. Rodar arquivos em paralelo tornaria instável
    // qualquer asserção de contagem.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
  resolve: {
    alias: {
      "@": new URL("./src/", import.meta.url).pathname,
    },
  },
});

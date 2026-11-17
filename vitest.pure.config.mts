import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    include: [
      "tests/unit/regua-cobranca-email*.test.ts",
      "tests/unit/regua-cobranca-email-route.test.ts",
      "tests/unit/fatura-personalizada.test.ts",
      "tests/unit/erp-nfse.test.ts",
      "tests/unit/fila-nfse-route.test.ts",
      "tests/unit/fila-nfse.test.ts",
      "tests/unit/entrega-cobranca-http.test.ts",
      "tests/unit/entrega-cobranca-saldo.test.ts",
      "tests/unit/alocacao-concorrente.test.ts",
      "tests/unit/alocacao-pagamento.test.ts",
      "tests/unit/baixa-cobranca.test.ts",
    ],
    environment: "node",
  },
});

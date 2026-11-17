import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    include: ["tests/unit/regua-cobranca-email*.test.ts", "tests/unit/regua-cobranca-email-route.test.ts"],
    environment: "node",
  },
});

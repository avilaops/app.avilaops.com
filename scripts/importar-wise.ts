import { readFileSync } from "fs";
import { prisma } from "../src/lib/prisma";
import { importWiseStatement } from "../src/lib/wise-import";

/**
 * Importa um extrato da Wise pela linha de comando.
 *
 * A tela em `/financeiro/importar` é o caminho normal. Este script existe para
 * a carga inicial — um histórico inteiro de meses, que é melhor rodar no
 * servidor do que subir por navegador.
 *
 *   npx tsx scripts/importar-wise.ts caminho/para/transaction-history.csv
 */
const caminho = process.argv[2];

if (!caminho) {
  console.error("Informe o caminho do CSV exportado da Wise.");
  process.exit(1);
}

async function main() {
  const conteudo = readFileSync(caminho, "utf8");
  const resultado = await importWiseStatement(conteudo, { actorId: null });

  console.log(
    `Período: ${resultado.periodStart?.toISOString().slice(0, 10)} a ${resultado.periodEnd?.toISOString().slice(0, 10)}`,
  );
  for (const conta of resultado.accounts) {
    console.log(
      `${conta.id}: ${conta.created} novas, ${conta.updated} atualizadas`,
    );
  }
  console.log(`Entradas: ${resultado.credits} · Saídas: ${resultado.debits}`);
  console.log(`Já ignoradas (estorno/conversão): ${resultado.ignored}`);
  console.log("Escopo:", resultado.scopeCounts);
  console.log(`Linhas descartadas: ${resultado.skipped.length}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

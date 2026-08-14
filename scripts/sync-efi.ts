import { runEfiSync } from "../src/lib/sync";
import { prisma } from "../src/lib/prisma";

const requestedDays = Number.parseInt(
  process.argv.find((argument) => argument.startsWith("--days="))?.split("=")[1] ??
    process.env.EFI_SYNC_DAYS ??
    "90",
  10,
);

runEfiSync({ actorId: "cli", days: requestedDays })
  .then((result) => {
    console.log(
      JSON.stringify(
        {
          status: result.status,
          runId: result.runId,
          receivedCount: result.receivedCount,
          sentCount: result.sentCount,
        },
        null,
        2,
      ),
    );
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Falha desconhecida";
    console.error(JSON.stringify({ status: "FAILED", error: message }));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

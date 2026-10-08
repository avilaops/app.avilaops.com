import "dotenv/config";
import { PrismaClient } from "@prisma/client";

/**
 * Segunda guarda, uma vez por rodada: o servidor do outro lado é mesmo o
 * Postgres descartável?
 *
 * `tests/setup.ts` recusa host remoto, mas `127.0.0.1` não prova nada: em
 * 08/10/2026 havia um túnel SSH na porta 55433 — a porta padrão do banco de
 * teste — levando ao Postgres de produção do `applications`, que aceita
 * qualquer usuário em loopback. O container de teste não subiu (porta ocupada),
 * o `prisma migrate deploy` criou um `cliente_portal_test` lá e a suíte rodou
 * dentro dele. Não tocou em dado de cliente por sorte de nome, não por guarda.
 *
 * O descartável tem só o banco da suíte e o `postgres`. Qualquer outro banco no
 * servidor quer dizer que é um Postgres de verdade, e a rodada para aqui.
 */
export default async function conferirBancoDescartavel() {
  if (!process.env.DATABASE_URL) return; // `tests/setup.ts` explica o que fazer.

  const prisma = new PrismaClient();
  try {
    const outros = await prisma.$queryRaw<Array<{ datname: string }>>`
      SELECT datname FROM pg_database
      WHERE NOT datistemplate AND datname NOT IN ('postgres', current_database())`;
    if (outros.length > 0) {
      throw new Error(
        "Recusando rodar a suíte: o Postgres em DATABASE_URL tem outros bancos " +
          `(${outros.map((b) => b.datname).join(", ")}), então não é o descartável. ` +
          "Confira se `npm run db:test:up` subiu de verdade e se a porta não está " +
          "ocupada por um túnel (`ss -ltnp | grep <porta>`); use TEST_DB_PORT para outra.",
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

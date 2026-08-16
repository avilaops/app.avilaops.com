import "dotenv/config";

/**
 * Guarda-corpo: os testes de integração criam e apagam registros de verdade.
 *
 * Este projeto fala com o `cliente_portal` — o banco COMPARTILHADO com o portal
 * do cliente, onde já houve queda de produção mais de uma vez. Rodar a suíte
 * apontando para lá apagaria dado de cliente real.
 *
 * Por isso a recusa é explícita e a mensagem diz o que fazer. Um teste que
 * decide sozinho "vou pular porque não tem banco" esconde exatamente o dia em
 * que a suíte parou de cobrir a cobrança.
 */
const url = process.env.DATABASE_URL ?? "";

if (!url) {
  throw new Error(
    "DATABASE_URL ausente. Suba o banco descartável com `npm run db:test:up` " +
      "e rode `npm test` — ele exporta a URL local.",
  );
}

if (!/@(localhost|127\.0\.0\.1|host\.docker\.internal)[:/]/.test(url)) {
  throw new Error(
    `Recusando rodar a suíte contra um banco remoto (${url.replace(/:[^:@]*@/, ":***@")}). ` +
      "Este projeto compartilha banco com o portal do cliente.",
  );
}

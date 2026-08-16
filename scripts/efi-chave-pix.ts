import "dotenv/config";
import { criarChavePixAleatoria, listarChavesPix } from "@/lib/efi-cobranca";

/**
 * Mostra as chaves PIX aleatórias (EVP) da conta e, se pedido, cria uma.
 *
 * Lista SEMPRE antes de criar. A conta tem limite de chaves, e criar sem olhar
 * é como ficam contas com cinco EVPs órfãs que ninguém sabe de onde vieram —
 * e nenhuma delas dá para apagar sem saber se alguma cobrança viva usa.
 *
 *   npx tsx scripts/efi-chave-pix.ts            lista
 *   CRIAR=1 npx tsx scripts/efi-chave-pix.ts    cria uma nova
 *
 * O ambiente sai de `EFI_ENVIRONMENT` — sem ele, produção.
 */

const AMBIENTE = (process.env.EFI_ENVIRONMENT ?? "producao").trim().toLowerCase();

async function main() {
  console.log(`Ambiente: ${AMBIENTE}\n`);

  const chaves = await listarChavesPix();

  if (chaves.length === 0) {
    console.log("Nenhuma chave aleatória cadastrada.");
  } else {
    console.log(`${chaves.length} chave(s) aleatória(s):`);
    for (const chave of chaves) console.log(`  ${chave}`);
  }

  if (process.env.CRIAR !== "1") {
    console.log(
      "\nPara criar uma nova: CRIAR=1 npx tsx scripts/efi-chave-pix.ts" +
        "\nDepois, ponha o valor em EFI_PIX_KEY e reinicie o app.",
    );
    return;
  }

  console.log("\nCriando chave aleatória…");
  const nova = await criarChavePixAleatoria();

  console.log(`chave criada: ${nova}`);
  console.log("\nAgora:  EFI_PIX_KEY=\"" + nova + '"  no .env.production, e reinicie.');
}

main().catch((erro) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exit(1);
});

import "dotenv/config";
import { createPixCharge, getPixChargeStatus } from "@/lib/efi-cobranca";

/**
 * Prova que a chave PIX configurada realmente gera cobrança.
 *
 * Cria uma cobrança de **um centavo com validade de 60 segundos** e consulta a
 * situação dela. Ninguém paga, e ela expira antes de qualquer um conseguir —
 * mas o caminho exercitado é o mesmo da mensalidade: credencial, certificado,
 * chave de recebimento e geração do copia-e-cola.
 *
 * Existe porque "a variável está preenchida" não é a mesma coisa que "o
 * cliente consegue pagar". A diferença entre as duas aparece no sábado.
 *
 *   npx tsx scripts/efi-testa-pix.ts
 */

async function main() {
  const ambiente = (process.env.EFI_ENVIRONMENT ?? "producao").trim().toLowerCase();
  const chave = process.env.EFI_PIX_KEY?.trim();

  console.log(`Ambiente: ${ambiente}`);
  console.log(`Chave configurada: ${chave ? `${chave.slice(0, 8)}…` : "NENHUMA"}`);

  if (!chave) {
    console.error("\nEFI_PIX_KEY não está configurada. Nada a testar.");
    process.exit(1);
  }

  const cobranca = await createPixCharge({
    amount: 0.01,
    description: "Teste de configuracao - nao pagar",
    expiresInSeconds: 60,
  });

  console.log(`\ntxid:         ${cobranca.externalId}`);
  console.log(`copia e cola: ${cobranca.copyPaste.slice(0, 60)}…`);
  console.log(`QR (base64):  ${cobranca.qrCodeBase64.length} caracteres`);
  console.log(`expira em:    ${cobranca.expiresAt.toISOString()}`);

  // É o que o webhook consulta antes de dar baixa. Recém-criada tem que estar
  // ATIVA: se voltasse CONCLUIDA, a baixa aconteceria sem ninguém ter pago.
  const situacao = await getPixChargeStatus(cobranca.externalId);
  console.log(`situação:     ${situacao}`);

  console.log(
    situacao === "ATIVA"
      ? "\nok: a cobrança nasce ativa e expira em 60s sem ninguém pagar."
      : `\nATENÇÃO: situação inesperada para cobrança recém-criada (${situacao}).`,
  );
}

main().catch((erro) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exit(1);
});

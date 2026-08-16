import "dotenv/config";
import {
  createBoletoCharge,
  createPixCharge,
  getCobrancaChargeStatus,
  getPixChargeStatus,
} from "@/lib/efi-cobranca";

/**
 * Exercita a integração com o Efí em HOMOLOGAÇÃO.
 *
 * Existe porque teste com provedor de pagamento não se faz com mock: o mock
 * prova o que nós achamos que a API responde. Isto prova o que ela responde.
 *
 * NÃO roda em produção — a primeira linha recusa. Cobrança de verdade criada
 * "só para ver se funciona" fica no extrato do cliente e alguém precisa
 * explicar depois.
 *
 *   EFI_ENVIRONMENT=homologacao \
 *   EFI_CLIENT_ID_HOMOLOGACAO=... EFI_SECRET_KEY_HOMOLOGACAO=... \
 *   EFI_CERTIFICATE_PATH_HOMOLOGACAO=../financeiro/homologacao-....p12 \
 *   EFI_PIX_KEY=... \
 *   npx tsx scripts/efi-homologacao.ts
 */

const AMBIENTE = (process.env.EFI_ENVIRONMENT ?? "producao").trim().toLowerCase();

if (AMBIENTE !== "homologacao") {
  console.error(
    "Recusando: este script só roda com EFI_ENVIRONMENT=homologacao.\n" +
      "Em produção ele criaria cobrança de verdade no extrato de alguém.",
  );
  process.exit(1);
}

// Pagador de teste. CPF gerado para sandbox — não pertence a ninguém.
const PAGADOR = {
  name: "Cliente de Homologacao",
  cpf: "94271564656",
  email: "homologacao@avilaops.com",
};

function titulo(texto: string) {
  console.log(`\n=== ${texto} ===`);
}

async function tentar<T>(nome: string, executar: () => Promise<T>): Promise<T | null> {
  try {
    const resultado = await executar();
    console.log(`ok: ${nome}`);
    return resultado;
  } catch (erro) {
    console.log(`FALHOU: ${nome}`);
    console.log(`  ${erro instanceof Error ? erro.message : String(erro)}`);
    return null;
  }
}

async function main() {
  console.log(`Ambiente: ${AMBIENTE}`);

  titulo("PIX");
  const pix = await tentar("criar cobrança PIX de R$ 1,00", () =>
    createPixCharge({ amount: 1, description: "Teste de homologação", expiresInSeconds: 3600 }),
  );

  if (pix) {
    console.log(`  txid:        ${pix.externalId}`);
    console.log(`  copia e cola: ${pix.copyPaste.slice(0, 48)}…`);
    console.log(`  expira em:   ${pix.expiresAt.toISOString()}`);

    const situacao = await tentar("consultar a situação do PIX", () =>
      getPixChargeStatus(pix.externalId),
    );
    // É o que o webhook consulta antes de dar baixa. Recém-criada tem que
    // estar ATIVA — se voltasse CONCLUIDA, a baixa aconteceria sem pagamento.
    if (situacao) console.log(`  situação:    ${situacao}`);
  }

  titulo("Boleto");
  const boleto = await tentar("criar boleto de R$ 1,00", () =>
    createBoletoCharge({
      amountCents: 100,
      description: "Teste de homologação",
      expireInDays: 3,
      payer: PAGADOR,
    }),
  );

  if (boleto) {
    console.log(`  charge_id:   ${boleto.externalId}`);
    console.log(`  linha:       ${boleto.barcode}`);
    console.log(`  pdf:         ${boleto.boletoUrl.slice(0, 60)}…`);

    const situacao = await tentar("consultar a situação do boleto", () =>
      getCobrancaChargeStatus(boleto.externalId),
    );
    if (situacao) console.log(`  situação:    ${situacao}`);
  }

  titulo("Boleto de CNPJ");
  const boletoCnpj = await tentar("criar boleto com pessoa jurídica", () =>
    createBoletoCharge({
      amountCents: 100,
      description: "Teste de homologação (CNPJ)",
      expireInDays: 3,
      payer: {
        ...PAGADOR,
        // CNPJ de teste com dígito verificador válido — o Efí recusa o resto.
        company: { cnpj: "11222333000181", corporateName: "Restaurante Teste LTDA" },
      },
    }),
  );

  if (boletoCnpj) console.log(`  charge_id:   ${boletoCnpj.externalId}`);

  titulo("Cartão");
  console.log(
    "não exercitado aqui: o cartão exige `payment_token`, que só o SDK do Efí\n" +
      "gera no navegador, com o número do cartão. Precisa da página de pagamento\n" +
      "hospedada — é o próximo passo, e é onde o teste de cartão vai morar.",
  );
}

main().catch((erro) => {
  console.error(erro);
  process.exit(1);
});

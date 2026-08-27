import { describe, expect, it } from "vitest";
import { parseWiseCsv } from "@/lib/wise-csv";

const HEADER = [
  '"Número da transferência"',
  "Situação",
  "Direção",
  '"Criada em"',
  '"Concluída em"',
  '"Valor da tarifa de origem"',
  '"Moeda da tarifa de origem"',
  '"Valor da tarifa de destino"',
  '"Moeda da tarifa de destino"',
  '"Nome de origem"',
  '"Valor de origem (tarifas inclusas)"',
  '"Moeda de origem"',
  '"Nome do beneficiário"',
  '"Valor de destino (tarifas inclusas)"',
  '"Moeda de destino"',
  '"Taxa de câmbio"',
  "Referência",
  "Lote",
  '"Criada por"',
  "Categoria",
  "Mensagem",
].join(",");

function csv(...rows: string[]) {
  return [HEADER, ...rows].join("\n");
}

const COMPRA =
  '"CARD_TRANSACTION-1",COMPLETED,OUT,"2026-08-26 16:43:01","2026-08-26 16:43:01",0.00,BRL,,,"NICOLAS ROSA AVILA BARROS",9.00,BRL,"Casa Das Frutas",9.00,BRL,1.0,,,"NICOLAS","Compras no mercado",';

const DOMINIO =
  '"CARD_TRANSACTION-2",COMPLETED,OUT,"2026-05-02 10:00:00","2026-05-02 10:00:00",0.00,USD,,,"NICOLAS ROSA AVILA BARROS",412.19,USD,"Porkbun",412.19,USD,1.0,,,"NICOLAS",Contas,';

const CONVERSAO =
  '"BALANCE_TRANSACTION-3",COMPLETED,NEUTRAL,"2026-07-13 09:00:00","2026-07-13 09:00:00",0.00,BRL,,,"NICOLAS ROSA AVILA BARROS",54.64,BRL,"NICOLAS ROSA AVILA BARROS",10.46,USD,5.22,,,"NICOLAS",Geral,';

const ESTORNO =
  '"CARD_TRANSACTION-4",REFUNDED,OUT,"2026-06-01 12:00:00","2026-06-01 12:00:00",0.00,BRL,,,"NICOLAS ROSA AVILA BARROS",17.81,BRL,Uber,17.81,BRL,1.0,,,"NICOLAS",Transporte,';

const CANCELADA =
  '"TRANSFER-5",CANCELLED,OUT,"2026-06-02 12:00:00",,0.00,BRL,,,"NICOLAS ROSA AVILA BARROS",100.00,BRL,"Alguém",100.00,BRL,1.0,,,"NICOLAS",Geral,';

const RECEBIDO =
  '"TRANSFER-6",COMPLETED,IN,"2026-08-13 08:00:00","2026-08-13 08:00:00",0.00,BRL,,,"67.954.417 NICOLAS ROSA AVILA BARROS",2375.50,BRL,"NICOLAS ROSA AVILA BARROS",2375.50,BRL,1.0,,,"NICOLAS",Geral,"pró-labore"';

describe("parseWiseCsv", () => {
  it("lê uma compra no cartão como saída na moeda de origem", () => {
    const { movements } = parseWiseCsv(csv(COMPRA));
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({
      currency: "BRL",
      direction: "DEBIT",
      amount: 9,
      transactionType: "CARD_PURCHASE",
      counterpartyName: "Casa Das Frutas",
      category: "Compras no mercado",
    });
  });

  it("quebra conversão de saldo em duas pernas, uma por moeda", () => {
    const { movements } = parseWiseCsv(csv(CONVERSAO));
    expect(movements).toHaveLength(2);

    const saida = movements.find((item) => item.direction === "DEBIT");
    const entrada = movements.find((item) => item.direction === "CREDIT");

    expect(saida).toMatchObject({ currency: "BRL", amount: 54.64 });
    expect(entrada).toMatchObject({ currency: "USD", amount: 10.46 });
    // As duas pernas precisam de identificadores distintos, ou uma sobrescreve
    // a outra no banco (a chave é conta + externalId).
    expect(saida?.externalId).not.toBe(entrada?.externalId);
    expect(saida?.isInternalTransfer).toBe(true);
    expect(entrada?.isInternalTransfer).toBe(true);
  });

  it("descarta transferência cancelada e diz o motivo", () => {
    const { movements, skipped } = parseWiseCsv(csv(CANCELADA));
    expect(movements).toHaveLength(0);
    expect(skipped[0].reason).toContain("cancelada");
  });

  it("mantém a compra estornada no extrato, marcada como REFUNDED", () => {
    const { movements } = parseWiseCsv(csv(ESTORNO));
    expect(movements).toHaveLength(1);
    expect(movements[0].status).toBe("REFUNDED");
  });

  it("reconhece entrada, moedas do arquivo e mantém a mensagem livre", () => {
    const { movements, currencies } = parseWiseCsv(
      csv(COMPRA, DOMINIO, RECEBIDO),
    );
    expect(currencies).toEqual(["BRL", "USD"]);

    const entrada = movements.find((item) => item.direction === "CREDIT");
    expect(entrada).toMatchObject({
      amount: 2375.5,
      currency: "BRL",
      transactionType: "TRANSFER_RECEIVED",
    });
    expect(entrada?.description).toContain("pró-labore");
  });

  it("rejeita arquivo que não é extrato da Wise", () => {
    expect(() => parseWiseCsv("a,b,c\n1,2,3")).toThrow(/extrato da Wise/);
  });
});

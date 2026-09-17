import { describe, expect, it } from "vitest";
import { parseProcNFe } from "@/lib/fiscal/nfe-parser";
import {
  escolherNotaMaisRecente,
  montarRetrato,
} from "@/lib/fiscal/retrato-destinatario";
import type { DocumentoDFe, NFeCompleta } from "@/lib/fiscal/types";

/**
 * O bloco `<dest>` da NF-e é o próprio cliente. Até 17/09/2026 o parser lia
 * dele só CNPJ, razão social, IE e UF: o endereço e o contato ficavam no XML
 * sem ninguém ler, embora sejam justamente o que falta na ficha de um cliente
 * sem consulta de CNPJ guardada.
 */

const XML = `<nfeProc><NFe><infNFe Id="NFe35260912345678000190550010000012341000012345">
  <ide><nNF>1234</nNF><serie>1</serie><natOp>Venda</natOp><dhEmi>2026-09-10T14:30:00-03:00</dhEmi></ide>
  <emit>
    <CNPJ>11111111000191</CNPJ><xNome>FORNECEDOR EXEMPLO LTDA</xNome>
    <enderEmit><xLgr>RUA DO FORNECEDOR</xLgr><nro>99</nro><xBairro>DISTRITO</xBairro>
    <xMun>SAO PAULO</xMun><UF>SP</UF><CEP>01310100</CEP></enderEmit>
  </emit>
  <dest>
    <CNPJ>12345678000190</CNPJ><xNome>PADARIA AURORA COMERCIO DE ALIMENTOS LTDA</xNome>
    <IE>1234567890</IE>
    <enderDest>
      <xLgr>RUA DAS ACACIAS</xLgr><nro>120</nro><xCpl>LOJA 2</xCpl>
      <xBairro>CENTRO</xBairro><xMun>UBERLANDIA</xMun><UF>MG</UF>
      <CEP>38400100</CEP><fone>3432221100</fone>
    </enderDest>
    <email>CONTATO@PADARIAAURORA.EXAMPLE</email>
  </dest>
  <total><ICMSTot><vNF>1500.00</vNF><vProd>1500.00</vProd></ICMSTot></total>
</infNFe></NFe></nfeProc>`;

describe("parser do bloco do destinatário", () => {
  const nota = parseProcNFe(XML, "000000000000001");

  it("lê o endereço do cliente, não o do fornecedor", () => {
    expect(nota.destinatario.logradouro).toBe("RUA DAS ACACIAS");
    expect(nota.destinatario.numero).toBe("120");
    expect(nota.destinatario.bairro).toBe("CENTRO");
    expect(nota.destinatario.municipio).toBe("UBERLANDIA");
    expect(nota.destinatario.cep).toBe("38400100");
    // O endereço do emitente continua sendo do emitente.
    expect(nota.emitente.logradouro).toBe("RUA DO FORNECEDOR");
  });

  it("lê a UF de dentro de enderDest", () => {
    expect(nota.destinatario.uf).toBe("MG");
  });

  it("lê inscrição estadual, telefone e e-mail do cliente", () => {
    expect(nota.destinatario.ie).toBe("1234567890");
    expect(nota.destinatario.telefone).toBe("3432221100");
    expect(nota.destinatario.email).toBe("CONTATO@PADARIAAURORA.EXAMPLE");
  });

  it("deixa indefinido o que a nota não traz, em vez de string vazia", () => {
    const semEndereco = parseProcNFe(
      XML.replace(/<enderDest>[\s\S]*<\/enderDest>/, "<enderDest><UF>MG</UF></enderDest>"),
      "000000000000002",
    );
    expect(semEndereco.destinatario.logradouro).toBeUndefined();
    expect(semEndereco.destinatario.cep).toBeUndefined();
  });
});

describe("escolha da nota que vira retrato", () => {
  function completa(chave: string, dataEmissao: string): NFeCompleta {
    return { ...parseProcNFe(XML, "1"), chaveAcesso: chave, dataEmissao };
  }

  it("fica com a emissão mais recente", () => {
    const documentos: DocumentoDFe[] = [
      completa("antiga", "2024-01-05T10:00:00-03:00"),
      completa("recente", "2026-09-10T14:30:00-03:00"),
      completa("meio", "2025-06-01T09:00:00-03:00"),
    ];
    expect(escolherNotaMaisRecente(documentos)?.chaveAcesso).toBe("recente");
  });

  it("ignora resumo, que não traz o bloco do destinatário", () => {
    const resumo = {
      tipo: "RESUMO" as const,
      nsu: "1",
      chaveAcesso: "resumo",
      cnpjEmitente: "11111111000191",
      razaoSocialEmitente: "FORNECEDOR",
      dataEmissao: "2026-09-16T10:00:00-03:00",
      tipoOperacao: "ENTRADA" as const,
      valorTotal: 10,
      situacaoNFe: "AUTORIZADA" as const,
    };
    expect(escolherNotaMaisRecente([resumo])).toBeNull();
    expect(escolherNotaMaisRecente([resumo, completa("c", "2020-01-01T00:00:00-03:00")])?.chaveAcesso).toBe("c");
  });

  it("devolve nulo quando a leva veio vazia", () => {
    expect(escolherNotaMaisRecente([])).toBeNull();
  });
});

describe("retrato guardado", () => {
  const retrato = montarRetrato(parseProcNFe(XML, "1"), new Date("2026-09-17T06:00:00Z"));

  it("guarda a trilha até o documento", () => {
    expect(retrato.chaveAcesso).toBe("35260912345678000190550010000012341000012345");
    expect(retrato.dataEmissao).toBe("2026-09-10T14:30:00-03:00");
    expect(retrato.capturadoEm).toBe("2026-09-17T06:00:00.000Z");
  });

  it("normaliza o e-mail e mantém o resto como veio", () => {
    expect(retrato.email).toBe("contato@padariaaurora.example");
    expect(retrato.razaoSocial).toBe("PADARIA AURORA COMERCIO DE ALIMENTOS LTDA");
  });

  it("não guarda item, fornecedor nem XML", () => {
    const chaves = Object.keys(retrato);
    expect(chaves).not.toContain("itens");
    expect(chaves).not.toContain("emitente");
    expect(chaves).not.toContain("xmlOriginal");
    expect(JSON.stringify(retrato)).not.toContain("FORNECEDOR EXEMPLO");
  });
});

import { describe, expect, it } from "vitest";
import { extrairIdentificacaoSubject } from "@/lib/fiscal/certificado";
import { parseProcNFe, parseResNFe } from "@/lib/fiscal/nfe-parser";
import { gerarXmlManifestacao } from "@/lib/fiscal/manifestacao";
import { montarEnvelopeDistDFe, processarRetornoDistDFe } from "@/lib/fiscal/sefaz-distribuicao";
import zlib from "node:zlib";

describe("Módulo Fiscal & SEFAZ DF-e", () => {
  describe("Extração de Identificação de Certificado A1", () => {
    it("deve extrair Razão Social e CNPJ padrão ICP-Brasil", () => {
      const subject = "CN=AVILA COMERCIO E SERVICOS LTDA:12345678000195, OU=Certificado PJ A1, O=ICP-Brasil, C=BR";
      const res = extrairIdentificacaoSubject(subject);
      expect(res.razaoSocial).toBe("AVILA COMERCIO E SERVICOS LTDA");
      expect(res.cnpj).toBe("12345678000195");
      expect(res.cpf).toBeNull();
    });

    it("deve extrair Nome e CPF para certificados de pessoa física", () => {
      const subject = "CN=FULANO DE TAL:98765432100, OU=Certificado PF A1, C=BR";
      const res = extrairIdentificacaoSubject(subject);
      expect(res.razaoSocial).toBe("FULANO DE TAL");
      expect(res.cpf).toBe("98765432100");
    });
  });

  describe("Parser de XML NF-e (resNFe e procNFe)", () => {
    it("deve parsear corretamente o resumo da NF-e (resNFe)", () => {
      const xmlResumo = `
        <resNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01">
          <chNFe>35260912345678000195550010000012341000012345</chNFe>
          <CNPJ>98765432000188</CNPJ>
          <xNome>DISTRIBUIDORA BRASIL LTDA</xNome>
          <IE>123456789</IE>
          <dhEmi>2026-09-04T10:00:00-03:00</dhEmi>
          <tpNF>1</tpNF>
          <vNF>1580.50</vNF>
          <cSitNFe>1</cSitNFe>
          <cSitConf>0</cSitConf>
        </resNFe>
      `;

      const resumo = parseResNFe(xmlResumo, "000000000001234");
      expect(resumo.tipo).toBe("RESUMO");
      expect(resumo.nsu).toBe("000000000001234");
      expect(resumo.chaveAcesso).toBe("35260912345678000195550010000012341000012345");
      expect(resumo.cnpjEmitente).toBe("98765432000188");
      expect(resumo.razaoSocialEmitente).toBe("DISTRIBUIDORA BRASIL LTDA");
      expect(resumo.valorTotal).toBe(1580.5);
      expect(resumo.situacaoNFe).toBe("AUTORIZADA");
    });

    it("deve parsear NF-e Completa com itens e cobranças", () => {
      const xmlCompleto = `
        <nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
          <NFe>
            <infNFe Id="NFe35260912345678000195550010000012341000012345" versao="4.00">
              <ide>
                <nNF>1234</nNF>
                <serie>1</serie>
                <natOp>VENDA DE MERCADORIA</natOp>
                <dhEmi>2026-09-04T10:00:00-03:00</dhEmi>
              </ide>
              <emit>
                <CNPJ>98765432000188</CNPJ>
                <xNome>DISTRIBUIDORA BRASIL LTDA</xNome>
                <enderEmit>
                  <UF>SP</UF>
                  <xMun>SAO PAULO</xMun>
                </enderEmit>
              </emit>
              <dest>
                <CNPJ>12345678000195</CNPJ>
                <xNome>CLIENTE FINAL LTDA</xNome>
                <UF>SP</UF>
              </dest>
              <det nItem="1">
                <prod>
                  <cProd>PROD-001</cProd>
                  <cEAN>7891234567890</cEAN>
                  <xProd>ESSENCIA PREMIUM 500ML</xProd>
                  <NCM>33029019</NCM>
                  <CFOP>5102</CFOP>
                  <uCom>UN</uCom>
                  <qCom>10.0000</qCom>
                  <vUnCom>50.00</vUnCom>
                  <vProd>500.00</vProd>
                </prod>
              </det>
              <total>
                <ICMSTot>
                  <vProd>500.00</vProd>
                  <vFrete>25.00</vFrete>
                  <vDesc>0.00</vDesc>
                  <vNF>525.00</vNF>
                </ICMSTot>
              </total>
              <cobr>
                <dup>
                  <nDup>001/01</nDup>
                  <dVenc>2026-09-30</dVenc>
                  <vDup>525.00</vDup>
                </dup>
              </cobr>
            </infNFe>
          </NFe>
        </nfeProc>
      `;

      const nfe = parseProcNFe(xmlCompleto, "000000000001235");
      expect(nfe.tipo).toBe("COMPLETA");
      expect(nfe.numero).toBe("1234");
      expect(nfe.naturezaOperacao).toBe("VENDA DE MERCADORIA");
      expect(nfe.emitente.cnpj).toBe("98765432000188");
      expect(nfe.destinatario.cnpj).toBe("12345678000195");
      expect(nfe.itens).toHaveLength(1);
      expect(nfe.itens[0].codigoProduto).toBe("PROD-001");
      expect(nfe.itens[0].quantidade).toBe(10);
      expect(nfe.itens[0].valorTotal).toBe(500);
      expect(nfe.valorTotal).toBe(525);
      expect(nfe.cobranca?.duplicatas).toHaveLength(1);
      expect(nfe.cobranca?.duplicatas[0].valor).toBe(525);
    });
  });

  describe("Manifestação do Destinatário", () => {
    it("deve gerar XML de Ciência da Emissão (210210)", () => {
      const xml = gerarXmlManifestacao({
        chaveAcesso: "35260912345678000195550010000012341000012345",
        cnpjDestinatario: "12345678000195",
        tipoEvento: "210210",
      });

      expect(xml).toContain("<tpEvento>210210</tpEvento>");
      expect(xml).toContain("<descEvento>Ciencia da Emissao</descEvento>");
      expect(xml).toContain("<CNPJ>12345678000195</CNPJ>");
      expect(xml).toContain("35260912345678000195550010000012341000012345");
    });
  });

  describe("Comunicação SEFAZ DistribuicaoDFe", () => {
    it("deve montar envelope SOAP 1.2 com os parâmetros corretos", () => {
      const envelope = montarEnvelopeDistDFe({
        cnpj: "12.345.678/0001-95",
        ultNSU: "100",
        ambiente: "PRODUCAO",
      });

      expect(envelope).toContain("<CNPJ>12345678000195</CNPJ>");
      expect(envelope).toContain("<ultNSU>000000000000100</ultNSU>");
      expect(envelope).toContain("<tpAmb>1</tpAmb>");
    });

    it("deve processar e descompactar retorno SEFAZ com docZip", () => {
      const xmlResumoOriginal = `<resNFe xmlns="http://www.portalfiscal.inf.br/nfe"><chNFe>35260912345678000195550010000012341000012345</chNFe><CNPJ>98765432000188</CNPJ><xNome>FORNECEDOR TESTE</xNome><vNF>300.00</vNF></resNFe>`;
      const bufferGz = zlib.gzipSync(Buffer.from(xmlResumoOriginal, "utf-8"));
      const base64Gz = bufferGz.toString("base64");

      const xmlRespostaSefaz = `
        <retDistDFeInt xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01">
          <cStat>138</cStat>
          <xMotivo>Documento localizado para o NSU informado</xMotivo>
          <ultNSU>105</ultNSU>
          <maxNSU>200</maxNSU>
          <loteDistDFeInt>
            <docZip NSU="105" schema="resNFe_v1.01.xsd">${base64Gz}</docZip>
          </loteDistDFeInt>
        </retDistDFeInt>
      `;

      const resultado = processarRetornoDistDFe(xmlRespostaSefaz);
      expect(resultado.cStat).toBe("138");
      expect(resultado.ultNSU).toBe("105");
      expect(resultado.maxNSU).toBe("200");
      expect(resultado.documentos).toHaveLength(1);
      expect(resultado.documentos[0].tipo).toBe("RESUMO");
      if (resultado.documentos[0].tipo === "RESUMO") {
        expect(resultado.documentos[0].razaoSocialEmitente).toBe("FORNECEDOR TESTE");
        expect(resultado.documentos[0].valorTotal).toBe(300);
      }
    });
  });
});

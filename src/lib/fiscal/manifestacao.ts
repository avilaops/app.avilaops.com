import type { ManifestacaoTipo } from "./types";

export const DESCRICAO_EVENTOS: Record<ManifestacaoTipo, string> = {
  "210200": "Confirmacao da Operacao",
  "210210": "Ciencia da Emissao",
  "210220": "Desconhecimento da Operacao",
  "210240": "Operacao nao Realizada",
};

/**
 * Gera o XML de Evento de Manifestação do Destinatário no padrão SEFAZ Nacional
 */
export function gerarXmlManifestacao(params: {
  chaveAcesso: string;
  cnpjDestinatario: string;
  tipoEvento: ManifestacaoTipo;
  ambiente?: "PRODUCAO" | "HOMOLOGACAO";
  justificativa?: string;
}): string {
  const tpAmb = params.ambiente === "HOMOLOGACAO" ? "2" : "1";
  const descEvento = DESCRICAO_EVENTOS[params.tipoEvento] || "Ciencia da Emissao";
  const dhEvento = new Date().toISOString().replace(/\.\d{3}Z$/, "-03:00");
  const idEvento = `ID${params.tipoEvento}${params.chaveAcesso}01`;

  const detEventoExtra =
    params.tipoEvento === "210240" && params.justificativa
      ? `<xJust>${params.justificativa.slice(0, 255)}</xJust>`
      : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<envEvento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00">
  <idLote>1</idLote>
  <evento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00">
    <infEvento Id="${idEvento}">
      <cOrgao>91</cOrgao>
      <tpAmb>${tpAmb}</tpAmb>
      <CNPJ>${params.cnpjDestinatario.replace(/\D/g, "")}</CNPJ>
      <chNFe>${params.chaveAcesso}</chNFe>
      <dhEvento>${dhEvento}</dhEvento>
      <tpEvento>${params.tipoEvento}</tpEvento>
      <nSeqEvento>1</nSeqEvento>
      <verEvento>1.00</verEvento>
      <detEvento versao="1.00">
        <descEvento>${descEvento}</descEvento>
        ${detEventoExtra}
      </detEvento>
    </infEvento>
  </evento>
</envEvento>`.trim();
}

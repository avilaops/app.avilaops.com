import type { NFeCompleta, NFeDuplicata, NFeItem, NFeResumo } from "./types";

/**
 * Utilitário para extrair o valor textual de uma tag XML simples
 */
function getTagValue(xml: string, tagName: string): string {
  const regex = new RegExp(`<(?:[a-zA-Z0-9_-]+:)?${tagName}[^>]*>([^<]*)</(?:[a-zA-Z0-9_-]+:)?${tagName}>`, "i");
  const match = xml.match(regex);
  return match ? match[1].trim() : "";
}

/**
 * Utilitário para extrair o conteúdo interno de um bloco XML
 */
function getTagBlock(xml: string, tagName: string): string {
  const regex = new RegExp(`<(?:[a-zA-Z0-9_-]+:)?${tagName}[^>]*>([\\s\\S]*?)</(?:[a-zA-Z0-9_-]+:)?${tagName}>`, "i");
  const match = xml.match(regex);
  return match ? match[1] : "";
}

/**
 * Utilitário para extrair todos os blocos de uma tag repetida no XML
 */
function getAllTagBlocks(xml: string, tagName: string): string[] {
  const regex = new RegExp(`<(?:[a-zA-Z0-9_-]+:)?${tagName}[^>]*>([\\s\\S]*?)</(?:[a-zA-Z0-9_-]+:)?${tagName}>`, "gi");
  const matches: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(xml)) !== null) {
    matches.push(match[1]);
  }
  return matches;
}

/**
 * Parser de Resumo de NF-e (resNFe)
 */
export function parseResNFe(xml: string, nsu: string): NFeResumo {
  const chaveAcesso = getTagValue(xml, "chNFe");
  const cnpjEmitente = getTagValue(xml, "CNPJ") || getTagValue(xml, "CPF");
  const razaoSocialEmitente = getTagValue(xml, "xNome");
  const ieEmitente = getTagValue(xml, "IE") || undefined;
  const dataEmissao = getTagValue(xml, "dhEmi") || getTagValue(xml, "dEmi");
  const tpNF = getTagValue(xml, "tpNF");
  const vNF = Number.parseFloat(getTagValue(xml, "vNF") || "0");
  const cSitNFe = getTagValue(xml, "cSitNFe");
  const cSitConf = getTagValue(xml, "cSitConf");

  let situacaoNFe: "AUTORIZADA" | "CANCELADA" | "DENEGADA" = "AUTORIZADA";
  if (cSitNFe === "2") {
    situacaoNFe = "DENEGADA";
  } else if (cSitNFe === "3") {
    situacaoNFe = "CANCELADA";
  }

  return {
    tipo: "RESUMO",
    nsu,
    chaveAcesso,
    cnpjEmitente,
    razaoSocialEmitente,
    ieEmitente,
    dataEmissao,
    tipoOperacao: tpNF === "0" ? "ENTRADA" : "SAIDA",
    valorTotal: isNaN(vNF) ? 0 : vNF,
    situacaoNFe,
    situacaoManifestacao: cSitConf || undefined,
  };
}

/**
 * Parser de NF-e Completa (procNFe ou NFe)
 */
export function parseProcNFe(xml: string, nsu: string): NFeCompleta {
  const ideBlock = getTagBlock(xml, "ide");
  const emitBlock = getTagBlock(xml, "emit");
  const destBlock = getTagBlock(xml, "dest");
  const totalBlock = getTagBlock(xml, "ICMSTot") || getTagBlock(xml, "total");
  const cobrBlock = getTagBlock(xml, "cobr");

  // Identificação
  const chaveAcesso =
    getTagValue(xml, "chNFe") ||
    xml.match(/Id=["']NFe(\d{44})["']/i)?.[1] ||
    "";
  const numero = getTagValue(ideBlock, "nNF");
  const serie = getTagValue(ideBlock, "serie");
  const naturezaOperacao = getTagValue(ideBlock, "natOp");
  const dataEmissao = getTagValue(ideBlock, "dhEmi") || getTagValue(ideBlock, "dEmi");

  // Totais
  const valorTotal = Number.parseFloat(getTagValue(totalBlock, "vNF") || "0");
  const valorProdutos = Number.parseFloat(getTagValue(totalBlock, "vProd") || "0");
  const valorFrete = Number.parseFloat(getTagValue(totalBlock, "vFrete") || "0");
  const valorDesconto = Number.parseFloat(getTagValue(totalBlock, "vDesc") || "0");

  // Emitente
  const enderEmitBlock = getTagBlock(emitBlock, "enderEmit");
  const emitente = {
    cnpj: getTagValue(emitBlock, "CNPJ") || getTagValue(emitBlock, "CPF"),
    razaoSocial: getTagValue(emitBlock, "xNome"),
    nomeFantasia: getTagValue(emitBlock, "xFant") || undefined,
    ie: getTagValue(emitBlock, "IE") || undefined,
    logradouro: getTagValue(enderEmitBlock, "xLgr") || undefined,
    numero: getTagValue(enderEmitBlock, "nro") || undefined,
    bairro: getTagValue(enderEmitBlock, "xBairro") || undefined,
    municipio: getTagValue(enderEmitBlock, "xMun") || undefined,
    uf: getTagValue(enderEmitBlock, "UF") || getTagValue(emitBlock, "UF"),
    cep: getTagValue(enderEmitBlock, "CEP") || undefined,
  };

  // Destinatário — o cliente. O endereço vive em <enderDest>, não solto em
  // <dest>: ler a UF do bloco externo funcionava por acaso, porque só existe
  // uma UF na nota inteira do lado do destinatário.
  const enderDestBlock = getTagBlock(destBlock, "enderDest");
  const destinatario = {
    cnpj: getTagValue(destBlock, "CNPJ") || getTagValue(destBlock, "CPF"),
    razaoSocial: getTagValue(destBlock, "xNome"),
    ie: getTagValue(destBlock, "IE") || undefined,
    uf: getTagValue(enderDestBlock, "UF") || getTagValue(destBlock, "UF"),
    logradouro: getTagValue(enderDestBlock, "xLgr") || undefined,
    numero: getTagValue(enderDestBlock, "nro") || undefined,
    complemento: getTagValue(enderDestBlock, "xCpl") || undefined,
    bairro: getTagValue(enderDestBlock, "xBairro") || undefined,
    municipio: getTagValue(enderDestBlock, "xMun") || undefined,
    cep: getTagValue(enderDestBlock, "CEP") || undefined,
    telefone: getTagValue(enderDestBlock, "fone") || undefined,
    email: getTagValue(destBlock, "email") || undefined,
  };

  // Itens / Produtos
  const detBlocks = getAllTagBlocks(xml, "det");
  const itens: NFeItem[] = detBlocks.map((detXml, index) => {
    const prodBlock = getTagBlock(detXml, "prod");
    const nItem = Number.parseInt(getTagValue(detXml, "nItem") || String(index + 1), 10);
    const codigoProduto = getTagValue(prodBlock, "cProd");
    const codigoEAN = getTagValue(prodBlock, "cEAN");
    const descricao = getTagValue(prodBlock, "xProd");
    const ncm = getTagValue(prodBlock, "NCM");
    const cfop = getTagValue(prodBlock, "CFOP");
    const unidade = getTagValue(prodBlock, "uCom");
    const quantidade = Number.parseFloat(getTagValue(prodBlock, "qCom") || "0");
    const valorUnitario = Number.parseFloat(getTagValue(prodBlock, "vUnCom") || "0");
    const valorItemTotal = Number.parseFloat(getTagValue(prodBlock, "vProd") || "0");

    return {
      numeroItem: nItem,
      codigoProduto,
      codigoEAN: codigoEAN === "SEM GTIN" ? null : codigoEAN || null,
      descricao,
      ncm,
      cfop,
      unidade,
      quantidade: isNaN(quantidade) ? 0 : quantidade,
      valorUnitario: isNaN(valorUnitario) ? 0 : valorUnitario,
      valorTotal: isNaN(valorItemTotal) ? 0 : valorItemTotal,
    };
  });

  // Duplicatas / Cobrança
  const dupBlocks = getAllTagBlocks(cobrBlock, "dup");
  const duplicatas: NFeDuplicata[] = dupBlocks.map((dupXml) => {
    const nDup = getTagValue(dupXml, "nDup");
    const dVenc = getTagValue(dupXml, "dVenc");
    const vDup = Number.parseFloat(getTagValue(dupXml, "vDup") || "0");

    return {
      numero: nDup,
      vencimento: dVenc,
      valor: isNaN(vDup) ? 0 : vDup,
    };
  });

  return {
    tipo: "COMPLETA",
    nsu,
    chaveAcesso,
    numero,
    serie,
    naturezaOperacao,
    dataEmissao,
    valorTotal: isNaN(valorTotal) ? 0 : valorTotal,
    valorProdutos: isNaN(valorProdutos) ? 0 : valorProdutos,
    valorFrete: isNaN(valorFrete) ? 0 : valorFrete,
    valorDesconto: isNaN(valorDesconto) ? 0 : valorDesconto,
    emitente,
    destinatario,
    itens,
    cobranca: duplicatas.length > 0 ? { duplicatas } : undefined,
    xmlOriginal: xml,
  };
}

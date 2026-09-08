/**
 * Tipos para o módulo fiscal e sincronização de NF-e da SEFAZ (DF-e)
 */

export type CertificadoA1Info = {
  cnpj: string | null;
  cpf: string | null;
  razaoSocial: string;
  emissor: string;
  validoDe: string;
  validoAte: string;
  diasParaVencer: number;
  expirado: boolean;
  status: "ATIVO" | "EXPIRANDO" | "EXPIRADO";
};

export type CertificadoA1Armazenado = {
  pfxBase64Ciphertext: string;
  senhaCiphertext: string;
  info: CertificadoA1Info;
  ultNSU: string;
  maxNSU: string;
  ultimaSincronizacaoEm: string | null;
  bloqueadoAte: string | null; // Prevenção de rejeição 656 SEFAZ
};

export type NFeItem = {
  numeroItem: number;
  codigoProduto: string;
  codigoEAN: string | null;
  descricao: string;
  ncm: string;
  cfop: string;
  unidade: string;
  quantidade: number;
  valorUnitario: number;
  valorTotal: number;
};

export type NFeDuplicata = {
  numero: string;
  vencimento: string;
  valor: number;
};

export type NFeResumo = {
  tipo: "RESUMO";
  nsu: string;
  chaveAcesso: string;
  cnpjEmitente: string;
  razaoSocialEmitente: string;
  ieEmitente?: string;
  dataEmissao: string;
  tipoOperacao: "ENTRADA" | "SAIDA";
  valorTotal: number;
  situacaoNFe: "AUTORIZADA" | "CANCELADA" | "DENEGADA";
  situacaoManifestacao?: string;
};

export type NFeCompleta = {
  tipo: "COMPLETA";
  nsu: string;
  chaveAcesso: string;
  numero: string;
  serie: string;
  naturezaOperacao: string;
  dataEmissao: string;
  valorTotal: number;
  valorProdutos: number;
  valorFrete: number;
  valorDesconto: number;
  emitente: {
    cnpj: string;
    razaoSocial: string;
    nomeFantasia?: string;
    ie?: string;
    logradouro?: string;
    numero?: string;
    bairro?: string;
    municipio?: string;
    uf: string;
    cep?: string;
  };
  destinatario: {
    cnpj: string;
    razaoSocial: string;
    ie?: string;
    uf: string;
  };
  itens: NFeItem[];
  cobranca?: {
    duplicatas: NFeDuplicata[];
  };
  xmlOriginal: string;
};

export type DocumentoDFe = NFeResumo | NFeCompleta;

export type ManifestacaoTipo =
  | "210200" // Confirmação da Operação
  | "210210" // Ciência da Emissão
  | "210220" // Desconhecimento da Operação
  | "210240"; // Operação não Realizada

export type SincronizacaoResultado = {
  sucesso: boolean;
  cnpj: string;
  ultNSUInicial: string;
  ultNSUFinal: string;
  maxNSU: string;
  documentosEncontrados: number;
  notasCompletasBaixadas: number;
  resumosManifestados: number;
  mensagem: string;
  bloqueioConsumoIndevido?: boolean;
  documentos: DocumentoDFe[];
};

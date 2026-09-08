import https from "node:https";
import zlib from "node:zlib";
import { parseProcNFe, parseResNFe } from "./nfe-parser";
import type { DocumentoDFe, SincronizacaoResultado } from "./types";
import {
  atualizarPonteiroNSU,
  obterCertificadoA1Descriptografado,
} from "./certificado";

const URL_SEFAZ_DISTRIBUICAO_PROD =
  "https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx";
const URL_SEFAZ_DISTRIBUICAO_HOM =
  "https://hom1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx";

/**
 * Monta o Envelope SOAP 1.2 para consulta de distribuição de DF-e na SEFAZ
 */
export function montarEnvelopeDistDFe(params: {
  cnpj: string;
  ultNSU: string;
  ambiente?: "PRODUCAO" | "HOMOLOGACAO";
  cUFAutor?: string;
}): string {
  const tpAmb = params.ambiente === "HOMOLOGACAO" ? "2" : "1";
  const ultNSUFormatado = params.ultNSU.padStart(15, "0");
  const cUF = params.cUFAutor || "35"; // Padrão SP / 91 Nacional

  return `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <nfeDistDFeInteresse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe">
      <nfeDadosMsg>
        <distDFeInt xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01">
          <tpAmb>${tpAmb}</tpAmb>
          <cUFAutor>${cUF}</cUFAutor>
          <CNPJ>${params.cnpj.replace(/\D/g, "")}</CNPJ>
          <distNSU>
            <ultNSU>${ultNSUFormatado}</ultNSU>
          </distNSU>
        </distDFeInt>
      </nfeDadosMsg>
    </nfeDistDFeInteresse>
  </soap12:Body>
</soap12:Envelope>`.trim();
}

/**
 * Envia uma requisição SOAP mTLS para a SEFAZ utilizando o Certificado A1 (.pfx)
 */
export async function enviarSoapSefaz(params: {
  url: string;
  xmlPayload: string;
  pfxBuffer: Buffer;
  senha: string;
}): Promise<string> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(params.url);

    const agent = new https.Agent({
      pfx: params.pfxBuffer,
      passphrase: params.senha,
      rejectUnauthorized: true,
      minVersion: "TLSv1.2",
    });

    const payloadBuffer = Buffer.from(params.xmlPayload, "utf-8");

    const req = https.request(
      {
        hostname: urlObj.hostname,
        port: 443,
        path: urlObj.pathname,
        method: "POST",
        agent,
        headers: {
          "Content-Type":
            'application/soap+xml; charset=utf-8; action="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe/nfeDistDFeInteresse"',
          "Content-Length": payloadBuffer.length,
          Connection: "close",
        },
        timeout: 30000,
      },
      (res) => {
        let responseData = "";
        res.setEncoding("utf-8");

        res.on("data", (chunk) => {
          responseData += chunk;
        });

        res.on("end", () => {
          resolve(responseData);
        });
      }
    );

    req.on("error", (err) => {
      reject(new Error(`Falha na comunicação mTLS com SEFAZ: ${err.message}`));
    });

    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Timeout de 30s ao aguardar resposta da SEFAZ"));
    });

    req.write(payloadBuffer);
    req.end();
  });
}

/**
 * Descompacta e processa os documentos `docZip` retornados pela SEFAZ
 */
export function processarRetornoDistDFe(xmlResposta: string): {
  cStat: string;
  xMotivo: string;
  ultNSU: string;
  maxNSU: string;
  documentos: DocumentoDFe[];
} {
  const cStatMatch = xmlResposta.match(/<cStat>(\d+)<\/cStat>/i);
  const xMotivoMatch = xmlResposta.match(/<xMotivo>([^<]+)<\/xMotivo>/i);
  const ultNSUMatch = xmlResposta.match(/<ultNSU>(\d+)<\/ultNSU>/i);
  const maxNSUMatch = xmlResposta.match(/<maxNSU>(\d+)<\/maxNSU>/i);

  const cStat = cStatMatch ? cStatMatch[1] : "";
  const xMotivo = xMotivoMatch ? xMotivoMatch[1] : "";
  const ultNSU = ultNSUMatch ? ultNSUMatch[1] : "0";
  const maxNSU = maxNSUMatch ? maxNSUMatch[1] : "0";

  const documentos: DocumentoDFe[] = [];

  // Extrai todos os nós <docZip NSU="..." schema="...">base64_gz</docZip>
  const docZipRegex = /<docZip[^>]*NSU=["'](\d+)["'][^>]*>([\s\S]*?)<\/docZip>/gi;
  let match: RegExpExecArray | null;

  while ((match = docZipRegex.exec(xmlResposta)) !== null) {
    const docNSU = match[1];
    const base64Gz = match[2].trim();

    try {
      const bufferGz = Buffer.from(base64Gz, "base64");
      const xmlDoc = zlib.gunzipSync(bufferGz).toString("utf-8");

      if (xmlDoc.includes("<resNFe") || xmlDoc.includes("resNFe")) {
        const docResumo = parseResNFe(xmlDoc, docNSU);
        documentos.push(docResumo);
      } else if (xmlDoc.includes("<infNFe") || xmlDoc.includes("<nfeProc") || xmlDoc.includes("<NFe")) {
        const docCompleto = parseProcNFe(xmlDoc, docNSU);
        documentos.push(docCompleto);
      }
    } catch (err) {
      console.error(`Erro ao descompactar docZip NSU ${docNSU}:`, err);
    }
  }

  return {
    cStat,
    xMotivo,
    ultNSU,
    maxNSU,
    documentos,
  };
}

/**
 * Orquestrador principal: Executa o ciclo de sincronização de notas na SEFAZ para uma organização
 */
export async function sincronizarNFeOrganizacao(params: {
  organizationId: string;
  ambiente?: "PRODUCAO" | "HOMOLOGACAO";
  limiteIteracoes?: number;
}): Promise<SincronizacaoResultado> {
  const certData = await obterCertificadoA1Descriptografado(params.organizationId);

  if (!certData) {
    throw new Error(
      "Certificado Digital A1 não encontrado ou inativo para esta organização."
    );
  }

  const agora = new Date();

  // Verifica se está no intervalo de bloqueio anti-consumo indevido (Rejeição 656)
  if (certData.bloqueadoAte) {
    const dataBloqueio = new Date(certData.bloqueadoAte);
    if (dataBloqueio > agora) {
      const minutosRestantes = Math.ceil(
        (dataBloqueio.getTime() - agora.getTime()) / (1000 * 60)
      );
      return {
        sucesso: false,
        cnpj: certData.cnpj,
        ultNSUInicial: certData.ultNSU,
        ultNSUFinal: certData.ultNSU,
        maxNSU: certData.maxNSU,
        documentosEncontrados: 0,
        notasCompletasBaixadas: 0,
        resumosManifestados: 0,
        mensagem: `Sincronização em pausa preventiva (Consumo Indevido SEFAZ). Tente novamente em ${minutosRestantes} minuto(s).`,
        bloqueioConsumoIndevido: true,
        documentos: [],
      };
    }
  }

  const ambiente = params.ambiente || "PRODUCAO";
  const urlSefaz =
    ambiente === "HOMOLOGACAO"
      ? URL_SEFAZ_DISTRIBUICAO_HOM
      : URL_SEFAZ_DISTRIBUICAO_PROD;

  let ultNSUAtual = certData.ultNSU;
  let maxNSUAtual = certData.maxNSU;
  const ultNSUInicial = certData.ultNSU;
  const todosDocumentos: DocumentoDFe[] = [];
  const maxIteracoes = params.limiteIteracoes || 3;
  let iteracao = 0;

  while (iteracao < maxIteracoes) {
    iteracao++;

    const envelopeXml = montarEnvelopeDistDFe({
      cnpj: certData.cnpj,
      ultNSU: ultNSUAtual,
      ambiente,
    });

    let xmlResposta: string;
    try {
      xmlResposta = await enviarSoapSefaz({
        url: urlSefaz,
        xmlPayload: envelopeXml,
        pfxBuffer: certData.pfxBuffer,
        senha: certData.senha,
      });
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return {
        sucesso: false,
        cnpj: certData.cnpj,
        ultNSUInicial,
        ultNSUFinal: ultNSUAtual,
        maxNSU: maxNSUAtual,
        documentosEncontrados: todosDocumentos.length,
        notasCompletasBaixadas: 0,
        resumosManifestados: 0,
        mensagem: `Erro de conexão SEFAZ: ${errorMsg}`,
        documentos: todosDocumentos,
      };
    }

    const resultadoDist = processarRetornoDistDFe(xmlResposta);

    // Rejeição 656: Consumo Indevido (SEFAZ exige aguardar 1 hora)
    if (resultadoDist.cStat === "656") {
      const umHoraAFrente = new Date(agora.getTime() + 65 * 60 * 1000).toISOString();
      await atualizarPonteiroNSU({
        organizationId: params.organizationId,
        ultNSU: ultNSUAtual,
        maxNSU: maxNSUAtual,
        bloqueadoAte: umHoraAFrente,
      });

      return {
        sucesso: false,
        cnpj: certData.cnpj,
        ultNSUInicial,
        ultNSUFinal: ultNSUAtual,
        maxNSU: maxNSUAtual,
        documentosEncontrados: todosDocumentos.length,
        notasCompletasBaixadas: 0,
        resumosManifestados: 0,
        mensagem: "SEFAZ retornou Rejeição 656 (Consumo Indevido). Próxima consulta liberada em 1 hora.",
        bloqueioConsumoIndevido: true,
        documentos: todosDocumentos,
      };
    }

    // Status 137: Nenhum documento localizado
    if (resultadoDist.cStat === "137") {
      ultNSUAtual = resultadoDist.ultNSU || ultNSUAtual;
      maxNSUAtual = resultadoDist.maxNSU || maxNSUAtual;
      break;
    }

    // Status 138: Documentos localizados
    if (resultadoDist.cStat === "138") {
      todosDocumentos.push(...resultadoDist.documentos);
      ultNSUAtual = resultadoDist.ultNSU || ultNSUAtual;
      maxNSUAtual = resultadoDist.maxNSU || maxNSUAtual;

      // Se já alcançou o maxNSU, não há mais documentos na fila
      if (
        Number.parseInt(ultNSUAtual, 10) >= Number.parseInt(maxNSUAtual, 10)
      ) {
        break;
      }
    } else {
      // Outro status de erro ou rejeição
      break;
    }
  }

  // Atualiza no banco o novo NSU alcançado
  await atualizarPonteiroNSU({
    organizationId: params.organizationId,
    ultNSU: ultNSUAtual,
    maxNSU: maxNSUAtual,
    bloqueadoAte: null,
  });

  const notasCompletas = todosDocumentos.filter((d) => d.tipo === "COMPLETA").length;
  const resumos = todosDocumentos.filter((d) => d.tipo === "RESUMO").length;

  return {
    sucesso: true,
    cnpj: certData.cnpj,
    ultNSUInicial,
    ultNSUFinal: ultNSUAtual,
    maxNSU: maxNSUAtual,
    documentosEncontrados: todosDocumentos.length,
    notasCompletasBaixadas: notasCompletas,
    resumosManifestados: resumos,
    mensagem: `Sincronização concluída com sucesso. ${todosDocumentos.length} documento(s) processado(s) da SEFAZ.`,
    documentos: todosDocumentos,
  };
}

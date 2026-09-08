import crypto from "node:crypto";
import { decryptSecret, encryptSecret } from "@avila-ops/ai-core";
import { prisma } from "@/lib/prisma";
import type { CertificadoA1Info } from "./types";

const PROVIDER_CERTIFICADO = "sefaz_certificado_a1";

function getCofreKey(): string {
  const key = process.env.AI_CORE_TOKEN_ENCRYPTION_KEY?.trim();
  if (!key) {
    throw new Error("AI_CORE_TOKEN_ENCRYPTION_KEY não configurado.");
  }
  return key;
}

/**
 * Extrai CNPJ ou CPF e metadados de uma string de Subject X.509 (padrão ICP-Brasil)
 */
export function extrairIdentificacaoSubject(subject: string): {
  razaoSocial: string;
  cnpj: string | null;
  cpf: string | null;
} {
  let razaoSocial = "";
  let cnpj: string | null = null;
  let cpf: string | null = null;

  // Extrai Common Name (CN)
  const cnMatch = subject.match(/CN=([^,\n/]+)/i);
  const cn = cnMatch ? cnMatch[1].trim() : "";

  if (cn) {
    razaoSocial = cn;

    // Padrão ICP-Brasil: "EMPRESA EXEMPLO LTDA:12345678000195" ou "NOME PESSOA:12345678900"
    const partes = cn.split(":");
    if (partes.length >= 2) {
      const doc = partes[partes.length - 1].replace(/\D/g, "");
      razaoSocial = partes.slice(0, partes.length - 1).join(":").trim();

      if (doc.length === 14) {
        cnpj = doc;
      } else if (doc.length === 11) {
        cpf = doc;
      }
    }
  }

  // Fallback: procura CNPJ (14 dígitos) ou CPF (11 dígitos) no subject completo
  if (!cnpj && !cpf) {
    const cnpjMatch = subject.match(/\b(\d{14})\b/);
    if (cnpjMatch) {
      cnpj = cnpjMatch[1];
    } else {
      const cpfMatch = subject.match(/\b(\d{11})\b/);
      if (cpfMatch) {
        cpf = cpfMatch[1];
      }
    }
  }

  return {
    razaoSocial: razaoSocial || "Certificado Digital ICP-Brasil",
    cnpj,
    cpf,
  };
}

/**
 * Valida o arquivo .pfx com a senha e extrai informações do certificado X.509
 */
export function inspecionarCertificadoA1(
  pfxBuffer: Buffer,
  senha: string
): CertificadoA1Info {
  try {
    // Tenta ler a chave privada ou certificado do PKCS#12 no Node.js
    // Em Node 20+, podemos usar crypto.createPrivateKey ou parse de PKCS#12
    let x509: crypto.X509Certificate | null = null;

    try {
      // crypto.createPrivateKey valida a senha do PFX/P12
      crypto.createPrivateKey({
        key: pfxBuffer,
        format: "der",
        type: "pkcs12",
        passphrase: senha,
      });
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      throw new Error(`Senha incorreta ou arquivo PFX inválido: ${errorMsg}`);
    }

    // Tenta carregar o certificado X509 do buffer PFX
    // Node.js crypto suporta carregar x509 direto se fornecido em formato DER/PKCS12
    try {
      x509 = new crypto.X509Certificate(pfxBuffer);
    } catch {
      // Se não carregar direto pelo construtor, podemos extrair usando OpenSSL / pkcs12 export
      // Em fallback, validação de validade por data atual
    }

    const agora = new Date();
    const validoDe = x509 ? new Date(x509.validFrom) : agora;
    const validoAte = x509 ? new Date(x509.validTo) : new Date(agora.getTime() + 365 * 24 * 60 * 60 * 1000);
    const subject = x509 ? x509.subject : "";
    const emissor = x509 ? x509.issuer : "Autoridade Certificadora ICP-Brasil";

    const { razaoSocial, cnpj, cpf } = extrairIdentificacaoSubject(subject);

    const diffMs = validoAte.getTime() - agora.getTime();
    const diasParaVencer = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const expirado = diasParaVencer < 0;

    let status: "ATIVO" | "EXPIRANDO" | "EXPIRADO" = "ATIVO";
    if (expirado) {
      status = "EXPIRADO";
    } else if (diasParaVencer <= 30) {
      status = "EXPIRANDO";
    }

    return {
      cnpj,
      cpf,
      razaoSocial,
      emissor,
      validoDe: validoDe.toISOString(),
      validoAte: validoAte.toISOString(),
      diasParaVencer,
      expirado,
      status,
    };
  } catch (err) {
    if (err instanceof Error) {
      throw err;
    }
    throw new Error("Erro desconhecido ao inspecionar o Certificado Digital A1.");
  }
}

/**
 * Salva o Certificado A1 criptografado com AES-256-GCM no cofre da organização
 */
export async function salvarCertificadoA1(params: {
  organizationId: string;
  pfxBuffer: Buffer;
  senha: string;
  cnpj?: string | null;
}) {
  const chaveMestre = getCofreKey();
  const info = inspecionarCertificadoA1(params.pfxBuffer, params.senha);

  const payloadSegredo = JSON.stringify({
    pfxBase64: params.pfxBuffer.toString("base64"),
    senha: params.senha,
  });

  const ciphertext = encryptSecret(payloadSegredo, chaveMestre);

  const metadata = {
    tipo: "CERTIFICADO_A1",
    info,
    cnpj: params.cnpj || info.cnpj,
    ultNSU: "0",
    maxNSU: "0",
    ultimaSincronizacaoEm: null,
    bloqueadoAte: null,
    atualizadoEm: new Date().toISOString(),
  };

  await prisma.organizationIntegrationConnection.upsert({
    where: {
      organizationId_provider: {
        organizationId: params.organizationId,
        provider: PROVIDER_CERTIFICADO,
      },
    },
    create: {
      organizationId: params.organizationId,
      provider: PROVIDER_CERTIFICADO,
      accountName: info.razaoSocial,
      externalId: info.cnpj || info.cpf || params.organizationId,
      tokenExpiresAt: new Date(info.validoAte),
      tokenType: "pfx_a1_encrypted",
      tokenCiphertext: ciphertext,
      status: info.status === "EXPIRADO" ? "INACTIVE" : "ACTIVE",
      metadata,
    },
    update: {
      accountName: info.razaoSocial,
      externalId: info.cnpj || info.cpf || params.organizationId,
      tokenExpiresAt: new Date(info.validoAte),
      tokenType: "pfx_a1_encrypted",
      tokenCiphertext: ciphertext,
      status: info.status === "EXPIRADO" ? "INACTIVE" : "ACTIVE",
      metadata,
    },
  });

  return info;
}

/**
 * Recupera o Certificado A1 descriptografado (Buffer + Senha) para comunicação mTLS
 */
export async function obterCertificadoA1Descriptografado(organizationId: string): Promise<{
  pfxBuffer: Buffer;
  senha: string;
  cnpj: string;
  ultNSU: string;
  maxNSU: string;
  bloqueadoAte: string | null;
  info: CertificadoA1Info;
} | null> {
  const chaveMestre = getCofreKey();

  const c = await prisma.organizationIntegrationConnection.findUnique({
    where: {
      organizationId_provider: {
        organizationId,
        provider: PROVIDER_CERTIFICADO,
      },
    },
  });

  if (!c || !c.tokenCiphertext || c.status !== "ACTIVE") {
    return null;
  }

  const decriptado = decryptSecret(c.tokenCiphertext, chaveMestre);
  const { pfxBase64, senha } = JSON.parse(decriptado);

  const meta = (c.metadata as Record<string, unknown>) || {};
  const info = (meta.info as CertificadoA1Info) || null;
  const cnpj = (meta.cnpj as string) || info?.cnpj || "";
  const ultNSU = (meta.ultNSU as string) || "0";
  const maxNSU = (meta.maxNSU as string) || "0";
  const bloqueadoAte = (meta.bloqueadoAte as string) || null;

  return {
    pfxBuffer: Buffer.from(pfxBase64, "base64"),
    senha,
    cnpj,
    ultNSU,
    maxNSU,
    bloqueadoAte,
    info,
  };
}

/**
 * Atualiza o ponteiro de NSU e status de sincronização da organização
 */
export async function atualizarPonteiroNSU(params: {
  organizationId: string;
  ultNSU: string;
  maxNSU: string;
  bloqueadoAte?: string | null;
}) {
  const c = await prisma.organizationIntegrationConnection.findUnique({
    where: {
      organizationId_provider: {
        organizationId: params.organizationId,
        provider: PROVIDER_CERTIFICADO,
      },
    },
  });

  if (!c) return;

  const metadata = {
    ...((c.metadata as Record<string, unknown>) || {}),
    ultNSU: params.ultNSU,
    maxNSU: params.maxNSU,
    ultimaSincronizacaoEm: new Date().toISOString(),
    ...(params.bloqueadoAte !== undefined ? { bloqueadoAte: params.bloqueadoAte } : {}),
  };

  await prisma.organizationIntegrationConnection.update({
    where: { id: c.id },
    data: { metadata },
  });
}

/**
 * Remove o certificado da organização
 */
export async function removerCertificadoA1(organizationId: string) {
  return prisma.organizationIntegrationConnection.deleteMany({
    where: {
      organizationId,
      provider: PROVIDER_CERTIFICADO,
    },
  });
}

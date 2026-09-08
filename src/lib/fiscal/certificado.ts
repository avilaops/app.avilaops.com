import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
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
 * Lê o certificado de dentro de um .pfx usando o OpenSSL do sistema.
 *
 * Erro de senha e arquivo corrompido saem com mensagens diferentes: quem
 * envia o certificado precisa saber se digitou a senha errada ou se mandou o
 * arquivo errado.
 */
function extrairCertificadoDoPfx(
  pfxBuffer: Buffer,
  senha: string
): crypto.X509Certificate {
  const resultado = spawnSync(
    "openssl",
    [
      "pkcs12",
      "-in", "/dev/stdin",
      "-clcerts",
      "-nokeys",
      "-passin", "env:PFX_SENHA",
      // Certificado emitido com cifra antiga (RC2) e comum no parque
      // brasileiro e o OpenSSL 3 recusa sem esta opcao.
      "-legacy",
    ],
    {
      input: pfxBuffer,
      env: { ...process.env, PFX_SENHA: senha },
      maxBuffer: 10 * 1024 * 1024,
      timeout: 15000,
    }
  );

  if (resultado.error) {
    throw new Error(
      `Não foi possível ler o certificado: ${resultado.error.message}`
    );
  }

  const saida = resultado.stdout?.toString("utf8") ?? "";
  const erro = resultado.stderr?.toString("utf8") ?? "";

  if (resultado.status !== 0 || !saida.includes("BEGIN CERTIFICATE")) {
    if (/mac verify (failure|error)|invalid password|wrong password/i.test(erro)) {
      throw new Error("Senha do certificado incorreta.");
    }
    const primeiraLinha = erro.trim().split(/\r?\n/)[0] ?? "";
    throw new Error(
      primeiraLinha
        ? `Arquivo .pfx inválido ou ilegível: ${primeiraLinha}`
        : "Arquivo .pfx inválido ou ilegível."
    );
  }

  const pem = saida.slice(
    saida.indexOf("-----BEGIN CERTIFICATE-----"),
    saida.indexOf("-----END CERTIFICATE-----") + "-----END CERTIFICATE-----".length
  );

  try {
    return new crypto.X509Certificate(pem);
  } catch (err) {
    const detalhe = err instanceof Error ? err.message : String(err);
    throw new Error(`Certificado ilegível dentro do .pfx: ${detalhe}`);
  }
}

/**
 * Valida o arquivo .pfx com a senha e extrai informações do certificado X.509
 */
export function inspecionarCertificadoA1(
  pfxBuffer: Buffer,
  senha: string
): CertificadoA1Info {
  try {
    // O Node NAO le PKCS#12: crypto.createPrivateKey aceita apenas pkcs1,
    // pkcs8 e sec1, e o construtor de X509Certificate espera PEM ou DER de um
    // certificado, nao um cofre .pfx. A versao anterior pedia type "pkcs12" e
    // caia sempre no catch, entao dizia "senha incorreta" mesmo com a senha
    // certa, e as datas de validade eram inventadas (hoje + 365 dias).
    //
    // Quem le PKCS#12 aqui e o OpenSSL, que ja existe na imagem. A senha vai
    // por variavel de ambiente para nao aparecer na lista de processos, e o
    // .pfx por stdin para nao tocar o disco.
    const x509 = extrairCertificadoDoPfx(pfxBuffer, senha);

    const agora = new Date();
    const validoDe = new Date(x509.validFrom);
    const validoAte = new Date(x509.validTo);
    const subject = x509.subject;
    const emissor = x509.issuer;

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

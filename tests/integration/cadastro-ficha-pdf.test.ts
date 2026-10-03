import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";

/**
 * Cadastro a partir de ficha cadastral em PDF, de ponta a ponta: o PDF vira
 * campos (POST /api/fichas/ler) e o cadastro rápido grava contato, inscrições
 * e endereço junto com a organização (POST /api/organizations).
 */

vi.mock("@/lib/auth", () => ({
  getAdmin: async () => ({ id: "admin-de-teste", nome: "Teste", role: "OWNER" }),
}));

const { POST: lerFicha } = await import("@/app/api/fichas/ler/route");
const { POST: criarOrganizacao } = await import("@/app/api/organizations/route");

const NOME = "Teste Ficha PDF Equipamentos";
const CNPJ_VALIDO = "11222333000181";

/**
 * PDF mínimo, montado à mão, com uma linha de texto por item. Dados fictícios:
 * a ficha real de cliente não entra no repositório.
 */
function pdfComLinhas(linhas: string[]): Uint8Array<ArrayBuffer> {
  // WinAnsi: os acentos do português cabem num byte cada.
  const escapar = (texto: string) =>
    Array.from(texto)
      .map((caractere) => {
        const codigo = caractere.charCodeAt(0);
        if (caractere === "(" || caractere === ")" || caractere === "\\") return `\\${caractere}`;
        return codigo > 126 ? `\\${codigo.toString(8)}` : caractere;
      })
      .join("");
  const conteudo = [
    "BT /F1 11 Tf 50 780 Td 14 TL",
    ...linhas.map((linha) => `(${escapar(linha)}) Tj T*`),
    "ET",
  ].join("\n");

  const objetos = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${Buffer.byteLength(conteudo, "latin1")} >>\nstream\n${conteudo}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
  ];

  let pdf = "%PDF-1.4\n";
  const posicoes: number[] = [];
  objetos.forEach((objeto, indice) => {
    posicoes.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${indice + 1} 0 obj\n${objeto}\nendobj\n`;
  });
  const inicioXref = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  pdf += posicoes.map((posicao) => `${String(posicao).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${inicioXref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(pdf, "latin1"));
}

async function enviarFicha(bytes: Uint8Array<ArrayBuffer>, nome = "ficha.pdf") {
  const form = new FormData();
  form.append("arquivo", new File([bytes], nome, { type: "application/pdf" }));
  const request = new NextRequest("http://localhost/api/fichas/ler", { method: "POST", body: form });
  const resposta = await lerFicha(request);
  return {
    status: resposta.status,
    json: (await resposta.json()) as { ficha?: Record<string, string>; campos?: string[]; error?: string },
  };
}

async function criar(body: Record<string, unknown>) {
  const request = new NextRequest("http://localhost/api/organizations", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ hasCurrentSite: "NO", selectedDomainPlanSlug: "domain-none", ...body }),
  });
  const resposta = await criarOrganizacao(request);
  return {
    status: resposta.status,
    json: (await resposta.json()) as { organization?: { id: string }; error?: string },
  };
}

async function limpar() {
  await prisma.organization.deleteMany({
    where: { OR: [{ name: NOME }, { cpfCnpj: CNPJ_VALIDO }] },
  });
}

beforeEach(limpar);
afterAll(limpar);

describe("leitura da ficha em PDF", () => {
  it("devolve os campos reconhecidos", async () => {
    const { status, json } = await enviarFicha(
      pdfComLinhas([
        "FICHA CADASTRAL",
        "Razão Social: TESTE FICHA PDF EQUIPAMENTOS LTDA",
        "Nome de Fantasia: TESTE FICHA PDF",
        "CNPJ: 11.222.333/0001-81",
        "Inscrição Estadual: 123.456.789.110",
        "Endereço: Rua das Flores, 250",
        "Bairro: Centro",
        "CEP: 15.500-000",
        "Cidade: Votuporanga - SP",
        "WhatsApp: (17) 99999-0000",
        "Email: Contato@Exemplo.com.br",
      ]),
    );

    expect(status).toBe(200);
    expect(json.ficha).toMatchObject({
      razaoSocial: "Teste Ficha PDF Equipamentos Ltda",
      nomeFantasia: "Teste Ficha PDF",
      cpfCnpj: CNPJ_VALIDO,
      inscricaoEstadual: "123.456.789.110",
      logradouro: "Rua das Flores",
      numero: "250",
      bairro: "Centro",
      cep: "15500-000",
      cidade: "Votuporanga",
      uf: "SP",
      whatsapp: "(17) 99999-0000",
      email: "contato@exemplo.com.br",
    });
  });

  it("recusa arquivo que não é PDF, mesmo com nome .pdf", async () => {
    const { status } = await enviarFicha(new TextEncoder().encode("Razão Social: X"), "ficha.pdf");
    expect(status).toBe(415);
  });

  it("PDF sem rótulo reconhecível explica o que procura", async () => {
    const { status, json } = await enviarFicha(pdfComLinhas(["Prezados, segue em anexo."]));
    expect(status).toBe(422);
    expect(json.error).toContain("Razão Social");
  });
});

describe("cadastro rápido com os dados da ficha", () => {
  it("grava inscrição, contato e endereço com a organização", async () => {
    const { status, json } = await criar({
      name: NOME,
      legalName: "TESTE FICHA PDF EQUIPAMENTOS LTDA",
      cpfCnpj: CNPJ_VALIDO,
      perfil: {
        stateRegistration: "123.456.789.110",
        ownerName: "Maria Souza",
        whatsapp: "(17) 99999-0000",
        email: "contato@exemplo.com.br",
        postalCode: "15500-000",
        street: "Rua das Flores",
        number: "250",
        district: "Centro",
        city: "Votuporanga",
        state: "SP",
      },
    });

    expect(status).toBe(201);
    const id = json.organization!.id;
    const perfil = await prisma.organizationProfile.findUniqueOrThrow({ where: { organizationId: id } });
    expect(perfil).toMatchObject({
      stateRegistration: "123.456.789.110",
      email: "contato@exemplo.com.br",
      city: "Votuporanga",
      state: "SP",
    });
    const endereco = await prisma.organizationAddress.findFirstOrThrow({ where: { organizationId: id } });
    expect(endereco).toMatchObject({ street: "Rua das Flores", number: "250", source: "FICHA_PDF", isPrimary: true });
    const contato = await prisma.organizationContact.findFirstOrThrow({ where: { organizationId: id } });
    expect(contato).toMatchObject({ name: "Maria Souza", whatsapp: "(17) 99999-0000", isPrimary: true });
  });

  it("sem responsável na ficha, não inventa contato", async () => {
    const { status, json } = await criar({
      name: NOME,
      perfil: { email: "contato@exemplo.com.br", city: "Votuporanga" },
    });
    expect(status).toBe(201);
    const id = json.organization!.id;
    expect(await prisma.organizationContact.count({ where: { organizationId: id } })).toBe(0);
  });

  it("cadastro digitado, sem ficha, continua sem perfil", async () => {
    const { status, json } = await criar({ name: NOME });
    expect(status).toBe(201);
    const id = json.organization!.id;
    expect(await prisma.organizationProfile.count({ where: { organizationId: id } })).toBe(0);
  });

  it("recusa e-mail inválido vindo da ficha", async () => {
    const { status } = await criar({ name: NOME, perfil: { email: "sem-arroba" } });
    expect(status).toBe(400);
  });
});

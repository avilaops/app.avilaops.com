/**
 * Semente só para a conferência visual: um admin para logar e um cliente com
 * uma logo de verdade no cadastro, para o gerador de ícones ter origem.
 * Roda contra o Postgres descartável do scratchpad — nunca contra produção.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect x="40" y="40" width="432" height="432" rx="96" fill="#1d6fe0"/>
  <path d="M256 128 L360 384 H300 L256 268 L212 384 H152 Z" fill="#ffffff"/>
</svg>`;

async function main() {
  const senhaHash = await bcrypt.hash("visual123", 10);
  await prisma.adminIdentity.upsert({
    where: { id: "admin-visual" },
    update: { senhaHash, ativo: true, senhaProvisoria: false },
    create: {
      id: "admin-visual",
      nome: "Nicolas",
      email: "nicolas@avilaops.com",
      senhaHash,
      senhaProvisoria: false,
      role: "OWNER",
      ativo: true,
    },
  });

  const org = await prisma.organization.upsert({
    where: { slug: "saude-pet-brasil" },
    update: {},
    create: {
      id: "org-visual",
      name: "Saúde Pet Brasil",
      slug: "saude-pet-brasil",
      legalName: "Saúde Pet Brasil LTDA",
      segment: "Petshop",
      siteUrl: "https://saudepet.app.br",
      status: "ONBOARDING",
    },
  });

  const existente = await prisma.organizationBrandAsset.findFirst({
    where: { organizationId: org.id, assetType: "Logo principal" },
  });

  if (!existente) {
    const relativo = `${org.id}/Logo_principal/${Date.now()}-logo.svg`;
    const absoluto = path.join(process.cwd(), "storage", "organization-assets", relativo);
    await mkdir(path.dirname(absoluto), { recursive: true });
    await writeFile(absoluto, LOGO_SVG);

    await prisma.organizationBrandAsset.create({
      data: {
        organizationId: org.id,
        assetType: "Logo principal",
        name: "logo.svg",
        storageKey: `local:${relativo}`,
        format: "svg",
        mimeType: "image/svg+xml",
        sizeBytes: LOGO_SVG.length,
        version: "1",
        isCurrent: true,
        uploadedBy: "nicolas@avilaops.com",
      },
    });
  }

  console.log("organizationId:", org.id);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

function bucket(): string {
  const value = process.env.R2_BUCKET;
  if (!value) throw new Error("Configure R2_BUCKET");
  return value;
}

function client(): S3Client {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "Configure CLOUDFLARE_ACCOUNT_ID, R2_ACCESS_KEY_ID e R2_SECRET_ACCESS_KEY"
    );
  }
  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
}

export async function uploadClientDocument(
  requestId: string,
  fileName: string,
  buffer: Buffer,
  mimeType: string
): Promise<string> {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
  const key = `client-registration-requests/${requestId}/${Date.now()}-${safeName}`;

  await client().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: buffer,
      ContentType: mimeType,
    })
  );

  return key;
}

export async function getClientDocumentDownloadUrl(key: string): Promise<string> {
  const command = new GetObjectCommand({ Bucket: bucket(), Key: key });
  return getSignedUrl(client(), command, { expiresIn: 300 });
}

export async function uploadOrganizationBrandAsset(
  organizationId: string,
  assetType: string,
  fileName: string,
  buffer: Buffer,
  mimeType: string,
): Promise<string> {
  const safeAssetType = assetType.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
  const key = `organizations/${organizationId}/brand-assets/${safeAssetType}/${Date.now()}-${safeName}`;

  await client().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: buffer,
      ContentType: mimeType,
    }),
  );

  return key;
}

export async function getPrivateObjectUrl(key: string): Promise<string> {
  const command = new GetObjectCommand({ Bucket: bucket(), Key: key });
  return getSignedUrl(client(), command, { expiresIn: 300 });
}

/** Baixa o objeto para a memória. Só para arquivo pequeno — logo, ícone, PDF de manual. */
export async function getObjectBuffer(key: string): Promise<Buffer> {
  const saida = await client().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
  if (!saida.Body) throw new Error("Objeto sem conteúdo.");
  return Buffer.from(await saida.Body.transformToByteArray());
}

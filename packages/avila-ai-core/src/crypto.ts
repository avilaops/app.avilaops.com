import crypto from "node:crypto";

/**
 * Mesmo padrão já usado em produção pelo app.avila.inc para o token da Meta
 * (src/lib/meta.ts): AES-256-GCM com chave derivada via SHA-256 de um segredo
 * de ambiente. Reaproveitado aqui em vez de inventar um segundo esquema de
 * criptografia no mesmo projeto.
 */
export function deriveKey(secret: string): Buffer {
  return crypto.createHash("sha256").update(secret).digest();
}

export function encryptSecret(value: string, secret: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", deriveKey(secret), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

export function decryptSecret(stored: string, secret: string): string {
  const [ivRaw, tagRaw, encryptedRaw] = stored.split(".");
  if (!ivRaw || !tagRaw || !encryptedRaw) {
    throw new Error("Segredo armazenado em formato inválido");
  }
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    deriveKey(secret),
    Buffer.from(ivRaw, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

import crypto from "crypto";

/**
 * Cifra dos tokens de cliente guardados em
 * `OrganizationIntegrationConnection.tokenCiphertext`.
 *
 * Existe como módulo próprio porque a tabela é uma só e agora tem mais de um
 * provedor gravando nela (Meta pelo Facebook, Instagram pelo login próprio).
 * Duas cópias da mesma cifra dariam certo até a primeira divergir, e aí o token
 * gravado por um lado deixaria de abrir do outro, com o erro aparecendo meses
 * depois e longe da causa.
 *
 * Não confundir com `src/lib/credenciais.ts`: lá é o cofre dos segredos DA
 * PLATAFORMA, com chave própria (`CREDENCIAIS_ENCRYPTION_KEY`). Aqui é o token
 * DE CADA CLIENTE, com `META_TOKEN_ENCRYPTION_KEY`. Os dois continuam
 * separados de propósito.
 *
 * O formato é `iv.tag.payload`, tudo em base64url, AES-256-GCM. Mudar o formato
 * ou a chave torna ilegível o que já está gravado.
 */

function chaveDeCifra() {
  const bruta = process.env.META_TOKEN_ENCRYPTION_KEY;
  if (!bruta) throw new Error("META_TOKEN_ENCRYPTION_KEY não configurado");
  return crypto.createHash("sha256").update(bruta).digest();
}

export function cifrarToken(token: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", chaveDeCifra(), iv);
  const cifrado = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);

  return [
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    cifrado.toString("base64url"),
  ].join(".");
}

export function decifrarToken(valor: string) {
  const [ivBruto, tagBruta, cifradoBruto] = valor.split(".");
  if (!ivBruto || !tagBruta || !cifradoBruto) {
    throw new Error("Token de conexão armazenado em formato inválido");
  }

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    chaveDeCifra(),
    Buffer.from(ivBruto, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagBruta, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(cifradoBruto, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

import { test } from "node:test";
import assert from "node:assert/strict";
import { encryptSecret, decryptSecret } from "../crypto";

test("encryptSecret/decryptSecret: round-trip preserva o valor original", () => {
  const secret = "chave-mestra-de-teste";
  const original = "sk-openai-fake-key-1234567890";

  const encrypted = encryptSecret(original, secret);
  assert.notEqual(encrypted, original);

  const decrypted = decryptSecret(encrypted, secret);
  assert.equal(decrypted, original);
});

test("decryptSecret: falha com segredo mestre incorreto", () => {
  const encrypted = encryptSecret("valor-secreto", "chave-correta");
  assert.throws(() => decryptSecret(encrypted, "chave-errada"));
});

test("decryptSecret: falha com formato inválido (sem os 3 segmentos)", () => {
  assert.throws(() => decryptSecret("formato-invalido", "qualquer-chave"));
});

test("encryptSecret: duas criptografias do mesmo valor produzem ciphertexts diferentes (IV aleatório)", () => {
  const a = encryptSecret("mesmo-valor", "chave");
  const b = encryptSecret("mesmo-valor", "chave");
  assert.notEqual(a, b);
});

/**
 * Confere a cifra do cofre sem precisar de banco: ida e volta, máscara,
 * classificação de segredo e recusa de payload adulterado.
 *
 *   npx tsx scripts/verificar-cofre.ts
 */
import { categoriaDaChave, cifrar, decifrar, ehSegredo, mascarar } from "../src/lib/credenciais";

let falhas = 0;

function conferir(rotulo: string, ok: boolean, detalhe = "") {
  if (!ok) falhas += 1;
  console.log(`${ok ? "OK   " : "FALHA"} ${rotulo}${detalhe ? ` — ${detalhe}` : ""}`);
}

for (const amostra of ["EAAXvNo6vskgBSFZAxXJFri2", "1670392484704840", "x", "a".repeat(4000)]) {
  const cifrado = cifrar(amostra);
  conferir(
    `ida e volta (${amostra.length} chars)`,
    decifrar(cifrado) === amostra,
    `máscara ${mascarar(amostra)}`,
  );
  conferir(`cifra não vaza o claro (${amostra.length} chars)`, !cifrado.includes(amostra.slice(0, 12)));
}

const cifradoOriginal = cifrar("segredo");
const [iv, tag, payload] = cifradoOriginal.split(".");
const adulterado = [iv, tag, payload.slice(0, -2) + "AA"].join(".");
let recusou = false;
try {
  decifrar(adulterado);
} catch {
  recusou = true;
}
conferir("payload adulterado é recusado", recusou);

let recusouFormato = false;
try {
  decifrar("lixo");
} catch {
  recusouFormato = true;
}
conferir("formato inválido é recusado", recusouFormato);

conferir("cifra é não determinística", cifrar("igual") !== cifrar("igual"));

const esperadoSegredo: Array<[string, boolean]> = [
  ["META_APP_SECRET", true],
  ["WHATSAPP_API_TOKEN", true],
  ["WHATSAPP_PIN_AVILAOPS", true],
  ["META_APP_ID", false],
  ["META_GRAPH_VERSION", false],
  ["META_REDIRECT_URI", false],
  ["MP_PUBLIC_KEY", false],
];
for (const [chave, esperado] of esperadoSegredo) {
  conferir(`ehSegredo(${chave}) = ${esperado}`, ehSegredo(chave) === esperado);
}

const esperadoCategoria: Array<[string, string]> = [
  ["META_APP_ID", "meta"],
  ["FACEBOOK_PIXEL_ID", "meta"],
  ["WHATSAPP_API_TOKEN", "whatsapp"],
  ["META_THREADS_APP_ID", "threads"],
  ["MP_ACCESS_TOKEN", "mercadopago"],
  ["ML_APP_ID", "mercadolivre"],
  ["X_CLIENT_ID", "x"],
  ["SOCIAL_WEBHOOK_TOKEN", "outros"],
];
for (const [chave, esperado] of esperadoCategoria) {
  const obtido = categoriaDaChave(chave);
  conferir(`categoriaDaChave(${chave}) = ${esperado}`, obtido === esperado, obtido);
}

conferir("máscara de valor curto não vaza nada", !mascarar("12345").includes("1"));

console.log(`\n${falhas === 0 ? "tudo certo" : `${falhas} falha(s)`}`);
process.exitCode = falhas === 0 ? 0 : 1;

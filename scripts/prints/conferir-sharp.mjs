/**
 * Confere se o `sharp` carrega de dentro do bundle standalone — e falha na hora
 * se não carregar.
 *
 * Por que existe: `next.config.ts` marca o sharp como `serverExternalPackages`,
 * então o servidor standalone não leva o módulo embutido, ele o resolve pelo
 * `node_modules` que o rastreamento do Next copiou para dentro do bundle. Esse
 * rastreamento leva o addon (`sharp-linux-x64-...node`) e a *pasta* do
 * `@img/sharp-libvips-linux-x64`, mas não o `libvips-cpp.so` de 18 MB que o
 * addon abre em tempo de execução. O resultado é ERR_DLOPEN_FAILED na primeira
 * tela que usa sharp — no CI, `/hub-social/estudio` devolvendo 500 depois de
 * cinco minutos de captura, com a causa escondida no log do app.
 *
 * Um teste determinístico de dois segundos vale mais do que essa descoberta
 * tardia, então o workflow roda esta sonda logo depois de preparar o bundle.
 *
 * A resolução parte de dentro de `.next/standalone/.next/server/`, que é de
 * onde os chunks compilados pedem o módulo. Resolver a partir da raiz do
 * repositório não serviria: ali o `node_modules` completo está presente e a
 * sonda passaria mesmo com o bundle quebrado.
 */
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import path from "node:path";

const raiz = process.cwd();
const origem = path.join(raiz, ".next", "standalone", ".next", "server", "index.js");

if (!existsSync(path.dirname(origem))) {
  console.error(`Sonda do sharp: ${path.dirname(origem)} não existe. Rode o build antes.`);
  process.exit(1);
}

const exigir = createRequire(origem);

let sharp;
try {
  sharp = exigir("sharp");
} catch (erro) {
  console.error("Sonda do sharp: o módulo não carregou de dentro do bundle standalone.");
  console.error(erro instanceof Error ? erro.message : erro);
  process.exit(1);
}

console.log("sharp resolvido em:", exigir.resolve("sharp"));
console.log("libvips:", sharp.versions?.vips ?? "(não informado)");

// Carregar não basta: o binding só abre a libvips de verdade quando alguma
// operação acontece. Oito por oito pixels são suficientes e não dependem de
// arquivo nenhum no disco.
try {
  const png = await sharp({
    create: { width: 8, height: 8, channels: 3, background: { r: 0, g: 0, b: 0 } },
  })
    .png()
    .toBuffer();
  const meta = await sharp(png).metadata();
  if (meta.width !== 8 || meta.height !== 8) {
    throw new Error(`metadata devolveu ${meta.width}x${meta.height}, esperado 8x8`);
  }
} catch (erro) {
  console.error("Sonda do sharp: o módulo carregou, mas a operação nativa falhou.");
  console.error(erro instanceof Error ? erro.message : erro);
  process.exit(1);
}

console.log("Sonda do sharp: ok — o binding nativo abriu a libvips dentro do bundle.");

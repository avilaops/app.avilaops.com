/**
 * Varre o monorepo inteiro e cruza, para cada chave de integração:
 *   - quais arquivos de código realmente leem a chave (process.env.X);
 *   - em quais .env ela tem valor e em quais está vazia.
 *
 * Serve para saber o que precisa ser preenchido de verdade e o que é só
 * anotação que nunca chega a lugar nenhum.
 *
 *   node scripts/inventario-chaves.mjs                 # varre a raiz do monorepo
 *   node scripts/inventario-chaves.mjs --raiz=.        # varre só este projeto
 *   node scripts/inventario-chaves.mjs --json          # saída bruta em JSON
 */
import fs from "node:fs";
import path from "node:path";

const IGNORAR = new Set([
  "node_modules", ".git", ".next", "dist", "build", "out", ".turbo", "coverage", ".vs",
]);
const EXT_CODIGO = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".yml", ".yaml", ".sh", ".py"]);

/** Prefixos considerados "chave de integração". Ajuste conforme o parque crescer. */
const PREFIXOS = [
  "META_", "FACEBOOK_", "INSTAGRAM_", "THREADS_", "WHATSAPP_", "GERENCIADOR_ANUNCIO_",
  "GCLOUD_", "GOOGLE_", "MERCADO_PAGO_", "MERCADOPAGO_", "MP_", "ML_",
  "X_", "SOCIAL_WEBHOOK_", "WEBHOOK_SECRET_",
];

const argumentos = process.argv.slice(2);
const raizArgumento = argumentos.find((a) => a.startsWith("--raiz="))?.split("=")[1] ?? "..";
const RAIZ = path.resolve(process.cwd(), raizArgumento);
const saidaJson = argumentos.includes("--json");

const usos = new Map();
const valores = new Map();

function interessa(chave) {
  return PREFIXOS.some((prefixo) => chave.startsWith(prefixo));
}

function anotar(mapa, chave, entrada) {
  if (!mapa.has(chave)) mapa.set(chave, new Set());
  mapa.get(chave).add(entrada);
}

function ehEnv(nome) {
  return nome === ".env" || nome.startsWith(".env.") || nome.endsWith(".env");
}

function andar(dir) {
  let entradas;
  try {
    entradas = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entrada of entradas) {
    if (IGNORAR.has(entrada.name)) continue;
    const completo = path.join(dir, entrada.name);

    if (entrada.isDirectory()) {
      andar(completo);
      continue;
    }

    const env = ehEnv(entrada.name);
    if (!env && !EXT_CODIGO.has(path.extname(entrada.name))) continue;

    let texto;
    try {
      if (fs.statSync(completo).size > 2_000_000) continue;
      texto = fs.readFileSync(completo, "utf8");
    } catch {
      continue;
    }

    const rel = path.relative(RAIZ, completo).split(path.sep).join("/");

    for (const linha of texto.split("\n")) {
      if (env) {
        const atribuicao = linha.trim().match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
        if (atribuicao && interessa(atribuicao[1])) {
          const preenchido = atribuicao[2].trim().length > 0;
          anotar(valores, atribuicao[1], `${rel}::${preenchido ? "cheio" : "vazio"}`);
        }
        continue;
      }

      if (!linha.includes("env")) continue;
      for (const achado of linha.matchAll(/(?:process\.env\.|process\.env\[["']|env\.)([A-Z][A-Z0-9_]*)/g)) {
        if (interessa(achado[1])) anotar(usos, achado[1], rel);
      }
    }
  }
}

andar(RAIZ);

const chaves = [...new Set([...usos.keys(), ...valores.keys()])].sort();

const relatorio = chaves.map((chave) => {
  const vs = [...(valores.get(chave) ?? [])];
  return {
    chave,
    consumidores: [...(usos.get(chave) ?? [])].sort(),
    cheios: vs.filter((v) => v.endsWith("::cheio")).map((v) => v.split("::")[0]).sort(),
    vazios: vs.filter((v) => v.endsWith("::vazio")).map((v) => v.split("::")[0]).sort(),
  };
});

if (saidaJson) {
  console.log(JSON.stringify(relatorio, null, 2));
} else {
  const usadas = relatorio.filter((r) => r.consumidores.length > 0);
  const orfas = relatorio.filter((r) => r.consumidores.length === 0);

  console.log(`Raiz varrida: ${RAIZ}`);
  console.log(`${relatorio.length} chaves | ${usadas.length} lidas por código | ${orfas.length} nunca lidas\n`);

  console.log("== LIDAS PELO CÓDIGO ==");
  for (const r of usadas) {
    const estado = r.cheios.length ? `valor em ${r.cheios.length} arquivo(s)` : "SEM VALOR EM NENHUM ARQUIVO";
    console.log(`  ${r.chave} — ${r.consumidores.length} consumidor(es), ${estado}`);
  }

  console.log("\n== NUNCA LIDAS (anotação, não configuração) ==");
  for (const r of orfas) {
    console.log(`  ${r.chave} — copiada em ${r.cheios.length} arquivo(s)`);
  }
}

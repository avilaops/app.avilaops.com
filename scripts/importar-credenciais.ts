/**
 * Carrega o cofre (`platform_credentials`) a partir dos `.env` espalhados pelo
 * monorepo, apurando de quebra quem lê cada chave no código.
 *
 * Roda seco por padrão: imprime o que faria e não toca no banco. Só grava com
 * `--aplicar`. Chave com valores divergentes entre arquivos é reportada em vez
 * de resolvida no escuro — escolher errado ali é trocar a credencial de
 * produção por uma de teste sem ninguém perceber.
 *
 *   npx tsx scripts/importar-credenciais.ts                 # simulação
 *   npx tsx scripts/importar-credenciais.ts --aplicar
 *   npx tsx scripts/importar-credenciais.ts --aplicar --so=META_,WHATSAPP_
 */
import fs from "node:fs";
import path from "node:path";
import { categoriaDaChave, salvarCredencial } from "../src/lib/credenciais";
import { prisma } from "../src/lib/prisma";

const RAIZ = path.resolve(process.cwd(), "..");
const IGNORAR = new Set([
  "node_modules", ".git", ".next", "dist", "build", "out", ".turbo", "coverage", ".vs",
]);
const EXT_CODIGO = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);

const PREFIXOS = [
  "META_", "FACEBOOK_", "INSTAGRAM_", "THREADS_", "WHATSAPP_", "GERENCIADOR_ANUNCIO_",
  "GCLOUD_", "GOOGLE_", "MERCADO_PAGO_", "MERCADOPAGO_", "MP_", "ML_",
  "X_", "SOCIAL_WEBHOOK_", "WEBHOOK_SECRET_",
];

/**
 * Quem ganha quando a mesma chave aparece com valores diferentes. A ordem não é
 * estética: `app.avilaops.com` é a plataforma que passa a ser dona da
 * configuração, e `wa.avilaops.com/.env` é o único lugar com os dados vivos do
 * WhatsApp. O dump de `Websites/mellotransportesriopreto.com.br` vem por último
 * justamente por ser cópia de tudo, inclusive do que não é dele.
 */
const PRIORIDADE = [
  "app.avilaops.com/.env.production",
  "app.avilaops.com/.env.local",
  "wa.avilaops.com/.env",
  "docs/credenciais/.env.production",
  "crm.avilaops.com/.env.production",
  "lojas.avilaops.com/.env.production",
  "saudepet.app.br/.env.production",
  "arxisvr.avilaops.com/.env.production",
  "Websites/mellotransportesriopreto.com.br/.env.production",
];

/** Cópias de build e de release: nunca são fonte de verdade. */
const FONTES_PROIBIDAS = [
  ".deploy-health-runtime",
  ".lojas-blog-release",
  "/.next/",
  "APK/app-build",
  ".env.example",
];

type Ocorrencia = { arquivo: string; valor: string };

const valores = new Map<string, Ocorrencia[]>();
const consumidores = new Map<string, Set<string>>();

function interessa(chave: string) {
  return PREFIXOS.some((prefixo) => chave.startsWith(prefixo));
}

function ehEnv(nome: string) {
  return nome === ".env" || nome.startsWith(".env.") || nome.endsWith(".env");
}

function andar(dir: string) {
  let entradas: fs.Dirent[];
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

    let texto: string;
    try {
      if (fs.statSync(completo).size > 2_000_000) continue;
      texto = fs.readFileSync(completo, "utf8");
    } catch {
      continue;
    }

    const rel = path.relative(RAIZ, completo).split(path.sep).join("/");
    const proibida = FONTES_PROIBIDAS.some((trecho) => rel.includes(trecho));

    for (const linha of texto.split("\n")) {
      if (env) {
        if (proibida) continue;
        const atribuicao = linha.trim().match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
        if (!atribuicao || !interessa(atribuicao[1])) continue;

        const valor = atribuicao[2].trim().replace(/^["']|["']$/g, "");
        if (!valor || valor.startsWith("GERAR_") || valor.startsWith("UM_TOKEN")) continue;

        if (!valores.has(atribuicao[1])) valores.set(atribuicao[1], []);
        valores.get(atribuicao[1])!.push({ arquivo: rel, valor });
        continue;
      }

      if (!linha.includes("env")) continue;
      for (const achado of linha.matchAll(/(?:process\.env\.|process\.env\[["']|env\.)([A-Z][A-Z0-9_]*)/g)) {
        if (!interessa(achado[1])) continue;
        if (!consumidores.has(achado[1])) consumidores.set(achado[1], new Set());
        consumidores.get(achado[1])!.add(rel);
      }
    }
  }
}

function posicao(arquivo: string) {
  const indice = PRIORIDADE.indexOf(arquivo);
  return indice === -1 ? PRIORIDADE.length : indice;
}

function escolher(ocorrencias: Ocorrencia[]) {
  return [...ocorrencias].sort((a, b) => posicao(a.arquivo) - posicao(b.arquivo))[0];
}

/**
 * Carrega um único arquivo como fonte, em vez de varrer o monorepo.
 *
 * É o que serve para produção: o `.env` que o container lê fica no servidor e
 * não está no repositório, então varrer o repo importaria valor de
 * desenvolvimento por cima do que está no ar.
 */
function carregarDeUmArquivo(caminho: string) {
  const texto = fs.readFileSync(caminho, "utf8");
  const rel = path.basename(caminho);

  for (const linha of texto.split("\n")) {
    const atribuicao = linha.trim().match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (!atribuicao || !interessa(atribuicao[1])) continue;

    const valor = atribuicao[2].trim().replace(/^["']|["']$/g, "");
    if (!valor || valor.startsWith("GERAR_") || valor.startsWith("UM_TOKEN")) continue;

    if (!valores.has(atribuicao[1])) valores.set(atribuicao[1], []);
    valores.get(atribuicao[1])!.push({ arquivo: rel, valor });
  }
}

async function principal() {
  const argumentos = process.argv.slice(2);
  const aplicar = argumentos.includes("--aplicar");
  const filtro = argumentos.find((a) => a.startsWith("--so="))?.split("=")[1]?.split(",") ?? null;
  const arquivoUnico = argumentos.find((a) => a.startsWith("--arquivo="))?.split("=")[1];

  // Os consumidores saem sempre do código do repositório: quem lê cada chave é
  // o mesmo aqui e lá, e é isso que diz o que quebra ao girar uma delas.
  andar(RAIZ);

  if (arquivoUnico) {
    valores.clear();
    carregarDeUmArquivo(arquivoUnico);
    console.log(`Fonte de valores: ${arquivoUnico}\n`);
  }

  const chaves = [...new Set([...valores.keys(), ...consumidores.keys()])]
    .filter((chave) => !filtro || filtro.some((prefixo) => chave.startsWith(prefixo)))
    .sort();

  const divergentes: string[] = [];
  let gravadas = 0;
  let pendentes = 0;

  for (const chave of chaves) {
    const ocorrencias = valores.get(chave) ?? [];
    const distintos = new Set(ocorrencias.map((o) => o.valor));
    const lida = consumidores.get(chave) ?? new Set<string>();
    const escolhida = ocorrencias.length ? escolher(ocorrencias) : null;

    if (distintos.size > 1) divergentes.push(chave);

    const status = escolhida ? "ATIVO" : lida.size ? "PENDENTE" : "APOSENTADA";
    if (escolhida) gravadas += 1;
    else pendentes += 1;

    const marca = escolhida ? "valor" : "vazia";
    const aviso = distintos.size > 1 ? `  ⚠ ${distintos.size} valores diferentes` : "";
    console.log(
      `${status.padEnd(11)} ${chave.padEnd(38)} ${marca}  ${lida.size} consumidor(es)${aviso}`,
    );

    if (!aplicar) continue;

    await salvarCredencial(
      {
        chave,
        valor: escolhida?.valor ?? null,
        categoria: categoriaDaChave(chave),
        consumidores: [...lida].sort(),
        origem: escolhida ? `importado:${escolhida.arquivo}` : "inventario",
        status: status as "ATIVO" | "PENDENTE" | "APOSENTADA",
      },
      "script:importar-credenciais",
    );
  }

  console.log(
    `\n${chaves.length} chaves | ${gravadas} com valor | ${pendentes} sem valor | ${divergentes.length} divergentes`,
  );

  if (divergentes.length) {
    console.log("\nValores divergentes entre arquivos — confira antes de confiar no cofre:");
    for (const chave of divergentes) {
      console.log(`  ${chave}`);
      for (const ocorrencia of valores.get(chave) ?? []) {
        const amostra = ocorrencia.valor.length > 12
          ? `${ocorrencia.valor.slice(0, 6)}…${ocorrencia.valor.slice(-4)}`
          : "(curto)";
        console.log(`     ${amostra}  ${ocorrencia.arquivo}`);
      }
    }
  }

  if (!aplicar) {
    console.log("\nSimulação. Nada foi gravado. Repita com --aplicar.");
  }
}

principal()
  .catch((erro) => {
    console.error(erro instanceof Error ? erro.message : erro);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

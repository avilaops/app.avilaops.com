/**
 * Baixa os logotipos de terceiros de `public/marca/social/` do Wikimedia Commons.
 *
 * Existe para que a procedência de cada arquivo seja verificável e repetível.
 * Marca registrada não se redesenha à mão, e arquivo capturado de CDN aleatório
 * não tem como ser auditado depois: aqui cada logotipo tem página de origem e
 * licença, e o `CREDITOS.md` ao lado repete as duas coisas para quem abrir a
 * pasta sem ler este script.
 *
 * Rode a partir da raiz do app:
 *
 *     node scripts/baixar-logos-sociais.mjs
 *
 * Sem argumento ele confere (`--conferir` é o padrão) e falha se algum arquivo
 * em disco não bater com o do Commons. Com `--aplicar`, regrava.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DESTINO = path.join(process.cwd(), "public", "marca", "social");
const API = "https://commons.wikimedia.org/w/api.php";
const AGENTE = "AvilaOps/1.0 (https://avilaops.com; nicolas@avilaops.com)";

/** arquivo -> página no Commons. Mudou de ideia sobre um desenho? Troque aqui. */
const LOGOS = {
  apple: "File:Apple_logo_black.svg",
  discord: "File:Discord_colour_textlogo_(2021).svg",
  facebook: "File:Facebook_f_logo_(2021).svg",
  github: "File:Octicons-mark-github.svg",
  google: 'File:Google_"G"_logo.svg',
  instagram: "File:Instagram_logo_2022.svg",
  linkedin: "File:LinkedIn_icon.svg",
  microsoft: "File:Microsoft_-_SuperTinyIcons.svg",
  pinterest: "File:Pinterest_Shiny_Icon.svg",
  reddit: "File:Snoo.svg",
  telegram: "File:Telegram_logo.svg",
  threads: "File:Threads_(app)_logo.svg",
  tiktok: "File:Tiktok_icon.svg",
  twitch: "File:Twitch_Glitch_Logo_Purple.svg",
  whatsapp: "File:WhatsApp.svg",
  x: "File:X_icon.svg",
  youtube: "File:YouTube_full-color_icon_(2024).svg",
};

const dormir = (ms) => new Promise((ok) => setTimeout(ok, ms));

/**
 * O Commons corta com 429 quando as 17 páginas e os 17 arquivos saem em
 * sequência sem respiro. Uma pausa fixa entre chamadas mais uma espera
 * crescente na recusa mantêm o script dentro da etiqueta da API, em vez de
 * falhar no meio e deixar metade dos arquivos trocados.
 */
async function buscar(url, tentativa = 1) {
  const resposta = await fetch(url, { headers: { "User-Agent": AGENTE } });
  if (resposta.ok) return resposta;

  const recusaPassageira = resposta.status === 429 || resposta.status >= 500;
  if (recusaPassageira && tentativa <= 4) {
    const espera = 2000 * tentativa;
    console.log(`  ${resposta.status}; esperando ${espera / 1000}s e tentando de novo`);
    await dormir(espera);
    return buscar(url, tentativa + 1);
  }
  throw new Error(`${resposta.status} em ${url}`);
}

async function urlDoArquivo(titulo) {
  const consulta = new URLSearchParams({
    action: "query",
    format: "json",
    prop: "imageinfo",
    iiprop: "url|extmetadata",
    titles: titulo,
  });
  const dados = await (await buscar(`${API}?${consulta}`)).json();
  const pagina = Object.values(dados.query.pages)[0];
  const info = pagina?.imageinfo?.[0];
  if (!info) throw new Error(`sem imageinfo para ${titulo}`);
  return {
    url: info.url.split("?")[0],
    licenca: info.extmetadata?.LicenseShortName?.value ?? "ver a página",
  };
}

async function main() {
  const aplicar = process.argv.includes("--aplicar");
  await mkdir(DESTINO, { recursive: true });

  const divergentes = [];
  let primeiro = true;
  for (const [nome, titulo] of Object.entries(LOGOS)) {
    if (!primeiro) await dormir(400);
    primeiro = false;

    const { url, licenca } = await urlDoArquivo(titulo);
    if (!url.startsWith("https://upload.wikimedia.org/")) {
      throw new Error(`${nome}: a API devolveu um host inesperado (${url})`);
    }
    if (!url.endsWith(".svg")) {
      throw new Error(`${nome}: ${titulo} não é SVG`);
    }

    const baixado = Buffer.from(await (await buscar(url)).arrayBuffer());
    const arquivo = path.join(DESTINO, `${nome}.svg`);
    const emDisco = await readFile(arquivo).catch(() => null);
    const igual = emDisco && createHash("sha256").update(emDisco).digest("hex") ===
      createHash("sha256").update(baixado).digest("hex");

    if (igual) {
      console.log(`= ${nome}.svg  [${licenca}]`);
      continue;
    }

    if (aplicar) {
      await writeFile(arquivo, baixado);
      console.log(`${emDisco ? "~" : "+"} ${nome}.svg  <- ${titulo}  [${licenca}]`);
    } else {
      divergentes.push(`${nome}.svg ${emDisco ? "difere do" : "não existe; o"} Commons (${titulo})`);
      console.log(`! ${nome}.svg  difere de ${titulo}`);
    }
  }

  if (divergentes.length) {
    console.error(`\n${divergentes.length} arquivo(s) fora de sincronia:`);
    for (const d of divergentes) console.error(` - ${d}`);
    console.error("\nRode com --aplicar para regravar.");
    process.exit(1);
  }
  console.log("\ntodos os logotipos batem com o Commons");
}

main();

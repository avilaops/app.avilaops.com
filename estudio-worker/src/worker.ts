/**
 * Worker do Estúdio: pega a próxima renderização na fila do app, produz o arquivo e devolve.
 *
 * Contrato com o app (src/app/api/estudio/fila):
 *   GET  {APP}/api/estudio/fila                 header x-estudio-token  → 204 ou JSON Trabalho
 *   POST {APP}/api/estudio/fila/{id}/resultado  multipart: status, log, arquivo
 *
 * A peça é uma página HTML do próprio app (htmlUrl) que expõe window.render(t) para vídeo.
 * Renderizar por quadro com render(t) é determinístico: nada de animação CSS em tempo real.
 */
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser } from "playwright";

type Narracao = { texto: string; inicio: number };
type Trilha = { bpm: number; semente: number; db: number };
type Trabalho = {
  id: string;
  tipo: "video" | "imagem";
  largura: number;
  altura: number;
  fps: number;
  duracao: number; // segundos (vídeo)
  htmlUrl: string;
  narracao: Narracao[];
  voz: string; // nome do arquivo em vozes/ sem extensão, ex.: pm_nicolas
  trilha: Trilha | null;
};

const APP = (process.env.ESTUDIO_APP_URL ?? "https://app.avilaops.com").replace(/\/$/, "");
const TOKEN = process.env.ESTUDIO_WORKER_TOKEN ?? "";
const INTERVALO = Number(process.env.ESTUDIO_INTERVALO_MS ?? 5000);
const PYTHON = process.env.ESTUDIO_PYTHON ?? "python";
const AQUI = dirname(fileURLToPath(import.meta.url));

if (!TOKEN) {
  console.error("ESTUDIO_WORKER_TOKEN não definido");
  process.exit(1);
}

const log = (...a: unknown[]) => console.log(new Date().toISOString(), ...a);

function rodar(cmd: string, args: string[], cwd?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd, env: { ...process.env, PYTHONUTF8: "1" } });
    let saida = "";
    p.stdout.on("data", (d) => (saida += d));
    p.stderr.on("data", (d) => (saida += d));
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve(saida) : reject(new Error(`${cmd} ${args[0]} saiu com ${code}\n${saida.slice(-4000)}`))));
  });
}

async function proximo(): Promise<Trabalho | null> {
  const r = await fetch(`${APP}/api/estudio/fila`, { headers: { "x-estudio-token": TOKEN } });
  if (r.status === 204) return null;
  if (!r.ok) throw new Error(`fila respondeu ${r.status}`);
  return (await r.json()) as Trabalho;
}

async function devolver(id: string, status: "concluido" | "erro", logTexto: string, arquivo?: { caminho: string; nome: string; tipo: string }) {
  const form = new FormData();
  form.set("status", status);
  form.set("log", logTexto.slice(-20000));
  if (arquivo) {
    const dados = await readFile(arquivo.caminho);
    form.set("arquivo", new Blob([dados], { type: arquivo.tipo }), arquivo.nome);
  }
  const r = await fetch(`${APP}/api/estudio/fila/${id}/resultado`, { method: "POST", headers: { "x-estudio-token": TOKEN }, body: form });
  if (!r.ok) throw new Error(`resultado respondeu ${r.status}: ${await r.text()}`);
}

async function renderizarQuadros(browser: Browser, t: Trabalho, pasta: string): Promise<string> {
  const pagina = await browser.newPage({ viewport: { width: t.largura, height: t.altura }, deviceScaleFactor: 1 });
  let relato = "";
  try {
    await pagina.goto(t.htmlUrl, { waitUntil: "networkidle", timeout: 60_000 });
    await pagina.evaluate(() => (document as any).fonts?.ready);
    if (t.tipo === "imagem") {
      await pagina.waitForTimeout(300);
      await pagina.screenshot({ path: join(pasta, "imagem.png") });
      return "imagem renderizada\n";
    }
    const temRender = await pagina.evaluate(() => typeof (window as any).render === "function");
    if (!temRender) throw new Error("a peça não expõe window.render(t)");
    const total = Math.round(t.duracao * t.fps);
    for (let f = 0; f < total; f++) {
      await pagina.evaluate((tempo) => (window as any).render(tempo), f / t.fps);
      await pagina.screenshot({ path: join(pasta, `q${String(f).padStart(5, "0")}.png`) });
    }
    relato += `${total} quadros a ${t.fps} fps\n`;
    return relato;
  } finally {
    await pagina.close();
  }
}

async function montarVideo(t: Trabalho, pasta: string): Promise<string> {
  let relato = "";
  const semAudio = join(pasta, "video-mudo.mp4");
  await rodar("ffmpeg", ["-v", "error", "-y", "-framerate", String(t.fps), "-i", join(pasta, "q%05d.png"),
    "-c:v", "libx264", "-crf", "17", "-preset", "medium", "-pix_fmt", "yuv420p", "-movflags", "+faststart", semAudio]);

  const entradas: string[] = ["-i", semAudio];
  const filtros: string[] = [];
  let vozWav: string | null = null;
  let trilhaWav: string | null = null;

  if (t.narracao.length) {
    const roteiro = join(pasta, "roteiro.json");
    await writeFile(roteiro, JSON.stringify(t.narracao), "utf-8");
    vozWav = join(pasta, "voz.wav");
    const voz = join(AQUI, "..", "vozes", `${t.voz || "pm_nicolas"}.pt`);
    relato += await rodar(PYTHON, [join(AQUI, "..", "narrar.py"), roteiro, String(t.duracao), vozWav, "--voz", voz]);
  }
  if (t.trilha) {
    trilhaWav = join(pasta, "trilha.wav");
    relato += await rodar(PYTHON, [join(AQUI, "..", "trilha.py"), String(t.duracao), trilhaWav, "--bpm", String(t.trilha.bpm), "--semente", String(t.trilha.semente)]);
  }

  const saida = join(pasta, "video.mp4");
  if (!vozWav && !trilhaWav) {
    await rodar("ffmpeg", ["-v", "error", "-y", "-i", semAudio, "-c", "copy", saida]);
    return relato + "sem áudio\n";
  }
  if (vozWav && trilhaWav) {
    entradas.push("-i", trilhaWav, "-i", vozWav);
    filtros.push(
      `[1:a]aresample=48000,aformat=channel_layouts=stereo,volume=${t.trilha!.db}dB[f]`,
      "[2:a]aresample=48000,aformat=channel_layouts=stereo,asplit=2[v][sc]",
      "[f][sc]sidechaincompress=threshold=0.02:ratio=6:attack=25:release=350:makeup=1[fd]",
      "[v][fd]amix=inputs=2:duration=first:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000[a]",
    );
  } else {
    entradas.push("-i", (vozWav ?? trilhaWav)!);
    filtros.push("[1:a]aresample=48000,aformat=channel_layouts=stereo,loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000[a]");
  }
  await rodar("ffmpeg", ["-v", "error", "-y", ...entradas, "-filter_complex", filtros.join(";"),
    "-map", "0:v:0", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ac", "2", "-shortest", "-movflags", "+faststart", saida]);
  return relato + "áudio misturado\n";
}

async function processar(browser: Browser, t: Trabalho) {
  const pasta = await mkdtemp(join(tmpdir(), `estudio-${t.id}-`));
  const inicio = Date.now();
  let relato = `trabalho ${t.id} (${t.tipo} ${t.largura}x${t.altura})\n`;
  try {
    relato += await renderizarQuadros(browser, t, pasta);
    if (t.tipo === "imagem") {
      relato += `pronto em ${((Date.now() - inicio) / 1000).toFixed(1)}s\n`;
      await devolver(t.id, "concluido", relato, { caminho: join(pasta, "imagem.png"), nome: `${t.id}.png`, tipo: "image/png" });
    } else {
      relato += await montarVideo(t, pasta);
      relato += `pronto em ${((Date.now() - inicio) / 1000).toFixed(1)}s\n`;
      await devolver(t.id, "concluido", relato, { caminho: join(pasta, "video.mp4"), nome: `${t.id}.mp4`, tipo: "video/mp4" });
    }
    log("concluído", t.id);
  } catch (erro) {
    const msg = erro instanceof Error ? erro.message : String(erro);
    log("erro", t.id, msg);
    await devolver(t.id, "erro", relato + "\nERRO: " + msg).catch((e) => log("não consegui devolver o erro:", e));
  } finally {
    await rm(pasta, { recursive: true, force: true });
  }
}

async function main() {
  log(`worker do Estúdio ligado; app=${APP}; intervalo=${INTERVALO}ms`);
  const browser = await chromium.launch({ args: ["--font-render-hinting=none"] });
  const parar = () => browser.close().finally(() => process.exit(0));
  process.on("SIGTERM", parar);
  process.on("SIGINT", parar);
  for (;;) {
    try {
      const t = await proximo();
      if (t) {
        log("pegou", t.id);
        await processar(browser, t);
        continue; // sem espera: pode haver mais na fila
      }
    } catch (erro) {
      log("falha no ciclo:", erro instanceof Error ? erro.message : erro);
    }
    await new Promise((r) => setTimeout(r, INTERVALO));
  }
}

main();

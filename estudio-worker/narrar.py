"""Narração em PT-BR com Kokoro: recebe frases com instante de início e devolve um WAV
do tamanho do vídeo, com cada frase encaixada no seu tempo.

Uso: python narrar.py <roteiro.json> <duracao_s> <saida.wav> [--voz vozes/pm_nicolas.pt]

roteiro.json: [{"texto": "...", "inicio": 0.0}, ...]

Se uma frase não cabe até a próxima, é regenerada mais rápida (até 1,35x) e, em último
caso, acelerada com atempo (mantém o tom). Uma frase pode adiantar 0,25 s se a anterior
já acabou; nunca sobrepõe.
"""
import argparse
import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

import numpy as np
import soundfile as sf

TAXA = 24_000
FOLGA = 0.08
ANTECIPACAO = 0.25
VELOCIDADE_MAX = 1.35
FFMPEG = shutil.which("ffmpeg") or "ffmpeg"


def cortar_silencio(a: np.ndarray, limiar: float = 0.01) -> np.ndarray:
    idx = np.where(np.abs(a) > limiar)[0]
    return a if idx.size == 0 else a[idx[0]: idx[-1] + 1]


def sintetizar(pipeline, texto: str, voz: str, velocidade: float) -> np.ndarray:
    partes = [
        (audio.numpy() if hasattr(audio, "numpy") else np.asarray(audio))
        for _, _, audio in pipeline(texto, voice=voz, speed=velocidade)
    ]
    return cortar_silencio(np.concatenate(partes).astype(np.float32))


def acelerar(a: np.ndarray, fator: float, tmp: Path) -> np.ndarray:
    entrada, saida = tmp / "lento.wav", tmp / "rapido.wav"
    sf.write(entrada, a, TAXA)
    subprocess.run([FFMPEG, "-v", "error", "-y", "-i", str(entrada), "-af", f"atempo={fator:.4f}", str(saida)], check=True)
    dados, _ = sf.read(saida, dtype="float32")
    return dados


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("roteiro", type=Path)
    p.add_argument("duracao", type=float)
    p.add_argument("saida", type=Path)
    p.add_argument("--voz", default=os.environ.get("ESTUDIO_VOZ", str(Path(__file__).parent / "vozes" / "pm_nicolas.pt")))
    args = p.parse_args()

    from kokoro import KPipeline

    segmentos = json.loads(args.roteiro.read_text(encoding="utf-8"))
    pipeline = KPipeline(lang_code="p", repo_id="hexgrad/Kokoro-82M")
    linha = np.zeros(int(np.ceil(args.duracao * TAXA)), dtype=np.float32)
    cursor = 0.0
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        for i, seg in enumerate(segmentos):
            inicio = max(cursor, float(seg["inicio"]) - ANTECIPACAO)
            ultima = i + 1 == len(segmentos)
            limite = (args.duracao if ultima else float(segmentos[i + 1]["inicio"]) - FOLGA) - inicio
            if limite <= 0.2:
                print(f"[{inicio:5.2f}] sem espaço para: {seg['texto']}")
                continue
            velocidade = 1.0
            audio = sintetizar(pipeline, seg["texto"], args.voz, velocidade)
            dur = audio.size / TAXA
            if dur > limite:
                velocidade = min(VELOCIDADE_MAX, dur / limite * 1.02)
                audio = sintetizar(pipeline, seg["texto"], args.voz, velocidade)
                dur = audio.size / TAXA
            fator = 1.0
            if dur > limite:
                fator = dur / limite
                audio = acelerar(audio, fator, tmp)
                dur = audio.size / TAXA
            ini = int(inicio * TAXA)
            fim = min(ini + audio.size, linha.size)
            linha[ini:fim] += audio[: fim - ini]
            cursor = fim / TAXA + FOLGA
            aviso = f" atempo={fator:.2f}" if fator > 1 else ""
            print(f"[{inicio:5.2f}] {dur:4.2f}s de {limite:4.2f}s, speed={velocidade:.2f}{aviso} | {seg['texto']}")

    pico = float(np.abs(linha).max()) or 1.0
    sf.write(args.saida, linha / pico * 0.89, TAXA)
    print(f"narração: {args.saida}")


if __name__ == "__main__":
    main()

"""Compõe uma trilha de fundo curta, sintetizada por código (sem modelo, sem licença de terceiro).

Uso: python trilha.py <duracao_s> <saida.wav> [--bpm 120] [--semente 7]

Estilo: eletrônico leve, corporativo, em F maior / lá menor. Camadas: pad de
serras destunadas com filtro, arpejo de 8as com eco, baixo sub, bumbo, chimbal e
palma suaves, um riser no último compasso e um acorde final que ringa até o fim.
Tudo é numpy + scipy; a reverb é convolução com ruído decrescente.
"""
import argparse

import numpy as np
import soundfile as sf
from scipy.signal import butter, fftconvolve, sosfilt

TAXA = 48_000

# graus em semitons a partir de C4 (MIDI 60): F  C  G  Am  e fecho em F
ACORDES = [
    [5, 9, 12, 16],   # F  (F A C E)  Fmaj7
    [0, 4, 7, 11],    # C  (C E G B)  Cmaj7
    [7, 11, 14, 17],  # G  (G B D F)  G7
    [9, 12, 16, 19],  # Am (A C E G)  Am7
    [5, 9, 12, 16],   # F  final
]
BAIXO = [5 - 24, 0 - 12, 7 - 24, 9 - 24, 5 - 24]


def hz(semitom: int) -> float:
    return 440.0 * 2 ** ((semitom + 60 - 69) / 12)


def adsr(n: int, a: float, d: float, s: float, r: float) -> np.ndarray:
    a, d, r = (max(1, int(x * TAXA)) for x in (a, d, r))
    sus = max(0, n - a - d - r)
    env = np.concatenate([
        np.linspace(0, 1, a), np.linspace(1, s, d), np.full(sus, s), np.linspace(s, 0, r),
    ])
    return env[:n] if env.size >= n else np.pad(env, (0, n - env.size))


def lowpass(x: np.ndarray, fc: float, ordem: int = 2) -> np.ndarray:
    sos = butter(ordem, fc / (TAXA / 2), btype="low", output="sos")
    return sosfilt(sos, x, axis=0)


def bandpass(x: np.ndarray, lo: float, hi: float) -> np.ndarray:
    sos = butter(2, [lo / (TAXA / 2), hi / (TAXA / 2)], btype="band", output="sos")
    return sosfilt(sos, x, axis=0)


def serra(f: float, n: float, detune: float = 0.0) -> np.ndarray:
    t = np.arange(n) / TAXA
    f = f * 2 ** (detune / 1200)
    return 2 * ((t * f) % 1.0) - 1


def seno(f: float, n: int) -> np.ndarray:
    return np.sin(2 * np.pi * f * np.arange(n) / TAXA)


def pad(acorde, n, rng) -> np.ndarray:
    esq = np.zeros(n)
    dir_ = np.zeros(n)
    for st in acorde:
        f = hz(st)
        esq += serra(f, n, -7) + 0.5 * serra(f * 0.5, n, 4)
        dir_ += serra(f, n, 7) + 0.5 * serra(f * 0.5, n, -4)
    env = adsr(n, 0.35, 0.3, 0.75, 0.6)
    # filtro que abre com o envelope: duas passagens com cortes diferentes cruzadas
    out = np.stack([esq, dir_], axis=1) * env[:, None]
    return 0.6 * lowpass(out, 900) + 0.4 * lowpass(out, 2200) * env[:, None]


def pluck(f: float, n: int) -> np.ndarray:
    env = np.exp(-np.arange(n) / (TAXA * 0.16))
    tom = seno(f, n) + 0.35 * seno(2 * f, n) + 0.15 * seno(3 * f, n) * np.exp(-np.arange(n) / (TAXA * 0.05))
    return tom * env * adsr(n, 0.002, 0.05, 0.6, 0.05)


def bumbo(n: int) -> np.ndarray:
    t = np.arange(n) / TAXA
    f = 55 + 95 * np.exp(-t * 28)
    fase = 2 * np.pi * np.cumsum(f) / TAXA
    return np.sin(fase) * np.exp(-t * 11) * 0.9


def chimbal(n: int, rng, aberto=False) -> np.ndarray:
    ruido = rng.standard_normal(n)
    env = np.exp(-np.arange(n) / (TAXA * (0.09 if aberto else 0.028)))
    return bandpass(ruido * env, 6000, 14000) * 0.5


def palma(n: int, rng) -> np.ndarray:
    t = np.arange(n) / TAXA
    env = np.zeros(n)
    for atraso in (0, 0.011, 0.023):
        env += np.exp(-np.clip(t - atraso, 0, None) * 45) * (t >= atraso)
    return bandpass(rng.standard_normal(n) * env, 900, 4500) * 0.45


def riser(n: int, rng) -> np.ndarray:
    t = np.linspace(0, 1, n)
    ruido = rng.standard_normal(n)
    out = np.zeros(n)
    # filtro subindo por trechos
    for i in range(24):
        a, b = int(i * n / 24), int((i + 1) * n / 24)
        fc = 400 * (12000 / 400) ** (i / 23)
        out[a:b] = bandpass(ruido[a:b], fc * 0.6, min(fc * 1.6, 20000))
    return out * (t ** 2.2) * 0.35


def reverb(x: np.ndarray, rng, decai: float = 1.4, mistura: float = 0.22) -> np.ndarray:
    n = int(decai * TAXA)
    ir = rng.standard_normal((n, 2)) * np.exp(-np.arange(n) / (TAXA * decai / 4))[:, None]
    ir = lowpass(ir, 5000)
    ir /= np.abs(ir).sum(axis=0) / 3
    molhado = fftconvolve(x, ir, axes=0)[: x.shape[0]]
    return (1 - mistura) * x + mistura * molhado


def compor(duracao: float, bpm: int, semente: int) -> np.ndarray:
    rng = np.random.default_rng(semente)
    n_total = int(duracao * TAXA)
    batida = 60 / bpm
    compasso = 4 * batida
    n_comp = int(compasso * TAXA)
    mix = np.zeros((n_total + n_comp, 2))

    def soma(sinal, inicio_s, ganho=1.0, pan=0.0):
        i = int(inicio_s * TAXA)
        if sinal.ndim == 1:
            sinal = np.stack([sinal * (1 - max(pan, 0)), sinal * (1 + min(pan, 0))], axis=1)
        fim = min(i + sinal.shape[0], mix.shape[0])
        mix[i:fim] += ganho * sinal[: fim - i]

    n_compassos = int(np.ceil(duracao / compasso))
    ultimo = n_compassos - 1
    for c in range(n_compassos):
        t0 = c * compasso
        acorde = ACORDES[min(c, len(ACORDES) - 1)]
        if c == ultimo:
            # acorde final: ataque curto, ringa até o fim
            soma(pad(acorde, int(2.5 * compasso * TAXA), rng), t0, 0.16)
            soma(seno(hz(BAIXO[min(c, len(BAIXO) - 1)]), int(1.2 * compasso * TAXA))
                 * np.exp(-np.arange(int(1.2 * compasso * TAXA)) / (TAXA * 0.9)), t0, 0.35)
            soma(bumbo(int(0.4 * TAXA)), t0, 0.9)
            soma(palma(int(0.3 * TAXA), rng), t0, 0.6)
            soma(chimbal(int(0.3 * TAXA), rng, aberto=True), t0, 0.5)
            continue
        soma(pad(acorde, n_comp + int(0.4 * TAXA), rng), t0, 0.13)
        # arpejo em colcheias, subindo e descendo, com eco de 3/16
        notas = acorde + acorde[1:3][::-1]
        for k in range(8):
            f = hz(notas[k % len(notas)] + 12)
            t = t0 + k * batida / 2
            soma(pluck(f, int(0.5 * TAXA)), t, 0.22, pan=0.35 if k % 2 else -0.35)
            soma(pluck(f, int(0.5 * TAXA)), t + 3 * batida / 4, 0.09, pan=-0.35 if k % 2 else 0.35)
        # baixo: 1 e, 3 e
        fb = hz(BAIXO[min(c, len(BAIXO) - 1)])
        for k in (0, 0.5, 2, 2.5, 3.5):
            n = int(0.45 * batida * TAXA) if k in (0, 2) else int(0.25 * batida * TAXA)
            soma(seno(fb, n) * adsr(n, 0.005, 0.05, 0.8, 0.06), t0 + k * batida, 0.42)
        # bateria
        for k in range(4):
            soma(bumbo(int(0.3 * TAXA)), t0 + k * batida, 0.8)
        for k in (1, 3):
            soma(palma(int(0.25 * TAXA), rng), t0 + k * batida, 0.38)
        for k in range(8):
            forte = 0.55 if k % 2 == 0 else 0.3
            soma(chimbal(int(0.08 * TAXA), rng, aberto=(k == 7)), t0 + k * batida / 2, forte)
        if c == ultimo - 1:
            soma(riser(n_comp, rng), t0, 0.9)

    mix = mix[:n_total]
    mix = reverb(mix, rng)
    # fade final
    fade = int(0.8 * TAXA)
    mix[-fade:] *= np.linspace(1, 0, fade)[:, None]
    mix = np.tanh(mix * 1.6) / np.tanh(1.6)
    return mix / np.abs(mix).max() * 0.7


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("duracao", type=float)
    p.add_argument("saida")
    p.add_argument("--bpm", type=int, default=120)
    p.add_argument("--semente", type=int, default=7)
    args = p.parse_args()
    audio = compor(args.duracao, args.bpm, args.semente)
    sf.write(args.saida, audio.astype(np.float32), TAXA)
    print(f"trilha de {args.duracao}s a {args.bpm} bpm -> {args.saida}")


if __name__ == "__main__":
    main()

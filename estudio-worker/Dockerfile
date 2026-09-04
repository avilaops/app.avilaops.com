# Worker de renderização do Estúdio (app.avilaops.com/operacao/estudio).
# Roda no orquestrador (23.88.60.193): abre a peça no Chromium, tira um screenshot por
# quadro, narra com Kokoro (PT-BR), gera trilha e monta o MP4 com ffmpeg.
FROM mcr.microsoft.com/playwright:v1.62.1-noble

ENV DEBIAN_FRONTEND=noninteractive PYTHONUTF8=1 PIP_NO_CACHE_DIR=1 \
    HF_HOME=/opt/hf PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg python3 python3-venv fonts-inter fonts-noto-color-emoji \
    && rm -rf /var/lib/apt/lists/*

# Python: Kokoro (torch CPU) + espeak-ng para PT-BR + trilha por código
RUN python3 -m venv /opt/venv \
    && /opt/venv/bin/pip install --upgrade pip \
    && /opt/venv/bin/pip install torch --index-url https://download.pytorch.org/whl/cpu \
    && /opt/venv/bin/pip install "kokoro>=0.9.4" "misaki[en]>=0.9.4" espeakng-loader phonemizer-fork soundfile numpy scipy

# baixa o modelo na construção da imagem, para o worker não depender do Hugging Face em produção
RUN /opt/venv/bin/python -c "from huggingface_hub import snapshot_download; snapshot_download('hexgrad/Kokoro-82M', allow_patterns=['*.json','*.pth','voices/pm_*.pt','voices/pf_*.pt'])"

WORKDIR /worker
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev
COPY narrar.py trilha.py ./
COPY vozes ./vozes
COPY src ./src

# modelo já está na imagem: não consultar o Hugging Face em produção
ENV ESTUDIO_PYTHON=/opt/venv/bin/python ESTUDIO_INTERVALO_MS=5000 NODE_ENV=production HF_HUB_OFFLINE=1
CMD ["node", "src/worker.ts"]

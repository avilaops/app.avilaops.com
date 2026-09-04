# estudio-worker

Renderiza as peças do Estúdio (`/operacao/estudio` no app). O app só enfileira;
quem produz o arquivo é este processo, num container no orquestrador
(23.88.60.193), porque o servidor de produção não tem RAM para Chromium e Kokoro.

## O que ele faz

1. `GET {app}/api/estudio/fila` a cada 5 s com `x-estudio-token`. 204 = nada a fazer.
2. Abre a peça no Chromium (`htmlUrl`, uma página do app com token próprio, sem cookie).
3. Vídeo: chama `window.render(t)` por quadro e tira um screenshot de cada um (24 fps).
   Imagem: um screenshot só.
4. `narrar.py`: Kokoro-82M em PT-BR encaixa cada frase no instante pedido
   (acelera até 1,35× se não couber). `trilha.py`: trilha por código, sem licença alheia.
5. ffmpeg junta quadros, voz e trilha (com ducking) num MP4 H.264 e devolve por
   `POST {app}/api/estudio/fila/{id}/resultado` (multipart). Erro também é devolvido,
   com o log, para aparecer na tela.

## Subir no orquestrador

```sh
# da máquina local, dentro de app.avilaops.com/
tar --exclude=node_modules -czf - estudio-worker | ssh -i ~/.ssh/hetzner_avilaops root@23.88.60.193 'mkdir -p /opt && cd /opt && rm -rf estudio-worker && tar xzf -'
ssh -i ~/.ssh/hetzner_avilaops root@23.88.60.193
cd /opt/estudio-worker
printf 'ESTUDIO_APP_URL=https://app.avilaops.com\nESTUDIO_WORKER_TOKEN=<mesmo valor do .env.production do app>\n' > .env
docker compose up -d --build        # a 1ª construção baixa torch (~200 MB) e o modelo (~330 MB)
docker logs -f estudio-worker
```

A imagem é construída no próprio orquestrador (16 GB livres) para não transferir
3 GB de imagem pela rede. O modelo do Kokoro é baixado na construção, então em
produção o worker não depende do Hugging Face.

## Testar sem o app

```sh
docker run --rm -it --entrypoint bash estudio-worker:local
/opt/venv/bin/python narrar.py <(echo '[{"texto":"Sua loja vende 24 horas.","inicio":0}]') 4 /tmp/voz.wav && ls -la /tmp/voz.wav
```

## Limites e decisões

- Um trabalho por vez, de propósito: 4 GB de RAM no servidor, dividida com n8n e Grafana.
- Vídeo até 60 s. Acima disso a fila precisa de outro servidor, não de outro código.
- O worker não conhece templates: recebe HTML pronto. Template novo é só no app.
- `PYTHONUTF8=1` no ambiente: o Kokoro imprime fonemas IPA e sem isso o Python do
  container em locale C pode quebrar o log.

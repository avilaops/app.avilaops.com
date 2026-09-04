# Estúdio (`/operacao/estudio`)

Onde a casa monta vídeo e imagem para as redes e o mural sem depender de ferramenta
paga nem de gerador de IA. Criado em 04/09/2026 a partir do vídeo do 7 de Setembro
(`ferramentas/voz/dublagem`), que provou o caminho: HTML animado por quadro,
narração Kokoro em PT-BR, trilha por código e ffmpeg.

## Peças e templates

Uma **peça** é um template preenchido: `StudioPiece` guarda template, formato
(9:16, 1:1, 4:5), os valores dos campos (JSON), duração, se narra e a trilha.
Os templates vivem em código, em `src/lib/estudio/templates.ts`. Cada um declara
seus campos (texto, texto longo, imagem, cor, opção) e devolve o HTML completo.
O mesmo HTML alimenta a pré-visualização (iframe `srcdoc`, com play para vídeo) e
o render no worker, então o que se vê na tela é o que sai no arquivo.

Regra de ouro dos templates de vídeo: **`window.render(t)` desenha o quadro do
instante `t`**. Nada de `@keyframes` ou `transition` rodando sozinho, porque o
worker tira um screenshot por quadro e uma animação em tempo real perde quadro.

Templates da v1:

| id | tipo | para quê |
|---|---|---|
| `cena-personagem` | vídeo | ilustração recortada + selo + título + notificações (o do feriado) |
| `cartao-chamada` | imagem | logo, celular com tela real, título, botão, site (fecho de vídeo ou post) |
| `post-frase` | imagem | afirmação grande sobre fundo da marca |

Template novo: adicionar em `templates.ts` e pronto, a tela e o worker já entendem.
A marca (nome, slogan, logo, cores, site) vem de `MARCA_PADRAO`; ligar no
branding kit por empresa é o próximo passo natural.

## Renderização

"Renderizar" cria um `StudioRender` em `PENDING` com um **snapshot** do pedido
(template, formato, valores, narração, trilha e um token de 128 bits). Mudar a
peça depois não muda o que está na fila. O worker (`estudio-worker/`, no
orquestrador) pega pela API, abre `GET /api/estudio/renders/{id}/html?token=…`
no Chromium, produz o arquivo e devolve. O arquivo fica em
`storage/estudio/renders/` e é servido por `/api/estudio/arquivos/{nome}` só
para quem está logado (com Range, senão o Safari do iPhone não toca).

Fila: `UPDATE … WHERE id = (SELECT … FOR UPDATE SKIP LOCKED) RETURNING` num
comando só, então dois workers nunca pegam o mesmo trabalho.

Autenticação do worker: header `x-estudio-token` = `ESTUDIO_WORKER_TOKEN`
(comparação em tempo constante); a chave de serviço do n8n também é aceita, para
o n8n poder buscar o arquivo e publicar.

## Variáveis

| Variável | Onde | Para quê |
|---|---|---|
| `ESTUDIO_STORAGE_PATH` | app | pasta das imagens e renders (padrão `./storage/estudio`, no bind mount) |
| `ESTUDIO_WORKER_TOKEN` | app e worker | o segredo entre os dois |
| `ESTUDIO_APP_URL` | worker | `https://app.avilaops.com` |

## Banco

Migration `20260904190000_add_estudio_module`: `operations.studio_pieces` e
`operations.studio_renders`, aditiva, com `CHECK` nos status e `OWNER TO app_avila`.

## Fora da v1 (decidido em 04/09/2026)

- Agendar e publicar de dentro do Estúdio: continua pelo fluxo n8n "Publicar
  Conteúdo Novo", que recebe o arquivo pela API com a chave de serviço.
- Voz clonada do Nicolas (Chatterbox): entra quando houver a gravação de referência.
- Vídeo de IA (imagem virando filmagem): precisa de GPU; nem esta máquina nem o
  orquestrador têm.

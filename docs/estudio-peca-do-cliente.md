# A peça do Estúdio tem dono

Até 18/09/2026 o Estúdio só sabia montar peça da própria casa: `StudioPiece` não
tinha vínculo com cliente nenhum e a marca era fixa no código
(`MARCA_PADRAO` em `src/lib/estudio/templates.ts` — nome, logo e cores da Ávila
Ops). Agora a peça tem dono, e a peça do cliente sai com a marca dele.

## Como funciona

**Escolha do cliente.** A folha "Nova peça" abre com o seletor de cliente. O
padrão é "Ávila Ops (peça da casa)"; escolhendo um cliente, a peça passa a ser
dele. A lista mostra de quem é cada peça, e o cabeçalho do editor também — quem
abre precisa saber com qual marca está mexendo antes de tocar em qualquer campo.

**A marca vem do cadastro.** `marcaDoCliente()` em
[src/lib/estudio/marca.ts](../src/lib/estudio/marca.ts) monta a `Marca` a partir
do mesmo cadastro de identidade que a ficha do cliente usa — nada é digitado
duas vezes:

| Campo da peça | De onde vem |
| --- | --- |
| `nome` | `Organization.name`, em caixa alta |
| `slogan` | `Organization.segment` |
| `site` | `Organization.siteUrl`, sem o `https://` |
| `logoUrl` | primeiro ativo atual entre Logo horizontal → Logo principal → Símbolo → Logo vertical |
| `corPrimaria` / `corDestaque` | cores dominantes extraídas da própria logo |

Campo que o cadastro não tem cai no valor da casa: é melhor uma peça com a cor
padrão do que uma peça sem cor.

## Duas decisões que não são óbvias

**A logo vai embutida em base64, não por URL.** O worker abre o HTML no Chromium
**sem cookie nenhum**, e `/api/organizations/:id/brand-assets/:id/preview` exige
sessão de administrador: uma URL ali daria 401 e a peça sairia sem logo.
Congelar os bytes também é o que mantém a promessa do snapshot — trocar a logo
do cliente depois não muda o que já está na fila.

**As cores são medidas, não chutadas.** `coresDaLogo()` reduz a logo a 64px com
kernel `nearest` (a interpolação padrão mistura pixels da borda e inventa cores
que não estão na marca), joga fora o que é transparente, quase branco ou preto
puro, agrupa o resto em faixas e tira a média de cada grupo. A cor do grupo é a
média dos seus pixels, não o primeiro que apareceu — o primeiro costuma ser
pixel de borda, já contaminado pelo fundo. Sem cor aproveitável, devolve nulo e
quem chama usa a da casa.

## O que os templates fazem com a marca

Nem todo template usa. Vale saber ao escolher:

| Template | Usa a marca |
| --- | --- |
| Cena com personagem | **não usa em pixel nenhum** |
| Cartão de chamada | site e as duas cores |
| Post de frase | logo, nome, site e as duas cores |
| Anúncio de serviço | logo (duas vezes), site e as duas cores |

Peça de cliente em "Cena com personagem" sai visualmente igual à da casa. Não é
defeito do vínculo — é o template que não desenha marca.

## Banco

Migração `20260918010000_estudio_peca_do_cliente`, aditiva:
`studio_pieces.organization_id` nulo, com `ON DELETE SET NULL`. Nulo = peça da
casa, que é o que toda peça existente é. Cliente apagado não leva a peça junto:
o histórico do que foi produzido continua, órfão, como peça da casa.

## Conferência visual

Prints dos dois temas em desktop e iPhone em
[prints/estudio-cliente/](prints/estudio-cliente/). O roteiro (`conferir.mjs`)
cria a peça pela interface e depois lê o `iframe` da pré-visualização, exigindo
que a logo do cliente esteja embutida em base64, que o nome dele apareça e que a
logo e a cor da casa **não** estejam lá. A receita para subir o ambiente é a
mesma de [prints/icones-da-marca/](prints/icones-da-marca/README.md).

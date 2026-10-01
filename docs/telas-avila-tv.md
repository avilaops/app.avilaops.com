# Telas (Ávila TV) no painel

Atualizado em 01/10/2026. A tela fica em `/operacao/telas`, no grupo
**Infraestrutura**.

## Por que ela existe aqui

O agente Ávila TV já tem painel próprio em `tv.avilaops.com`, e ele continua
sendo onde se mexe na TV da sala: controle remoto, cenas, diagnóstico de CDN.
O que faltava era o outro uso: **olhar a parede de telas de um cliente sem
abrir outro sistema**. Isso pertence a onde a equipe já está o dia inteiro, com
o mesmo login e o mesmo menu.

A tela responde uma pergunta só: *qual tela precisa de mim agora?*. Tudo nela
converge para isso: a ordem da lista, os alertas e os números do topo.

## De onde vem o dado

```
/operacao/telas  ──HTTPS + x-api-key──▶  tv.avilaops.com
  (Next, servidor)                        agente Ávila Link
                                            ├── GET /api/link         pulso vivo, em memória
                                            └── GET /api/link/saude    telemetria, 1 amostra/min
```

**O agente é dono do estado das telas.** Este app não tem tabela de telas e não
guarda cópia: uma cópia ficaria velha entre duas cargas e passaria a discordar
da origem justamente quando alguém abre a tela para resolver uma queda. Se o
agente não responder, a página diz isso, e não mostra um retrato antigo como se
fosse o agora.

O cliente HTTP é `src/lib/avila-tv.ts` (marcado `server-only`: a chave nunca vai
para o navegador). A regra de negócio (o que conta como problema, em que ordem
as telas aparecem, como um número vira frase) mora em `src/lib/telas-painel.ts`,
sem rede, com teste.

| Variável | Para que serve |
|---|---|
| `AVILA_TV_API_URL` | Base do agente. Padrão `https://tv.avilaops.com`. |
| `AVILA_TV_API_KEY` | Mesmo valor do `AVILAOPS_TV_API_KEY` de lá. Sem ela a tela diz que não está configurada. |

## Agente não é tela

Desde 19/09/2026 o agente da LAN também pareia por aqui (F3-5 no repositório do
agente): ele fala o mesmo protocolo e chega pela mesma conexão, mas o que há do
outro lado é diferente: a tela mostra uma página, o agente **alcança a rede do
cliente**. Tratar os dois igual faria a página dizer "nada no ar" sobre um
aparelho que está fazendo exatamente o que deve.

O que muda na tela, e por quê:

| Na tela | No agente | Por quê |
|---|---|---|
| "exibindo `…/cardapio`" | "2 aparelhos na LAN" | Um agente não exibe nada; o que ele tem para contar é o que alcança |
| Allowlist do `exibir` | A LAN que ele alcança | `exibir` não existe num agente; cobrar allowlist seria pedir configuração para uma porta que ele não tem |
| Versão comparada com as outras telas | Fora da conta | Agente e tela são programas diferentes, com numeração própria |
| Recarregar · Avisar · Revogar | Olhar a LAN · Revogar | Recarregar e avisar voltariam `comando_desconhecido`; botão que sempre falha é pior que botão ausente |

**"Olhar a LAN"** pede o comando `dispositivos` e mostra a saúde de cada
aparelho. Ela não vem no pulso porque custa um socket em cada aparelho do lado
de lá: vem quando alguém pergunta. Aparelho que não respondeu aparece com o
motivo em vez de sumir: sumir faria parecer que ele não existe na instalação.

Mandar ação num aparelho da LAN **não** está aqui. Esta tela responde *"qual
tela precisa de mim agora?"*; comandar impressora e tomada é operação de outro
assunto, e vai nascer onde esse assunto morar.

Um agente fora do ar continua sendo erro vermelho, e com razão: é uma LAN
inteira sem caminho.

## O que conta como "pedindo atenção"

| Sinal | Gravidade | Régua |
|---|---|---|
| Sem pulso | erro | 2 minutos sem pulso, decidido pelo gateway |
| Último comando falhou | aviso | campo `ultimo_comando.ok` do pulso |
| A tela relatou erro | aviso | campo `ultimo_erro` do pulso |
| Disponibilidade baixa | aviso | abaixo de 98% na janela de 7 dias |
| Queda repetida | aviso | mais de 3 quedas na janela |
| Sem allowlist | aviso | nem a própria nem a do agente: `exibir` recusaria tudo |
| Versão defasada | aviso | atrás da mais nova que alguma tela ativa roda |
| Token velho | aviso | mais de 30 dias, que é a rotação prevista no protocolo |

Tela revogada **não** gera alerta: é decisão tomada, não problema aberto. Ela
aparece em cinza, no fim da lista.

## O que dá para fazer daqui

| Ação | Rota | Quem | Observação |
|---|---|---|---|
| Vincular a tela que mostra um código | `POST /api/telas/parear` | OWNER e SOCIO | O token de 32 bytes nasce no agente e nunca chega aqui. Allowlist própria só aceita URL `http(s)`, até 20 |
| Recarregar | `POST /api/telas/comando` | OWNER e SOCIO | Precisa da tela no ar: o comando vence em 60 s |
| Avisar quem está em frente | `POST /api/telas/comando` | OWNER e SOCIO | Até 140 caracteres, por cima do que a tela exibe. Acima disso a rota recusa (422), não corta |
| Olhar a LAN (agente) | `POST /api/telas/comando` | OWNER e SOCIO | Comando `dispositivos`, só leitura |
| Revogar | `POST /api/telas/revogar` | só OWNER | Funciona com a tela fora do ar: é assim que se recupera uma tela que ninguém alcança. É irreversível, por isso fica atrás de `ehDono()`, e o botão não aparece para o sócio |

A rota de comando aceita só `recarregar`, `mensagem` e `dispositivos`, que são
os comandos com botão na página. `reiniciar`, `dormir` e `acordar` apagam ou
acendem a sala do cliente; sem botão, a porta ficaria aberta sem ninguém
olhando.

**`exibir` não está aqui, de propósito.** Trocar o que uma tela mostra é decisão
de conteúdo, passa pela allowlist do dispositivo e nasce no n8n ou no painel do
agente. Este painel é para quando alguém está olhando uma tela com problema.

As guardas continuam no agente: janela silenciosa das 22h às 7h, allowlist de
origem, TTL de 60 s. Repeti-las aqui criaria uma segunda verdade que um dia
discorda da primeira; o que esta camada confere é quem é o operador, se o pedido
veio da própria tela e o registro em `operations.audit_events`
(`TV_SCREEN_PAIRED`, `TV_SCREEN_COMMAND`, `TV_SCREEN_REVOKED`).

O registro é feito depois que o agente confirmou. Se ele falhar, a ação já
aconteceu e não é desfeita: a resposta sai com `auditoria: false` e o erro vai
para o log do servidor (`[telas] a ação foi feita mas a auditoria falhou`), em
vez de um erro que faria o operador repetir o que deu certo.

## Agente fora do ar

Timeout, falha de rede e qualquer resposta 5xx contam como agente
indisponível. O agente nunca responde 5xx (o erro dele é 409, porque a
Cloudflare troca 502/504 do origin pela página dela), então 5xx é o caminho até
ele: túnel caído ou PC desligado. A página mostra "O agente não respondeu" com
o motivo, e as ações devolvem 503. Se só a leitura de saúde falhar, a lista de
telas abre assim mesmo e os números de 7 dias dizem "o agente não devolveu a
saúde", em vez de "ainda sem amostra".

## O que continua fora daqui

Alerta, recuperação automática e relatório semanal são do n8n
(`ORQUESTRACAO.md` no repositório `tv.avilaops.com`). O agente emite evento
quando um estado muda; esta tela só responde a quem pergunta.

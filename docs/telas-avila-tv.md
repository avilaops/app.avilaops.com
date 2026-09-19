# Telas (Ávila TV) no painel

Atualizado em 19/09/2026. A tela fica em `/operacao/telas`, no grupo
**Infraestrutura**.

## Por que ela existe aqui

O agente Ávila TV já tem painel próprio em `tv.avilaops.com`, e ele continua
sendo onde se mexe na TV da sala — controle remoto, cenas, diagnóstico de CDN.
O que faltava era o outro uso: **olhar a parede de telas de um cliente sem
abrir outro sistema**. Isso pertence a onde a equipe já está o dia inteiro, com
o mesmo login e o mesmo menu.

A tela responde uma pergunta só: *qual tela precisa de mim agora?*. Tudo nela
converge para isso — a ordem da lista, os alertas e os números do topo.

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
agente não responder, a página diz isso — não mostra um retrato antigo como se
fosse o agora.

O cliente HTTP é `src/lib/avila-tv.ts` (marcado `server-only`: a chave nunca vai
para o navegador). A regra de negócio — o que conta como problema, em que ordem
as telas aparecem, como um número vira frase — mora em `src/lib/telas-painel.ts`,
sem rede, com teste.

| Variável | Para que serve |
|---|---|
| `AVILA_TV_API_URL` | Base do agente. Padrão `https://tv.avilaops.com`. |
| `AVILA_TV_API_KEY` | Mesmo valor do `AVILAOPS_TV_API_KEY` de lá. Sem ela a tela diz que não está configurada. |

## O que conta como "pedindo atenção"

| Sinal | Gravidade | Régua |
|---|---|---|
| Sem pulso | erro | 2 minutos sem pulso, decidido pelo gateway |
| Último comando falhou | aviso | campo `ultimo_comando.ok` do pulso |
| A tela relatou erro | aviso | campo `ultimo_erro` do pulso |
| Disponibilidade baixa | aviso | abaixo de 98% na janela de 7 dias |
| Queda repetida | aviso | mais de 3 quedas na janela |
| Sem allowlist | aviso | nem a própria nem a do agente — `exibir` recusaria tudo |
| Versão defasada | aviso | atrás da mais nova que alguma tela ativa roda |
| Token velho | aviso | mais de 30 dias, que é a rotação prevista no protocolo |

Tela revogada **não** gera alerta: é decisão tomada, não problema aberto. Ela
aparece em cinza, no fim da lista.

## O que dá para fazer daqui

| Ação | Rota | Observação |
|---|---|---|
| Vincular a tela que mostra um código | `POST /api/telas/parear` | O token de 32 bytes nasce no agente e nunca chega aqui |
| Recarregar | `POST /api/telas/comando` | Precisa da tela no ar: o comando vence em 60 s |
| Avisar quem está em frente | `POST /api/telas/comando` | Até 140 caracteres, por cima do que a tela exibe |
| Revogar | `POST /api/telas/revogar` | Funciona com a tela fora do ar — é assim que se recupera uma tela que ninguém alcança |

**`exibir` não está aqui, de propósito.** Trocar o que uma tela mostra é decisão
de conteúdo, passa pela allowlist do dispositivo e nasce no n8n ou no painel do
agente. Este painel é para quando alguém está olhando uma tela com problema.

As guardas continuam no agente — janela silenciosa das 22h às 7h, allowlist de
origem, TTL de 60 s. Repeti-las aqui criaria uma segunda verdade que um dia
discorda da primeira; o que esta camada confere é quem é o operador, se o pedido
veio da própria tela e o registro em `operations.audit_events`
(`TV_SCREEN_PAIRED`, `TV_SCREEN_COMMAND`, `TV_SCREEN_REVOKED`).

## O que continua fora daqui

Alerta, recuperação automática e relatório semanal são do n8n
(`ORQUESTRACAO.md` no repositório `tv.avilaops.com`). O agente emite evento
quando um estado muda; esta tela só responde a quem pergunta.

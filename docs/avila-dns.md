# Avila DNS

Atualizado em 19/09/2026.

O DNS autoritativo da casa. Este documento diz o que já existe no código, o
que falta fora dele, e por que a migração é domínio a domínio.

## O corte

Não é para clonar o serviço de borda que usamos hoje. CDN global e mitigação
de ataque na borda são outro projeto, bem mais caro, e não são produto nosso.
O que vira produto é o que a Ávila Ops opera e cobra: **DNS autoritativo,
gestão de zona, API, painel, auditoria e monitoramento**.

O motor é um servidor autoritativo maduro (PowerDNS), pela API HTTP dele.
Escrever servidor DNS não é o produto: é a mesma relação que já existe com o
Postgres, em que o banco é a engine e o que é nosso é o que está em volta.

## O que já está no código

| Peça | Onde | Estado |
|---|---|---|
| Contrato de DNS | `src/lib/dominios/dns/tipos.ts` | pronto |
| Tradução linha ↔ conjunto | `src/lib/dominios/dns/rrset.ts` | pronto, 28 testes |
| Adaptador do DNS da casa | `src/lib/dominios/dns/avila.ts` | pronto, desligado |
| Adaptador do serviço externo | `src/lib/dominios/dns/externo.ts` | em uso |
| Escolha por domínio | `src/lib/dominios/dns/index.ts` | pronto |
| Coluna `domains.dns_provider` | migração `20260919050000` | aplicada |

### A tradução que mais importa

Um servidor autoritativo guarda **conjuntos** (nome + tipo), cada um com uma
lista de conteúdos e um TTL só. A tela, e a cabeça de quem opera, pensam em
**linhas**: "o MX do cliente", "aquele TXT de verificação".

Traduzir errado apaga mais do que se pediu. Mandar `DELETE` para tirar uma
linha de um conjunto com três conteúdos derruba os três, e o sintoma disso é
e-mail parando de chegar. Por isso `rrset.ts` é função pura e tem teste para
cada caso: tirar uma de três reescreve o conjunto com duas; tirar a última
apaga o conjunto; mudar o nome move a linha entre conjuntos.

### Por que a escolha é por domínio

`domains.dns_provider` tem três valores: `NENHUM`, `EXTERNO` e `AVILA`. Com
uma fábrica global, passar para o DNS da casa seria um interruptor só, e o
primeiro erro atingiria a carteira inteira. Domínio a domínio, um erro atinge
um domínio, e voltar é trocar uma coluna.

Nenhum domínio nasce `AVILA`. Isso só acontece por migração explícita.

## O que falta, e não dá para fingir em código

1. **Dois servidores autoritativos em redes independentes.** `ns1` e `ns2` em
   provedores e sistemas autônomos diferentes. Dois contêineres no mesmo VPS
   não são redundância: são o mesmo ponto de falha com dois nomes.
2. **DNSSEC**, com a cadeia publicada no registro.
3. **Monitoramento externo dos dois**, de fora da nossa rede, medindo resposta
   autoritativa e não só ping.
4. **Plantão e alvo de disponibilidade acordados.** DNS fora do ar derruba
   site, e-mail e tudo mais do cliente de uma vez. Hoje esse risco é de um
   terceiro grande; ao trazer para casa, ele passa a ser nosso, e isso é uma
   decisão de operação, não de código.

Enquanto os quatro não existirem, nenhum domínio deve receber
`dns_provider = 'AVILA'`.

## Como ligar, quando existir

Três variáveis, só no servidor:

```
AVILA_DNS_API_URL=https://dns-interno.exemplo
AVILA_DNS_API_KEY=...
AVILA_DNS_SERVER_ID=localhost
```

Sem as duas primeiras, o adaptador se declara não configurado e **recusa
leitura e escrita**, em vez de devolver zona vazia. Zona vazia parece um
domínio sem registros, e alguém recriaria à mão o que já existe.

## A ordem da migração

1. Subir engine e plano de controle, com `ns1` e `ns2` separados de verdade.
2. Migrar um domínio nosso, não de cliente, e viver com ele alguns dias.
3. Ligar DNSSEC e o monitoramento externo.
4. Migrar cliente a cliente: baixar o TTL antes, trocar os servidores de nome
   no registro, conferir a propagação, subir o TTL de volta.
5. O contador de "servidos pela Ávila Ops" no detalhe da função DNS mostra o
   avanço. Ele sai de `domains.dns_provider`, então é o estado real, não uma
   planilha paralela.

Quando o registro por EPP for habilitado, as duas peças se encaixam: registrar
passa a entregar o domínio já apontado para `ns1`/`ns2` com a zona criada.
Ver o adaptador de registro em `src/lib/dominios/registry/epp.ts`.

## O que a tela mostra

Nada disto. A tela diz **DNS**, e o nome do conector aparece só no diagnóstico
técnico da função, que é onde serve para investigar. Quem administra domínio
pela Ávila Ops não precisa saber qual motor está embaixo, do mesmo jeito que
não precisa saber a versão do Postgres.

# Portal do cliente: domínios e DNS

Atualizado em 04/10/2026.

Primeira entrega do portal do cliente a partir do planejamento do repositório
`cliente.avilaops.com` (decisão D5: o cliente edita o próprio DNS, a equipe
atua na exceção). O código vive aqui, em `/portal`: o `cliente.avilaops.com`
segue como documentação e regimento, sem aplicação própria.

## O que o cliente tem

`/portal/dominios/<domínio>`, aberto pela lista "Seus domínios" do `/portal`:

- vencimento com a fonte (consulta ao registro ou só cadastro) e a evidência;
- a zona de DNS lida ao vivo do servidor, com horário da leitura;
- criar, alterar e apagar registro, **só para o dono do negócio** (`ADMIN`).
  A equipe dele (`CLIENT`) vê a zona e não altera;
- histórico das alterações, com quem fez. Gente da casa aparece como
  "Equipe Ávila Ops".

Domínio de outra empresa responde 404, como um que não existe.

## Um caminho de escrita só

`src/lib/dominios/dns/escrita.ts` resolve a zona, lê o servidor, valida, grava
e audita. A rota da equipe (`/api/dominios/[fqdn]/dns`) e a do cliente
(`/api/portal/dominios/[fqdn]/dns`) só decidem quem pode.

A auditoria (`operations.audit_events`) guarda `origem` (`EQUIPE` ou
`CLIENTE`), `antes` e `depois`. Falha do servidor de DNS vira evento
`…_FALHOU`.

## Validação antes de gravar

`src/lib/dominios/dns/validacao.ts`, com teste por regra:

| Regra | Por quê |
|---|---|
| segundo SPF no mesmo nome | dois SPF invalidam os dois (RFC 7208 §3.2) |
| CNAME dividindo nome | proibido (RFC 1034 §3.6.2) |
| CNAME no apex | recusado no DNS da casa; o serviço externo achata, então lá passa |
| MX ou CNAME para IP; MX/SRV sem prioridade | não entrega |
| A/AAAA com endereço inválido, TTL fora de 1 ou 60–86400, NS no apex | — |

Nome relativo (`www`, `@`) vira nome completo antes de sair: o DNS da casa não
completa sozinho.

## O que ainda não existe

Registro, renovação e transferência pelo cliente dependem das decisões A1 e A3
do `cliente.avilaops.com`. Versões de zona restauráveis (contrato externo 02
§7) e importação/exportação BIND também ficam para depois.

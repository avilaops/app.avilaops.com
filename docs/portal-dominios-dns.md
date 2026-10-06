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

## Versões, restauração e exportação

Contrato externo 02 §7 e regimento interno 13 do `cliente.avilaops.com`.

- **Uma versão a cada alteração** (`operations.dns_zone_versions`): a zona
  inteira, relida do servidor depois da escrita. Antes da primeira escrita
  pelo painel, guarda-se a zona como estava (origem `SISTEMA`), senão não
  haveria para onde voltar do primeiro erro.
- **Restaurar** aplica só a diferença (`lib/dominios/dns/versoes.ts`): tira o
  que não existia, ajusta TTL e proxy da mesma linha, cria o que faltava. A
  tela mostra essa diferença antes, calculada pela mesma função. A validação
  de registro não roda na restauração: a versão é um estado em que a zona já
  esteve, e barrar a volta a ele seria barrar o desfazer. Restauração
  interrompida para, guarda a zona como ficou e diz quanto foi aplicado.
  Restaurar também vira versão.
- **Exportar em BIND** (`lib/dominios/dns/bind.ts`): a zona atual ou qualquer
  versão, sem SOA nem NS. A equipe do cliente também baixa (é a garantia de
  saída). Toda exportação gera `DNS_ZONA_EXPORTADA`.

Rotas: `…/dns/restaurar` (POST, só quem edita) e `…/dns/exportar[?versao=]`
(GET), tanto em `/api/portal/dominios/[fqdn]` quanto em `/api/dominios/[fqdn]`.

A retenção de versões é o parâmetro `produto.dns.versoesRetencaoDias`
(proposto: 90 dias, regimento interno 13). O descarte roda a cada versão
gravada e só depois que o dono confirma o prazo; antes disso, nada é
descartado. Ver `docs/politicas-e-parametros.md`.

## Conteúdo do registro: forma canônica

Cada fornecedor fala uma língua: o DNS da casa (PowerDNS) usa a forma de
apresentação do arquivo de zona — TXT entre aspas, em pedaços, com escapes;
host com ponto final —, e o serviço externo usa texto puro. Por dentro (tela,
validação, versões, comparação) circula uma forma só, a canônica de
`lib/dominios/dns/conteudo.ts`:

- host sem ponto final e em minúsculas, menos a raiz `.` (MX nulo, SRV
  indisponível);
- TXT na forma de apresentação **normalizada**: cada string de caractere
  entre aspas, separadas por um espaço, com um só jeito de escrever cada
  byte (UTF-8 imprimível literal; `\"` e `\\`; `\DDD` para controle, NUL e
  byte que não forma UTF-8). Assim `"foo" "bar"` não vira `"foobar"`,
  espaço na ponta e TXT vazio sobrevivem a uma edição, e `\118=spf1` é
  reconhecido como SPF pela regra de SPF duplicado.

Na tela, TXT digitado sem aspas é o texto; entre aspas, é forma de
apresentação, como em todo painel de DNS.

Cada adaptador converte na própria fronteira (`achatar`/`montarConteudo` no
da casa, `paraRegistro`/`paraEntradaExterna` no externo), e o BIND converte
ao gerar o arquivo. O texto que a API do serviço externo devolve é sempre
o texto do registro, aspas incluídas. A API guarda o TXT como um texto só,
então ela recusa o que não consegue guardar — byte que não é UTF-8, TXT
dividido em strings de outro jeito que não a cada 255 bytes —, e o DNS da
casa recusa proxy. A restauração confere todos os alvos antes da primeira
mudança. SOA e NS do próprio domínio são do servidor: não entram em versão
nem podem ser alterados pelo painel.

As versões gravam `{ formato: 2, linhas }`. A lista solta do #77 (formato 1)
só existe em banco de desenvolvimento e é lida pela origem provável: TXT
inteiro entre aspas é apresentação; o resto, texto puro.

## Comportamento conhecido do DNS da casa

Um conjunto (nome + tipo) tem um TTL só. Criar um TXT novo no apex pelo
adaptador da casa regrava o conjunto inteiro com o TTL do registro novo, e o
SPF que já estava lá muda de TTL junto. Não derruba nada, e a versão mostra a
mudança, mas a tela não avisa. Nenhum domínio usa o DNS da casa hoje
(`docs/avila-dns.md`); vale corrigir antes da primeira migração.

## Importação de zona em BIND

É o caminho de quem traz o domínio de outro provedor: o arquivo de zona
exportado lá vira a zona aqui. A zona passa a ser **o que está no arquivo**:
o que não está nele sai, e o que falta entra.

- **Leitura** (`importacao-bind.ts`, função pura) segue o RFC 1035 §5.1:
  `$ORIGIN`, `$TTL`, `@`, nome relativo, dono herdado por linha recuada,
  parênteses, comentário, TTL com unidade (`1h`) e TXT com várias strings ou
  palavra sem aspas.
- **Fica de fora, listado:** SOA, os NS do próprio domínio e os tipos que o
  painel não gerencia (PTR, DS…).
- **É problema, e nada é aplicado:** nome fora do domínio, classe que não é
  IN, `$INCLUDE` ou `$GENERATE`, aspas ou parênteses que não fecham, registro
  sem TTL e arquivo sem nenhum registro, que esvaziaria a zona. O mesmo vale
  quando as regras do painel (SPF duplo, CNAME dividindo nome, MX para IP)
  aplicadas à zona do arquivo, ou o servidor atual, recusam o resultado.
- **Proxy e TTL automático:** o arquivo não traz proxy, e o TTL automático
  (1) sai como 300 no arquivo exportado. Uma linha que já existe na zona
  herda os dois. Assim, importar a própria zona exportada não muda nada, e a
  importação não desliga o proxy de quem já usava.
- **Dois passos:**
  1. A prévia não muda nada e devolve a diferença com uma assinatura.
  2. Importar só aplica se a diferença de agora tiver a mesma assinatura. Se
     a zona mudou entre a prévia e o clique, responde 409 e nada é alterado.
- **Aplicação:** é o mesmo caminho da restauração (`aplicarZonaAlvo`), com
  pré-conferência, aplicação passo a passo, releitura e versão guardada, e
  com auditoria própria: `DNS_ZONA_IMPORTADA[_INCOMPLETA|_NAO_CONFERIDA|_DIVERGENTE]`.
- **Rotas:** `…/dns/importar` (POST, só quem edita), em
  `/api/portal/dominios/[fqdn]` e em `/api/dominios/[fqdn]`.

## O que ainda não existe

Registro, renovação e transferência pelo cliente dependem das decisões A1 e A3
do `cliente.avilaops.com`.

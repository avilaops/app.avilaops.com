# Políticas e parâmetros de domínio

Implementação da camada descrita em `docs/40-produto/POLITICAS-E-PARAMETROS.md`
do cliente.avilaops.com. Todo prazo, limite ou lista que decide algo sobre
domínio sai daqui, com fonte, dono e data de vigência, e não fica como número
solto no código.

## Onde está

| Peça | Arquivo |
|---|---|
| Catálogo de chaves (tipo, camada, unidade, restrição) | `src/lib/parametros/catalogo.ts` |
| Resolução pura (data do evento, escopo, estado) | `src/lib/parametros/resolver.ts` |
| Validação ao gravar e conflitos | `src/lib/parametros/validacao.ts` |
| Leitura e gravação no banco, com auditoria | `src/lib/parametros/index.ts` |
| Tela (lista, histórico, nova versão) | `/hub-social/dominios/parametros` |
| Gravação (só o dono) | `POST /api/parametros` |
| Tabela | `operations.policy_parameter_versions` |

O **valor** fica no banco, e o catálogo guarda só a forma. Uma chave nova
entra no catálogo junto com o código que a lê, e o valor dela entra por
migração ou pela tela.

## Regras

- **Só se acrescenta.** Cada linha é uma versão. O `app_avila` tem `SELECT` e
  `INSERT`, sem `UPDATE` nem `DELETE`. "Vigente até" é derivado da versão
  seguinte e nunca é gravado. Duas versões na mesma data valem pela registrada
  por último, o que permite corrigir no mesmo dia.
- **Data do evento.** `lerParametro(chave, { em })` aplica a versão em vigor
  na data de São Paulo do evento, e não na de hoje. Não se grava versão com
  data passada.
- **Escopo:** registrador > extensão > global
  (`escoposDoDominio("loja.com.br", "opensrs")`).
- **Pendente não decide.** Devolve `{ tipo: "pendente" }`, e quem lê não
  bloqueia nem libera. Pendente num escopo específico não cai para o global.
  Monitorada não é lida.
- **Composição.** Política do produto `VIGENTE` menos protetora que a regra
  externa em vigor na mesma data é recusada (422). Uma regra externa nova
  sempre é gravada, por ser fato de fora. Se ela passar a contrariar uma
  política, a tela mostra o conflito.
- Toda versão gravada gera `PARAMETRO_VERSAO_REGISTRADA`, com o antes e o
  depois.

## Sementes

A migração `20261006120000_parametros_de_politica` grava:

- as regras externas que têm restrição ou uso previsto, como `VIGENTE`, com
  as fontes F1 a F20. A trava de transferência vale desde 21/08/2025 (F2). As
  demais valem desde a data em que a fonte foi consultada (16/09/2026), porque
  o início real não está registrado. Por isso, um evento anterior a essa data
  não tem regra e vai para a operação.
- as políticas do produto como `PENDENTE_DE_CONFIRMACAO`, porque na minuta
  são "valor proposto". O dono confirma na tela, e a confirmação é uma versão
  nova `VIGENTE`.

## Primeiro uso: retenção de versões de zona

`produto.dns.versoesRetencaoDias`: depois de gravar uma versão de zona,
`descartarVersoesAntigas` apaga as versões mais velhas que o prazo e registra
`DNS_VERSOES_DESCARTADAS`, citando o id da versão do parâmetro. Enquanto o
prazo estiver pendente, nada é descartado, e a tela de versões diz isso. A
versão mais nova nunca cai no corte.

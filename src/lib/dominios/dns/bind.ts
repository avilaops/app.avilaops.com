import { ehDoServidor, paraApresentacao } from "@/lib/dominios/dns/conteudo";
import type { LinhaVersao } from "@/lib/dominios/dns/versoes";

/**
 * A zona no formato de arquivo do BIND (RFC 1035 §5), o que qualquer servidor
 * ou fornecedor de DNS importa.
 *
 * É a garantia de saída do cliente: com este arquivo ele leva a zona para
 * onde quiser, sem pedir nada à Ávila. Por isso sai o que está na zona, como
 * está — sem SOA nem NS do servidor, que são de quem hospeda e não do titular.
 *
 * TTL 1 é o "automático" do serviço externo; no arquivo vira 300, o valor que
 * ele usa na prática.
 */

const TTL_AUTOMATICO_EM_SEGUNDOS = 300;

function absoluto(nome: string): string {
  const limpo = nome.trim().toLowerCase();
  return limpo.endsWith(".") ? limpo : `${limpo}.`;
}

function dados(linha: LinhaVersao): string {
  const tipo = linha.tipo.toUpperCase();
  const conteudo = paraApresentacao(tipo, linha.conteudo);
  return linha.prioridade !== null && (tipo === "MX" || tipo === "SRV") ? `${linha.prioridade} ${conteudo}` : conteudo;
}

export function zonaParaBind(
  zona: string,
  linhas: LinhaVersao[],
  cabecalho: { geradoEm: Date; origem: string },
): string {
  const raiz = absoluto(zona);
  const corpo = linhas.filter((linha) => !ehDoServidor(linha, zona)).map((linha) => {
    const ttl = linha.ttl === 1 ? TTL_AUTOMATICO_EM_SEGUNDOS : linha.ttl;
    return [absoluto(linha.nome), String(ttl), "IN", linha.tipo.toUpperCase(), dados(linha)].join("\t");
  });

  return [
    `; Zona ${raiz}`,
    `; ${cabecalho.origem}`,
    `; Gerado em ${cabecalho.geradoEm.toISOString()}`,
    "; SOA e NS ficam com quem servir a zona; não fazem parte deste arquivo.",
    `$ORIGIN ${raiz}`,
    "",
    ...corpo,
    "",
  ].join("\n");
}

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

/** Nome de host no conteúdo (CNAME, MX, NS, SRV) também precisa de ponto final. */
const TIPOS_COM_HOST_NO_FIM = new Set(["CNAME", "MX", "NS", "SRV"]);

/** TXT vai entre aspas, em pedaços de até 255 bytes, que é o limite de cada string. */
function textoTxt(conteudo: string): string {
  const cru = /^"[\s\S]*"$/.test(conteudo.trim()) ? conteudo.trim().slice(1, -1).replace(/"\s+"/g, "") : conteudo;
  const pedacos: string[] = [];
  for (let i = 0; i < cru.length; i += 255) pedacos.push(cru.slice(i, i + 255));
  if (pedacos.length === 0) pedacos.push("");
  return pedacos.map((p) => `"${p.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`).join(" ");
}

function dados(linha: LinhaVersao): string {
  const tipo = linha.tipo.toUpperCase();
  if (tipo === "TXT") return textoTxt(linha.conteudo);

  let conteudo = linha.conteudo.trim();
  if (TIPOS_COM_HOST_NO_FIM.has(tipo)) {
    const partes = conteudo.split(/\s+/);
    partes[partes.length - 1] = absoluto(partes[partes.length - 1]);
    conteudo = partes.join(" ");
  }
  return linha.prioridade !== null && (tipo === "MX" || tipo === "SRV") ? `${linha.prioridade} ${conteudo}` : conteudo;
}

export function zonaParaBind(
  zona: string,
  linhas: LinhaVersao[],
  cabecalho: { geradoEm: Date; origem: string },
): string {
  const raiz = absoluto(zona);
  const corpo = linhas.map((linha) => {
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

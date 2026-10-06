import type { Camada, EstadoParametro } from "@/lib/parametros/catalogo";

/**
 * Qual valor vale para um evento. Função pura: entram as versões guardadas, a
 * chave, os escopos do caso e a data do evento; sai o valor com a versão que o
 * decidiu — ou a razão de não haver decisão.
 *
 * Regras (POLITICAS-E-PARAMETROS §2):
 *
 * 1. Vale a versão em vigor **na data do evento**, não na de hoje. Mudança da
 *    ICANN entra com data futura e não reescreve o que já aconteceu.
 * 2. Escopo mais específico vence: registrador > extensão > global.
 * 3. `PENDENTE_DE_CONFIRMACAO` não decide: o caso vai para operação humana.
 *    Pendente num escopo específico não cai para o global — o global não diz
 *    nada sobre o caso específico que ainda não foi confirmado.
 * 4. `MONITORADA` não é lida: o escopo fica como se não tivesse versão.
 */

export type VersaoParametro = {
  id: string;
  chave: string;
  camada: Camada;
  escopo: string;
  valor: unknown;
  estado: EstadoParametro;
  fontes: string[];
  /** AAAA-MM-DD. */
  vigenteDesde: string;
  revisarEm: string | null;
  dono: string;
  nota: string | null;
  /** ISO. Desempata duas versões com a mesma data: vale a registrada por último. */
  registradaEm: string;
  quem: string | null;
};

export type Resolucao =
  | { tipo: "vigente"; valor: unknown; versao: VersaoParametro }
  | { tipo: "pendente"; versao: VersaoParametro }
  | { tipo: "ausente" };

export const ESCOPO_GLOBAL = "global";

/** Data do calendário em São Paulo (AAAA-MM-DD): é a data em que o evento aconteceu para quem opera. */
export function dataDoEvento(instante: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instante);
}

/**
 * Escopos de um domínio, do mais específico ao global. `loja.com.br` com
 * registrador `opensrs` → `registrador:opensrs`, `.com.br`, `.br`, `global`.
 */
export function escoposDoDominio(fqdn: string, registrador?: string | null): string[] {
  const rotulos = fqdn.trim().toLowerCase().replace(/\.$/, "").split(".");
  const extensoes: string[] = [];
  for (let i = 1; i < rotulos.length; i++) extensoes.push(`.${rotulos.slice(i).join(".")}`);
  return [...(registrador ? [`registrador:${registrador.toLowerCase()}`] : []), ...extensoes, ESCOPO_GLOBAL];
}

function ordem(a: VersaoParametro, b: VersaoParametro) {
  return a.vigenteDesde.localeCompare(b.vigenteDesde) || a.registradaEm.localeCompare(b.registradaEm);
}

/** A versão em vigor numa data, num escopo: a de maior `vigenteDesde` até a data. */
export function versaoEmVigor(versoes: VersaoParametro[], chave: string, escopo: string, data: string) {
  const candidatas = versoes
    .filter((v) => v.chave === chave && v.escopo === escopo && v.vigenteDesde <= data)
    .sort(ordem);
  return candidatas[candidatas.length - 1] ?? null;
}

export function resolver(
  versoes: VersaoParametro[],
  chave: string,
  { escopos = [ESCOPO_GLOBAL], data }: { escopos?: string[]; data: string },
): Resolucao {
  for (const escopo of escopos) {
    const versao = versaoEmVigor(versoes, chave, escopo, data);
    if (!versao || versao.estado === "MONITORADA") continue;
    if (versao.estado === "PENDENTE_DE_CONFIRMACAO") return { tipo: "pendente", versao };
    return { tipo: "vigente", valor: versao.valor, versao };
  }
  return { tipo: "ausente" };
}

/**
 * Até quando a versão vale: o dia anterior à próxima versão do mesmo escopo.
 * Nulo enquanto não houver próxima. É derivado, nunca gravado — a linha não se
 * edita.
 */
export function vigenteAte(versoes: VersaoParametro[], versao: VersaoParametro): string | null {
  const proxima = versoes
    .filter((v) => v.chave === versao.chave && v.escopo === versao.escopo && v.id !== versao.id && ordem(v, versao) > 0)
    .sort(ordem)[0];
  if (!proxima) return null;
  if (proxima.vigenteDesde === versao.vigenteDesde) return versao.vigenteDesde; // corrigida no mesmo dia
  const dia = new Date(`${proxima.vigenteDesde}T00:00:00Z`);
  dia.setUTCDate(dia.getUTCDate() - 1);
  return dia.toISOString().slice(0, 10);
}

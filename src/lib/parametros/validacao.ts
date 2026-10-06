import { conferirForma, definicaoDe, CATALOGO, ESTADOS, type EstadoParametro } from "@/lib/parametros/catalogo";
import { ESCOPO_GLOBAL, resolver, type VersaoParametro } from "@/lib/parametros/resolver";

/**
 * O que barra uma versão nova de parâmetro antes de ela ser gravada. Pura,
 * como o resolvedor: entra o que já está guardado e a data de hoje.
 */

export type EntradaVersao = {
  chave: string;
  escopo?: string;
  valor: unknown;
  estado: string;
  /** AAAA-MM-DD. */
  vigenteDesde: string;
  revisarEm?: string | null;
  fontes: string[];
  dono: string;
  nota?: string | null;
};

const ESCOPO = /^(global|\.[a-z0-9-]+(\.[a-z0-9-]+)*|registrador:[a-z0-9-]+)$/;
const DATA = /^\d{4}-\d{2}-\d{2}$/;

function dataValida(texto: string) {
  if (!DATA.test(texto)) return false;
  const d = new Date(`${texto}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === texto;
}

/** Do escopo pedido até o global: `.com.br` → `.com.br`, `.br`, `global`. */
export function escoposAPartirDe(escopo: string): string[] {
  if (escopo === ESCOPO_GLOBAL) return [ESCOPO_GLOBAL];
  if (escopo.startsWith("registrador:")) return [escopo, ESCOPO_GLOBAL];
  const rotulos = escopo.slice(1).split(".");
  return [...rotulos.map((_, i) => `.${rotulos.slice(i).join(".")}`), ESCOPO_GLOBAL];
}

/**
 * Problema de composição: a política do produto, na data, contraria uma regra
 * externa vigente na mesma data? Nulo quando respeita ou não há o que conferir.
 */
export function contrariaRegraExterna(
  versoes: VersaoParametro[],
  chave: string,
  valor: unknown,
  escopo: string,
  data: string,
): string | null {
  const definicao = definicaoDe(chave);
  if (!definicao?.naoPodeContrariar) return null;
  const escopos = escoposAPartirDe(escopo);
  return definicao.naoPodeContrariar.conferir(valor, (outra) => {
    const r = resolver(versoes, outra, { escopos, data });
    return r.tipo === "vigente" ? r.valor : undefined;
  });
}

export function validarNovaVersao(entrada: EntradaVersao, versoes: VersaoParametro[], hoje: string): string[] {
  const problemas: string[] = [];
  const definicao = definicaoDe(entrada.chave);
  if (!definicao) return [`A chave ${entrada.chave} não existe no catálogo.`];

  const escopo = entrada.escopo ?? ESCOPO_GLOBAL;
  if (!ESCOPO.test(escopo)) problemas.push("Escopo é global, uma extensão (.br) ou registrador:<nome>.");

  const forma = conferirForma(definicao.tipo, entrada.valor);
  if (forma) problemas.push(forma);

  if (!ESTADOS.includes(entrada.estado as EstadoParametro)) {
    problemas.push("Estado é vigente, pendente de confirmação ou monitorada.");
  }

  if (!dataValida(entrada.vigenteDesde)) {
    problemas.push("Vigente desde precisa de uma data válida.");
  } else if (entrada.vigenteDesde < hoje) {
    // Data passada reescreveria a regra de eventos que já aconteceram.
    problemas.push("Vigente desde não pode ser no passado: o que já aconteceu continua com a versão da época.");
  }

  if (entrada.revisarEm && !dataValida(entrada.revisarEm)) problemas.push("Revisar em precisa de uma data válida.");

  if (!entrada.fontes.some((f) => f.trim())) {
    problemas.push(
      definicao.camada === "POLITICA_PRODUTO"
        ? "Diga onde a decisão está registrada (documento ou decisão)."
        : "Regra de terceiro precisa do ID da fonte em FONTES-REGRAS-DE-TERCEIROS.",
    );
  }
  if (!entrada.dono.trim()) problemas.push("Diga quem é o dono do parâmetro.");

  if (problemas.length === 0 && entrada.estado === "VIGENTE") {
    const contraria = contrariaRegraExterna(versoes, entrada.chave, entrada.valor, escopo, entrada.vigenteDesde);
    if (contraria) problemas.push(`A política do produto não pode ser menos protetora que a regra externa. ${contraria}`);
  }
  return problemas;
}

export type Conflito = { chave: string; escopo: string; data: string; problema: string };

/**
 * Políticas do produto que passam a contrariar uma regra externa — hoje ou na
 * data de uma versão já agendada. A regra externa não é recusada (é fato de
 * fora); quem tem que mudar é a política, e a tela mostra isso.
 */
export function conflitos(versoes: VersaoParametro[], hoje: string): Conflito[] {
  const datas = [...new Set([hoje, ...versoes.map((v) => v.vigenteDesde).filter((d) => d > hoje)])].sort();
  const achados: Conflito[] = [];
  for (const definicao of CATALOGO) {
    if (!definicao.naoPodeContrariar) continue;
    const escopos = [...new Set(versoes.filter((v) => v.chave === definicao.chave).map((v) => v.escopo))];
    for (const escopo of escopos) {
      for (const data of datas) {
        const r = resolver(versoes, definicao.chave, { escopos: [escopo], data });
        if (r.tipo !== "vigente") continue;
        const problema = contrariaRegraExterna(versoes, definicao.chave, r.valor, escopo, data);
        if (problema) {
          achados.push({ chave: definicao.chave, escopo, data, problema });
          break;
        }
      }
    }
  }
  return achados;
}

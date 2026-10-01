/**
 * Cliente de leitura do Registro.br (NIC.br), para domínios `.br`.
 *
 * Duas fontes, com papéis diferentes de propósito:
 *
 * - **RDAP** (`rdap.registro.br`) é a fonte oficial: JSON público, sem chave,
 *   e é de onde saem a data de expiração, o titular e os nameservers. É quem
 *   manda quando as duas discordam.
 * - **`registro.br/v2/ajax/avail/raw`** é o endpoint que o próprio site do
 *   Registro.br usa na caixa de busca. Não é documentado nem prometido: pode
 *   mudar sem aviso. Entra só para explicar o que o RDAP não explica: por que
 *   um nome livre não pode ser registrado (palavra reservada, categoria
 *   inválida). Nunca sobrescreve o RDAP.
 *
 * **Não existe API pública para registrar, renovar ou trocar DNS.** Isso é EPP
 * (XML sobre TLS em `epp.registro.br`), restrito a provedor credenciado pelo
 * NIC.br: CNPJ, homologação e IPs fixos autorizados. Daqui só sai leitura.
 */

import { ehDominioBr, exigirDominio } from "@/lib/dominio";

const RDAP_BASE = "https://rdap.registro.br/domain";
const AVAIL_BASE = "https://registro.br/v2/ajax/avail/raw";

/** O RDAP público não cobra, mas também não promete banda. Identificamos quem chama. */
const AGENTE = "AvilaOS/1.0 (+https://app.avilaops.com; contato: nicolas@avilaops.com)";

const TEMPO_LIMITE_MS = 8_000;

/**
 * Domínio registrado muda pouco: a expiração é anual. Domínio livre muda a
 * qualquer momento e é o que a pessoa fica reconsultando na tela, então a
 * janela é curta. Resultado indefinido não entra no cache, porque repetir a consulta
 * é melhor do que repetir a dúvida.
 */
const TTL_REGISTRADO_MS = 6 * 60 * 60 * 1000;
const TTL_LIVRE_MS = 5 * 60 * 1000;
const TTL_BLOQUEADO_MS = 24 * 60 * 60 * 1000;

/** Teto do cache em memória. Estourou, sai o mais antigo. */
const CACHE_MAXIMO = 500;

export type StatusDominioBr =
  /** Livre para registro. */
  | "LIVRE"
  /** Já tem dono. */
  | "REGISTRADO"
  /** Existe, mas não pode ser registrado: palavra reservada pelo CG, categoria inválida. */
  | "BLOQUEADO"
  /** Não é um nome válido sob `.br`. */
  | "INVALIDO"
  /** Nenhuma das fontes respondeu de forma conclusiva. */
  | "DESCONHECIDO";

export type ConsultaRegistroBr = {
  fqdn: string;
  status: StatusDominioBr;
  /** Quais fontes sustentam este resultado. */
  fontes: ("RDAP" | "AVAIL")[];
  /** ISO 8601. Nulo quando o domínio é isento de pagamento (ex.: `nic.br`) ou está livre. */
  expiraEm: string | null;
  registradoEm: string | null;
  alteradoEm: string | null;
  /** Nome do titular como o RDAP publica. */
  titular: string | null;
  /** CNPJ ou CPF do titular, quando o RDAP publica. */
  documentoTitular: string | null;
  nameservers: string[];
  /** Status cru do RDAP (`active`, `pending delete`, …). */
  statusRdap: string[];
  /** Motivos que o `avail` deu para um nome indisponível. */
  motivos: string[];
  /** Uma frase para a tela. Nunca inventa: descreve o que a fonte disse. */
  mensagem: string;
  /** ISO 8601 de quando as fontes foram lidas de verdade (não de quando o cache respondeu). */
  consultadoEm: string;
  deCache: boolean;
  bruto: { rdap: unknown; disponibilidade: unknown };
};

type Entrada = { consulta: ConsultaRegistroBr; expiraEm: number };

const cache = new Map<string, Entrada>();

function ttlDe(status: StatusDominioBr): number | null {
  if (status === "REGISTRADO") return TTL_REGISTRADO_MS;
  if (status === "LIVRE") return TTL_LIVRE_MS;
  if (status === "BLOQUEADO" || status === "INVALIDO") return TTL_BLOQUEADO_MS;
  return null;
}

function lerDoCache(fqdn: string, agora: number): ConsultaRegistroBr | null {
  const entrada = cache.get(fqdn);
  if (!entrada) return null;
  if (entrada.expiraEm <= agora) {
    cache.delete(fqdn);
    return null;
  }
  // Uso recente vai para o fim da fila de despejo.
  cache.delete(fqdn);
  cache.set(fqdn, entrada);
  return { ...entrada.consulta, deCache: true };
}

function gravarNoCache(consulta: ConsultaRegistroBr, agora: number): void {
  const ttl = ttlDe(consulta.status);
  if (ttl === null) return;

  if (cache.size >= CACHE_MAXIMO) {
    const maisAntigo = cache.keys().next();
    if (!maisAntigo.done) cache.delete(maisAntigo.value);
  }
  cache.set(consulta.fqdn, { consulta: { ...consulta, deCache: false }, expiraEm: agora + ttl });
}

/** Esvazia o cache. Existe para os testes e para o botão de resincronizar. */
export function limparCacheRegistroBr(): void {
  cache.clear();
}

async function buscarJson(url: string): Promise<{ http: number; corpo: unknown }> {
  const controlador = new AbortController();
  const relogio = setTimeout(() => controlador.abort(), TEMPO_LIMITE_MS);
  try {
    const resposta = await fetch(url, {
      signal: controlador.signal,
      headers: { accept: "application/rdap+json, application/json", "user-agent": AGENTE },
      cache: "no-store",
    });
    const corpo = await resposta.json().catch(() => null);
    return { http: resposta.status, corpo };
  } finally {
    clearTimeout(relogio);
  }
}

// ---------------------------------------------------------------------------
// RDAP
// ---------------------------------------------------------------------------

type EventoRdap = { eventAction?: string; eventDate?: string };

type EntidadeRdap = {
  roles?: string[];
  vcardArray?: unknown;
  publicIds?: { type?: string; identifier?: string }[];
};

type RespostaRdap = {
  /** Nome que a resposta descreve. Pode não ser o que pedimos. */
  ldhName?: string;
  handle?: string;
  events?: EventoRdap[];
  status?: string[];
  nameservers?: { ldhName?: string }[];
  entities?: EntidadeRdap[];
};

function dataDoEvento(eventos: EventoRdap[] | undefined, acao: string): string | null {
  const evento = eventos?.find((e) => e.eventAction === acao);
  if (!evento?.eventDate) return null;
  const data = new Date(evento.eventDate);
  return Number.isNaN(data.getTime()) ? null : data.toISOString();
}

/**
 * Lê um campo do vCard do RDAP. O formato é `["vcard", [["fn", {}, "text", "UOL"], …]]`
 * ou seja, uma lista de tuplas posicionais, não um objeto.
 */
function campoVcard(vcardArray: unknown, nome: string): string | null {
  if (!Array.isArray(vcardArray) || !Array.isArray(vcardArray[1])) return null;
  for (const campo of vcardArray[1] as unknown[]) {
    if (Array.isArray(campo) && campo[0] === nome && typeof campo[3] === "string") {
      return campo[3].trim() || null;
    }
  }
  return null;
}

function titularDe(resposta: RespostaRdap): { nome: string | null; documento: string | null } {
  const registrante = resposta.entities?.find((e) => e.roles?.includes("registrant"));
  if (!registrante) return { nome: null, documento: null };

  const documento =
    registrante.publicIds?.find((id) => id.type === "cnpj" || id.type === "cpf")?.identifier ?? null;

  return { nome: campoVcard(registrante.vcardArray, "fn"), documento: documento || null };
}

export type LeituraRdapBr =
  | { tipo: "REGISTRADO"; dados: RespostaRdap }
  | { tipo: "LIVRE" }
  /** O registro respondeu sobre OUTRO nome. Ver `respostaEhDoMesmoNome`. */
  | { tipo: "OUTRO_NOME"; ldhName: string }
  | { tipo: "INDEFINIDO"; http: number };

/**
 * O registro do `.br` trata hífen como insignificante e responde `303` de
 * `optica-visao.com.br` para `opticavisao.com.br`, que é de outro dono.
 * O `fetch` segue o redirecionamento sem avisar, então a resposta chega com
 * `200` e parece ser do domínio que pedimos. Medido em 18/09/2026.
 *
 * Gravar essa data na ficha diria a um cliente que o domínio dele venceu
 * quando quem venceu foi o de outra pessoa. Por isso o nome da resposta é
 * conferido antes de qualquer coisa.
 */
export function respostaEhDoMesmoNome(fqdn: string, dados: RespostaRdap): boolean {
  const nome = (dados.ldhName ?? dados.handle ?? "").trim().toLowerCase().replace(/\.$/, "");
  return nome === "" || nome === fqdn.toLowerCase();
}

export async function lerRdapBr(fqdn: string): Promise<LeituraRdapBr> {
  const { http, corpo } = await buscarJson(`${RDAP_BASE}/${encodeURIComponent(fqdn)}`);

  // 404 no RDAP do registro autoritativo do `.br` significa "não há registro".
  if (http === 404) return { tipo: "LIVRE" };
  if (http === 200 && corpo && typeof corpo === "object") {
    const dados = corpo as RespostaRdap;
    if (!respostaEhDoMesmoNome(fqdn, dados)) {
      return { tipo: "OUTRO_NOME", ldhName: (dados.ldhName ?? dados.handle ?? "").toLowerCase() };
    }
    return { tipo: "REGISTRADO", dados };
  }
  return { tipo: "INDEFINIDO", http };
}

// ---------------------------------------------------------------------------
// avail/raw (não oficial)
// ---------------------------------------------------------------------------

/**
 * Códigos observados no endpoint da caixa de busca do registro.br
 * (medidos em 18/09/2026, já que não há documentação para citar).
 */
const AVAIL_LIVRE = 0;
const AVAIL_REGISTRADO = 2;
const AVAIL_BLOQUEADO = 3;
const AVAIL_INVALIDO = 4;

export type RespostaAvail = {
  status?: number;
  fqdn?: string;
  /** Domínio isento de pagamento, sem data de expiração. */
  exempt?: boolean;
  hosts?: string[];
  "publication-status"?: string;
  "expires-at"?: string;
  reasons?: string[];
  suggestions?: string[];
};

export async function lerDisponibilidadeBr(fqdn: string): Promise<RespostaAvail | null> {
  const { http, corpo } = await buscarJson(`${AVAIL_BASE}/${encodeURIComponent(fqdn)}`);
  if (http !== 200 || !corpo || typeof corpo !== "object") return null;
  return corpo as RespostaAvail;
}

function statusDoAvail(codigo: number | undefined): StatusDominioBr {
  if (codigo === AVAIL_LIVRE) return "LIVRE";
  if (codigo === AVAIL_REGISTRADO) return "REGISTRADO";
  if (codigo === AVAIL_BLOQUEADO) return "BLOQUEADO";
  if (codigo === AVAIL_INVALIDO) return "INVALIDO";
  return "DESCONHECIDO";
}

function isoDe(valor: string | undefined): string | null {
  if (!valor) return null;
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? null : data.toISOString();
}

// ---------------------------------------------------------------------------
// Consolidação
// ---------------------------------------------------------------------------

/**
 * Junta RDAP e `avail` numa resposta só. O RDAP decide se o domínio existe; o
 * `avail` entra para explicar um nome que está livre mas não é registrável, e
 * como último recurso quando o RDAP não respondeu.
 */
export function consolidar(
  fqdn: string,
  rdap: LeituraRdapBr,
  avail: RespostaAvail | null,
  consultadoEm: string,
): ConsultaRegistroBr {
  const fontes: ("RDAP" | "AVAIL")[] = [];
  // Resposta sobre outro nome não é fonte sobre este domínio.
  if (rdap.tipo === "REGISTRADO" || rdap.tipo === "LIVRE") fontes.push("RDAP");
  if (avail) fontes.push("AVAIL");

  const base: ConsultaRegistroBr = {
    fqdn,
    status: "DESCONHECIDO",
    fontes,
    expiraEm: null,
    registradoEm: null,
    alteradoEm: null,
    titular: null,
    documentoTitular: null,
    nameservers: [],
    statusRdap: [],
    motivos: avail?.reasons ?? [],
    mensagem: "",
    consultadoEm,
    deCache: false,
    bruto: { rdap: rdap.tipo === "REGISTRADO" ? rdap.dados : null, disponibilidade: avail },
  };

  if (rdap.tipo === "REGISTRADO") {
    const { nome, documento } = titularDe(rdap.dados);
    const expiraRdap = dataDoEvento(rdap.dados.events, "expiration");
    // `nic.br` e outros isentos não têm evento de expiração; o `avail` também
    // omite `expires-at` nesse caso, então o nulo aqui é a resposta certa.
    const expiraEm = expiraRdap ?? isoDe(avail?.["expires-at"]);

    return {
      ...base,
      status: "REGISTRADO",
      expiraEm,
      registradoEm: dataDoEvento(rdap.dados.events, "registration"),
      alteradoEm: dataDoEvento(rdap.dados.events, "last changed"),
      titular: nome,
      documentoTitular: documento,
      nameservers: (rdap.dados.nameservers ?? [])
        .map((ns) => ns.ldhName)
        .filter((ns): ns is string => typeof ns === "string"),
      statusRdap: rdap.dados.status ?? [],
      mensagem: expiraEm
        ? `Registrado${nome ? `, titular ${nome}` : ""}.`
        : `Registrado${nome ? `, titular ${nome}` : ""}, sem data de expiração publicada${avail?.exempt ? " (domínio isento de pagamento)" : ""}.`,
    };
  }

  if (rdap.tipo === "OUTRO_NOME") {
    // O registro respondeu sobre outro nome (hífen é insignificante no `.br`).
    // Nada dessa resposta serve para este domínio: nem data, nem titular. Quem
    // decide aqui é o `avail`, que foi consultado pelo nome exato.
    const porAvail = statusDoAvail(avail?.status);
    const explicacao = `A consulta foi redirecionada para ${rdap.ldhName}, que é outro domínio: no .br o hífen é insignificante. Nada daquela resposta vale para ${fqdn}.`;

    return {
      ...base,
      status: porAvail === "REGISTRADO" ? "DESCONHECIDO" : porAvail,
      mensagem:
        porAvail === "REGISTRADO"
          ? `${explicacao} A fonte secundária diz que o nome está tomado, sem dizer por quem. Conferir manualmente.`
          : base.motivos.length > 0
            ? `${explicacao} ${base.motivos.join("; ")}.`
            : explicacao,
    };
  }

  if (rdap.tipo === "LIVRE") {
    // Sem registro RDAP, mas o `avail` pode dizer que mesmo assim não dá para
    // registrar. Mostrar "livre" nesse caso é mandar a pessoa tentar em vão.
    const porAvail = statusDoAvail(avail?.status);
    if (porAvail === "BLOQUEADO" || porAvail === "INVALIDO") {
      return {
        ...base,
        status: porAvail,
        mensagem:
          base.motivos.length > 0
            ? `Sem registro, mas indisponível: ${base.motivos.join("; ")}.`
            : "Sem registro, mas este nome não é aceito para registro.",
      };
    }

    return {
      ...base,
      status: "LIVRE",
      mensagem: "Nenhum registro encontrado. Confirmar o preço final antes de contratar.",
    };
  }

  // RDAP não respondeu. O `avail` sustenta sozinho, dizendo que sustenta.
  const porAvail = statusDoAvail(avail?.status);
  if (porAvail !== "DESCONHECIDO") {
    // Nome inválido não é "RDAP fora do ar": o RDAP devolve 400 justamente
    // porque o nome não existe como domínio (medido em 18/09/2026 com
    // `xn--a-99.com.br`). Culpar a fonte aí manda a pessoa tentar de novo.
    const culpaDoNome = porAvail === "INVALIDO" || porAvail === "BLOQUEADO";
    return {
      ...base,
      status: porAvail,
      expiraEm: isoDe(avail?.["expires-at"]),
      nameservers: avail?.hosts ?? [],
      mensagem: culpaDoNome
        ? base.motivos.length > 0
          ? `Este nome não é aceito para registro: ${base.motivos.join("; ")}.`
          : "Este nome não é aceito para registro."
        : `A fonte principal não respondeu (HTTP ${rdap.http}). O resultado veio de uma fonte secundária, que não é documentada e pode mudar sem aviso.`,
    };
  }

  return {
    ...base,
    mensagem: `Não foi possível consultar o registro agora (HTTP ${rdap.http}). Conferir manualmente.`,
  };
}

/**
 * Consulta um domínio `.br` no Registro.br, com cache em memória.
 *
 * `forcar` ignora o cache. É o que o botão de resincronizar usa.
 */
export async function consultarDominioBr(
  entrada: string,
  opcoes: { forcar?: boolean } = {},
): Promise<ConsultaRegistroBr> {
  const fqdn = exigirDominio(entrada);
  if (!ehDominioBr(fqdn)) {
    throw new Error("Este cliente só consulta domínios .br. Para os demais, use checkDomainAvailability().");
  }

  const agora = Date.now();
  if (!opcoes.forcar) {
    const emCache = lerDoCache(fqdn, agora);
    if (emCache) return emCache;
  }

  const consultadoEm = new Date(agora).toISOString();

  // O RDAP é a fonte que decide; o `avail` roda junto porque é a única que
  // explica nome reservado, e esperar em série dobraria o tempo da tela.
  const [rdap, avail] = await Promise.all([
    lerRdapBr(fqdn).catch((): LeituraRdapBr => ({ tipo: "INDEFINIDO", http: 0 })),
    lerDisponibilidadeBr(fqdn).catch(() => null),
  ]);

  const consulta = consolidar(fqdn, rdap, avail, consultadoEm);
  gravarNoCache(consulta, agora);
  return consulta;
}

/** Dias inteiros até a expiração. Negativo quando já passou. */
export function diasAte(expiraEm: string | null, agora: Date = new Date()): number | null {
  if (!expiraEm) return null;
  const data = new Date(expiraEm);
  if (Number.isNaN(data.getTime())) return null;
  return Math.ceil((data.getTime() - agora.getTime()) / (24 * 60 * 60 * 1000));
}

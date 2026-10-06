import { exigirDominio } from "@/lib/dominio";
import { cleanText } from "@/lib/http";
import { escoposDoDominio, lerParametro } from "@/lib/parametros";
import { prisma } from "@/lib/prisma";
import { lerServicoDeDns, provedorDeDnsDoDominio, tipoDnsValido } from "@/lib/dominios/dns";
import type { EntradaRegistroDns, RegistroDns, ServicoDeDns } from "@/lib/dominios/dns/tipos";
import { nomeCompleto, validarRegistroDns, type ProblemaDns } from "@/lib/dominios/dns/validacao";
import { ehDoServidor, paraTextoPuro, txtDeEntrada } from "@/lib/dominios/dns/conteudo";
import {
  diferencaParaVersao,
  lerLinhas,
  paraEntrada,
  linhasDoTitular,
  paraJsonDaVersao,
  zonaIgual,
} from "@/lib/dominios/dns/versoes";

/**
 * A escrita de DNS, igual para a equipe e para o cliente.
 *
 * Até 04/10/2026 só a rota da equipe escrevia, e a regra morava nela. Com o
 * portal do cliente editando a própria zona, a regra virou serviço: as duas
 * rotas decidem **quem** pode, e daqui para baixo o caminho é um só — mesma
 * resolução de zona, mesma validação, mesma auditoria. Duas cópias divergiriam
 * na primeira correção, e a divergência apareceria como registro que a equipe
 * consegue gravar e o cliente não (ou o contrário).
 *
 * Auditoria com antes, depois e origem, como pede o regimento interno 08: quem
 * lê a trilha precisa saber se foi o cliente, a equipe ou uma automação, e o
 * que havia antes, para conseguir desfazer.
 */

export type OrigemEscritaDns = "EQUIPE" | "CLIENTE";

export type Ator = { id: string; origem: OrigemEscritaDns };

export type OperacaoDns =
  | { acao: "criar"; entrada: EntradaRegistroDns }
  | { acao: "alterar"; registroId: string; entrada: EntradaRegistroDns }
  | { acao: "apagar"; registroId: string };

export class ErroDeDns extends Error {
  constructor(
    mensagem: string,
    readonly status: number = 400,
    readonly problemas: ProblemaDns[] = [],
  ) {
    super(mensagem);
    this.name = "ErroDeDns";
  }
}

type CorpoDns = {
  registroId?: unknown;
  tipo?: unknown;
  nome?: unknown;
  conteudo?: unknown;
  ttl?: unknown;
  prioridade?: unknown;
};

export function lerEntradaDns(corpo: CorpoDns): EntradaRegistroDns {
  const tipo = cleanText(corpo.tipo, 10).toUpperCase();
  if (!tipoDnsValido(tipo)) throw new ErroDeDns("Tipo de registro não suportado.");

  const nome = cleanText(corpo.nome, 253);
  const conteudo = cleanText(corpo.conteudo, 2048);
  if (!nome) throw new ErroDeDns("Informe o nome do registro.");
  if (!conteudo) throw new ErroDeDns("Informe o conteúdo do registro.");

  const ttlBruto = Number(corpo.ttl);
  const ttl = Number.isFinite(ttlBruto) && ttlBruto >= 1 ? Math.floor(ttlBruto) : 1;

  const prioridadeBruta = Number(corpo.prioridade);
  const prioridade =
    corpo.prioridade === undefined || corpo.prioridade === null || corpo.prioridade === ""
      ? undefined
      : Number.isFinite(prioridadeBruta) && prioridadeBruta >= 0
        ? Math.floor(prioridadeBruta)
        : undefined;

  // TXT entra na forma canônica antes de qualquer validação: o mesmo SPF pode
  // ser escrito de vários jeitos (`v` e `\118`), e a regra de SPF duplicado
  // só funciona olhando uma forma só.
  return { tipo, nome, conteudo: tipo === "TXT" ? txtDeEntrada(conteudo) : conteudo, ttl, prioridade };
}

/**
 * No DNS da casa o TTL é do conjunto (nome + tipo). Uma versão vinda do
 * serviço externo com TTLs diferentes no mesmo conjunto não tem como ficar
 * igual aqui: cada escrita regravaria o TTL das irmãs, e a restauração só
 * terminaria divergente depois de já ter mexido na zona.
 */
function conferirTtlPorConjunto(linhas: { tipo: string; nome: string; ttl: number }[], zona: string) {
  const ttlPorConjunto = new Map<string, number>();
  for (const linha of linhas) {
    if (ehDoServidor(linha, zona)) continue;
    const chave = `${linha.tipo.toUpperCase()} ${linha.nome.toLowerCase().replace(/\.$/, "")}`;
    const visto = ttlPorConjunto.get(chave);
    if (visto !== undefined && visto !== linha.ttl) {
      throw new ErroDeDns(
        `${chave} tem TTLs diferentes nesta versão, e no DNS deste domínio o TTL vale para o conjunto inteiro. Nada foi alterado.`,
        422,
      );
    }
    ttlPorConjunto.set(chave, linha.ttl);
  }
}

/**
 * Confere que o servidor do domínio consegue receber este conteúdo, sem
 * escrever nada. O serviço externo não aceita TXT com byte que não é UTF-8;
 * descobrir isso no meio de uma restauração, depois de apagar registros, é
 * deixar a zona pela metade.
 */
function conferirParaServidor(servico: ServicoDeDns, entrada: EntradaRegistroDns) {
  if (servico === "AVILA") {
    // Proxy é recurso de rede de borda do serviço externo; o DNS da casa não
    // tem. Uma versão com proxy restaurada aqui nunca ficaria igual à versão.
    if (entrada.proxy) {
      throw new ErroDeDns(
        `${entrada.tipo} ${entrada.nome} usa proxy, que o DNS deste domínio não oferece. Nada foi alterado.`,
        422,
      );
    }
    return;
  }
  if (servico !== "EXTERNO") return;
  try {
    paraTextoPuro(entrada.tipo, entrada.conteudo);
  } catch (e) {
    throw new ErroDeDns(
      `${e instanceof Error ? e.message : "Conteúdo não aceito pelo serviço de DNS."} Nada foi alterado.`,
      422,
    );
  }
}

export function lerOperacaoDns(metodo: string, corpo: CorpoDns): OperacaoDns {
  if (metodo === "POST") return { acao: "criar", entrada: lerEntradaDns(corpo) };

  const registroId = cleanText(corpo.registroId, 512);
  if (metodo === "PUT") {
    if (!registroId) throw new ErroDeDns("Informe qual registro alterar.");
    return { acao: "alterar", registroId, entrada: lerEntradaDns(corpo) };
  }
  if (metodo === "DELETE") {
    if (!registroId) throw new ErroDeDns("Informe qual registro apagar.");
    return { acao: "apagar", registroId };
  }
  throw new ErroDeDns("Operação não suportada.", 405);
}

/**
 * Resolve o domínio, quem serve o DNS dele e qual é o id da zona lá.
 *
 * O id da zona nunca vem da requisição: no serviço externo é o id guardado no
 * banco, no DNS da casa é o próprio nome do domínio. Com `organizationId`, o
 * domínio de outra empresa responde como inexistente — a mesma resposta de um
 * domínio que não está na carteira, para não confirmar a quem pergunta que
 * aquele domínio é nosso.
 */
export async function resolverZonaDns(fqdnBruto: string, organizationId?: string) {
  const dominio = await resolverDominioDns(fqdnBruto, organizationId);

  const servico = lerServicoDeDns(dominio.dnsProvider);
  const provedor = provedorDeDnsDoDominio(dominio);
  if (!provedor) throw new ErroDeDns("Este domínio não tem DNS gerenciado por esta plataforma.", 409);
  if (!provedor.configurado()) throw new ErroDeDns("O serviço de DNS deste domínio não está conectado.", 503);

  const zonaId = servico === "AVILA" ? dominio.fqdn : dominio.cloudflareZoneId;
  if (!zonaId) throw new ErroDeDns("Este domínio não tem zona de DNS configurada.", 409);

  return { ...dominio, provedor, zonaId, servico };
}

/**
 * Só o domínio, com o escopo da empresa, sem exigir serviço de DNS ativo.
 * É o que basta para ler uma versão guardada: o cliente que tirou o domínio
 * daqui é justamente quem mais precisa baixar a zona antiga.
 */
export async function resolverDominioDns(fqdnBruto: string, organizationId?: string) {
  let fqdn: string;
  try {
    fqdn = exigirDominio(fqdnBruto);
  } catch (e) {
    throw new ErroDeDns(e instanceof Error ? e.message : "Domínio inválido.");
  }

  const dominio = await prisma.domainAsset.findUnique({
    where: { fqdn },
    select: { id: true, fqdn: true, status: true, cloudflareZoneId: true, organizationId: true, dnsProvider: true },
  });

  if (!dominio || (organizationId && dominio.organizationId !== organizationId)) {
    throw new ErroDeDns("Domínio não encontrado.", 404);
  }
  return dominio;
}

/**
 * Tira do espelho no banco o registro que o servidor já apagou. Falha aqui é
 * de cache local: vai para o log e não interrompe nada — o servidor de DNS é
 * a fonte, e a próxima sincronização refaz o espelho.
 */
async function limparEspelho(registroId: string) {
  try {
    await prisma.dnsRecord.deleteMany({ where: { cloudflareRecordId: registroId } });
  } catch (e) {
    console.error("[dns] não foi possível limpar o espelho do registro", registroId, e);
  }
}

const ACAO_RESTAURACAO = {
  OK: "DNS_ZONA_RESTAURADA",
  INCOMPLETA: "DNS_ZONA_RESTAURADA_INCOMPLETA",
  NAO_CONFERIDA: "DNS_ZONA_RESTAURADA_NAO_CONFERIDA",
  DIVERGENTE: "DNS_ZONA_RESTAURADA_DIVERGENTE",
} as const;

const ACAO_AUDITORIA = {
  criar: "DNS_REGISTRO_CRIADO",
  alterar: "DNS_REGISTRO_ALTERADO",
  apagar: "DNS_REGISTRO_APAGADO",
} as const;

function paraAuditoria(registro: RegistroDns | null) {
  if (!registro) return null;
  return {
    tipo: registro.tipo,
    nome: registro.nome,
    conteudo: registro.conteudo,
    ttl: registro.ttl,
    prioridade: registro.prioridade,
    proxy: registro.proxy,
  };
}

/**
 * Executa uma operação na zona: lê, valida, grava e audita.
 *
 * A zona é lida do servidor antes de cada escrita, não do espelho no banco:
 * a validação de "já existe SPF aqui" contra um espelho de uma hora atrás
 * deixaria passar exatamente o caso que ela existe para barrar.
 *
 * Falha do servidor também vira evento de auditoria. Tentativa recusada é
 * informação: três tentativas seguidas de apagar o MX dizem alguma coisa.
 */
export async function executarOperacaoDns(
  fqdn: string,
  operacao: OperacaoDns,
  ator: Ator,
  escopo?: { organizationId: string },
): Promise<RegistroDns | null> {
  const zona = await resolverZonaDns(fqdn, escopo?.organizationId);

  let existentes: RegistroDns[];
  try {
    existentes = await zona.provedor.listar(zona.zonaId);
  } catch (e) {
    console.error("[dns] falha ao ler a zona antes de escrever", zona.fqdn, e);
    throw new ErroDeDns("Não foi possível ler a zona agora. Nada foi alterado.", 502);
  }

  const antes =
    operacao.acao === "criar" ? null : (existentes.find((registro) => registro.id === operacao.registroId) ?? null);
  if (operacao.acao !== "criar" && !antes) {
    throw new ErroDeDns("Esse registro não existe mais na zona. Atualize a página.", 404);
  }
  // SOA e NS do próprio domínio são do servidor: ficam fora das versões, então
  // um erro neles não teria para onde voltar. Não se mexe neles por aqui.
  const alvoDoServidor =
    (antes && ehDoServidor(antes, zona.fqdn)) ||
    (operacao.acao !== "apagar" && ehDoServidor({ ...operacao.entrada, nome: nomeCompleto(operacao.entrada.nome, zona.fqdn) }, zona.fqdn));
  if (alvoDoServidor) {
    throw new ErroDeDns("SOA e NS do próprio domínio são do servidor de DNS e não são alterados pelo painel.", 403);
  }

  if (operacao.acao !== "apagar") {
    // "www" e "@" viram o nome completo antes de sair. O serviço externo
    // completaria sozinho, o DNS da casa não: lá "www" viraria "www." e cairia
    // fora da zona.
    operacao.entrada = { ...operacao.entrada, nome: nomeCompleto(operacao.entrada.nome, zona.fqdn) };
    conferirParaServidor(zona.servico, operacao.entrada);
    const problemas = validarRegistroDns(operacao.entrada, {
      zona: zona.fqdn,
      existentes,
      substituindoId: operacao.acao === "alterar" ? operacao.registroId : null,
      permiteCnameNoApex: zona.servico === "EXTERNO",
    });
    if (problemas.length > 0) {
      throw new ErroDeDns(problemas[0].mensagem, 422, problemas);
    }
  }

  const auditar = (resultado: "OK" | "FALHA", depois: RegistroDns | null, erro?: string) =>
    prisma.operationsAuditEvent.create({
      data: {
        actorId: ator.id,
        organizationId: zona.organizationId,
        action: resultado === "OK" ? ACAO_AUDITORIA[operacao.acao] : `${ACAO_AUDITORIA[operacao.acao]}_FALHOU`,
        entityType: "DomainAsset",
        entityId: zona.id,
        metadata: JSON.parse(
          JSON.stringify({
            fqdn: zona.fqdn,
            origem: ator.origem,
            servico: zona.servico,
            registroId: operacao.acao === "criar" ? (depois?.id ?? null) : operacao.registroId,
            antes: paraAuditoria(antes),
            depois: paraAuditoria(depois),
            ...(operacao.acao !== "apagar" ? { pedido: operacao.entrada } : {}),
            ...(erro ? { erro } : {}),
          }),
        ),
      },
    });

  await garantirRetratoInicial(zona.id, zona.fqdn, existentes);

  let depois: RegistroDns | null = null;
  try {
    if (operacao.acao === "criar") {
      depois = await zona.provedor.criar(zona.zonaId, operacao.entrada);
    } else if (operacao.acao === "alterar") {
      depois = await zona.provedor.atualizar(zona.zonaId, operacao.registroId, operacao.entrada);
    } else {
      await zona.provedor.remover(zona.zonaId, operacao.registroId);
    }
  } catch (e) {
    const mensagem = e instanceof Error ? e.message : "erro desconhecido";
    console.error("[dns] falha ao escrever na zona", zona.fqdn, operacao.acao, e);
    await auditar("FALHA", null, mensagem.slice(0, 500));
    // O erro cru do servidor ajuda a equipe ("registro já existe") e já era o
    // que a tela dela mostrava. Ao cliente vai a frase: o cru pode citar
    // conector e conta, e isso não é assunto dele.
    throw new ErroDeDns(
      ator.origem === "EQUIPE" ? mensagem : "O serviço de DNS recusou a alteração. Nada foi gravado.",
      502,
    );
  }

  // O espelho no banco sai junto: linha órfã faria a tela mostrar um
  // registro que já não existe até a próxima sincronização.
  if (operacao.acao === "apagar") await limparEspelho(operacao.registroId);

  // Daqui para baixo a zona já mudou. Falha ao registrar não pode virar
  // "nada foi gravado" na tela: vai para o log e a resposta segue.
  await auditar("OK", depois).catch((e) => console.error("[dns] auditoria falhou após escrita", zona.fqdn, e));
  const alvo = depois ?? antes!;
  const verbo = { criar: "criado", alterar: "alterado", apagar: "apagado" }[operacao.acao];
  await registrarVersaoAtual(zona, ator, `Registro ${alvo.tipo} ${alvo.nome} ${verbo}`, () =>
    zonaDepoisDe(existentes, operacao, antes, depois),
  );
  return depois;
}

/** A zona esperada depois da operação, para quando o servidor não deixar reler. */
function zonaDepoisDe(
  existentes: RegistroDns[],
  operacao: OperacaoDns,
  antes: RegistroDns | null,
  depois: RegistroDns | null,
): RegistroDns[] {
  const sem = antes ? existentes.filter((r) => r.id !== antes.id) : existentes;
  return operacao.acao === "apagar" || !depois ? sem : [...sem, depois];
}

async function gravarVersao(
  domainAssetId: string,
  zona: string,
  registros: RegistroDns[],
  origem: OrigemEscritaDns | "SISTEMA",
  actorId: string | null,
  motivo: string,
) {
  const linhas = linhasDoTitular(registros, zona);
  return prisma.dnsZoneVersion.create({
    data: {
      domainAssetId,
      origin: origem,
      actorId,
      reason: motivo.slice(0, 300),
      records: JSON.parse(JSON.stringify(paraJsonDaVersao(linhas))),
      recordCount: linhas.length,
    },
  });
}

export const CHAVE_RETENCAO_VERSOES = "produto.dns.versoesRetencaoDias";

/**
 * Quantos dias uma versão fica guardada para este domínio, hoje. Nulo enquanto
 * o prazo não estiver confirmado: aí nada é descartado, e a tela diz isso.
 */
export async function retencaoDeVersoes(fqdn: string): Promise<number | null> {
  try {
    const prazo = await lerParametro(CHAVE_RETENCAO_VERSOES, { escopos: escoposDoDominio(fqdn) });
    return prazo.tipo === "vigente" && typeof prazo.valor === "number" ? prazo.valor : null;
  } catch (e) {
    console.error("[dns] falha ao ler o prazo de retenção de versões", fqdn, e);
    return null;
  }
}

/**
 * Descarta as versões mais velhas que o prazo de retenção. O prazo vem da
 * camada de parâmetros (`produto.dns.versoesRetencaoDias`), lido na data de
 * hoje e no escopo do domínio; enquanto ele estiver pendente de confirmação,
 * nada é descartado — pendente não decide.
 *
 * Roda logo depois de gravar uma versão, que por ser a mais nova nunca cai no
 * corte: a zona sempre tem para onde voltar. Falha aqui não desfaz a escrita no
 * DNS, que já aconteceu; só fica para a próxima.
 */
export async function descartarVersoesAntigas(domainAssetId: string, fqdn: string, agora = new Date()) {
  try {
    const prazo = await lerParametro(CHAVE_RETENCAO_VERSOES, { escopos: escoposDoDominio(fqdn), em: agora });
    if (prazo.tipo !== "vigente" || typeof prazo.valor !== "number") return 0;
    const corte = new Date(agora.getTime() - prazo.valor * 86_400_000);
    const { count } = await prisma.dnsZoneVersion.deleteMany({ where: { domainAssetId, createdAt: { lt: corte } } });
    if (count > 0) {
      await prisma.operationsAuditEvent.create({
        data: {
          action: "DNS_VERSOES_DESCARTADAS",
          entityType: "DomainAsset",
          entityId: domainAssetId,
          metadata: {
            quantidade: count,
            anterioresA: corte.toISOString(),
            parametro: { chave: CHAVE_RETENCAO_VERSOES, versao: prazo.versao.id, dias: prazo.valor },
          },
        },
      });
    }
    return count;
  } catch (e) {
    console.error("[dns] falha ao descartar versões antigas de", fqdn, e);
    return 0;
  }
}

/**
 * Antes da primeira escrita pelo painel, a zona como ela estava. Sem isso a
 * primeira versão já seria a zona com o erro, e não haveria para onde voltar.
 */
async function garantirRetratoInicial(domainAssetId: string, zona: string, existentes: RegistroDns[]) {
  const ja = await prisma.dnsZoneVersion.count({ where: { domainAssetId } });
  if (ja === 0) {
    await gravarVersao(domainAssetId, zona, existentes, "SISTEMA", null, "Zona antes da primeira alteração pelo painel");
  }
}

/**
 * Relê a zona e guarda como versão. Relida, não calculada: é a zona que o
 * servidor está servindo que se quer poder restaurar. Se a releitura falhar,
 * guarda o cálculo e diz isso no motivo.
 */
async function registrarVersaoAtual(
  zona: { id: string; fqdn: string; zonaId: string; provedor: { listar(zonaId: string): Promise<RegistroDns[]> } },
  ator: Ator,
  /**
   * O texto da versão. Como função, recebe o que foi relido: a restauração só
   * sabe se deu certo depois de comparar a zona relida com a versão, e o
   * motivo guardado não pode dizer "restaurada" quando não ficou.
   */
  motivo: string | ((registros: RegistroDns[], relida: boolean) => string),
  calculada: () => RegistroDns[],
): Promise<{ registros: RegistroDns[]; relida: boolean; guardada: boolean }> {
  // Reler e guardar são resultados separados: falha do banco ao guardar não
  // pode virar "o servidor não deixou reler", e vice-versa.
  let registros: RegistroDns[];
  let relida = true;
  try {
    registros = await zona.provedor.listar(zona.zonaId);
  } catch (e) {
    console.error("[dns] releitura após escrita falhou; versão calculada", zona.fqdn, e);
    registros = calculada();
    relida = false;
  }
  const base = typeof motivo === "function" ? motivo(registros, relida) : motivo;
  const texto = relida ? base : `${base} (calculada; o servidor não respondeu à releitura)`;
  try {
    await gravarVersao(zona.id, zona.fqdn, registros, ator.origem, ator.id, texto);
    await descartarVersoesAntigas(zona.id, zona.fqdn);
    return { registros, relida, guardada: true };
  } catch (e) {
    console.error("[dns] não foi possível gravar a versão da zona", zona.fqdn, e);
    return { registros, relida, guardada: false };
  }
}

export type VersaoDaZona = {
  id: string;
  criadaEm: string;
  origem: string;
  quem: string | null;
  motivo: string;
  linhas: ReturnType<typeof lerLinhas>;
};

export async function listarVersoes(domainAssetId: string, limite = 30): Promise<VersaoDaZona[]> {
  const versoes = await prisma.dnsZoneVersion.findMany({
    where: { domainAssetId },
    orderBy: { createdAt: "desc" },
    take: limite,
  });
  return versoes.map((v) => ({
    id: v.id,
    criadaEm: v.createdAt.toISOString(),
    origem: v.origin,
    quem: v.actorId,
    motivo: v.reason,
    linhas: lerLinhas(v.records),
  }));
}

const formatoQuando = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

/**
 * Volta a zona ao estado de uma versão.
 *
 * Aplica a diferença em três passos: tira o que não existia, ajusta TTL e
 * proxy, cria o que faltava. Tirar primeiro é o que deixa voltar um CNAME
 * para um nome que hoje tem A.
 *
 * A validação de registro não roda aqui: a versão é um estado em que a zona
 * já esteve e serviu, inclusive o retrato anterior ao painel, que pode ter
 * registro que a validação de hoje recusaria. Barrar a volta a ele seria
 * barrar justamente o desfazer.
 *
 * Se o servidor recusar no meio, para, grava a zona como ficou numa versão
 * própria e diz quanto foi aplicado. Zona pela metade sem registro é o pior
 * caso: ninguém saberia de onde partir.
 */
export async function restaurarVersaoDns(
  fqdn: string,
  versaoId: string,
  ator: Ator,
  escopo?: { organizationId: string },
): Promise<{ aplicadas: number }> {
  const zona = await resolverZonaDns(fqdn, escopo?.organizationId);
  const versao = await prisma.dnsZoneVersion.findFirst({ where: { id: versaoId, domainAssetId: zona.id } });
  if (!versao) throw new ErroDeDns("Versão não encontrada.", 404);

  let atual: RegistroDns[];
  try {
    atual = await zona.provedor.listar(zona.zonaId);
  } catch (e) {
    console.error("[dns] falha ao ler a zona antes de restaurar", zona.fqdn, e);
    throw new ErroDeDns("Não foi possível ler a zona agora. Nada foi alterado.", 502);
  }

  const alvo = lerLinhas(versao.records);
  const diferenca = diferencaParaVersao(atual, alvo, zona.fqdn);
  if (zonaIgual(diferenca)) throw new ErroDeDns("A zona já está igual a esta versão.", 409);

  for (const linha of [...diferenca.entrar, ...diferenca.ajustar.map((a) => a.alvo)]) {
    conferirParaServidor(zona.servico, paraEntrada(linha));
  }
  if (zona.servico === "AVILA") conferirTtlPorConjunto(alvo, zona.fqdn);

  await garantirRetratoInicial(zona.id, zona.fqdn, atual);

  const quando = formatoQuando.format(versao.createdAt);
  const total = diferenca.sair.length + diferenca.ajustar.length + diferenca.entrar.length;
  let aplicadas = 0;
  let falha: string | null = null;
  // O estado da zona passo a passo, para guardar a versão certa se o servidor
  // cair no meio e não deixar reler.
  let estado = [...atual];

  try {
    for (const registro of diferenca.sair) {
      await zona.provedor.remover(zona.zonaId, registro.id);
      estado = estado.filter((r) => r.id !== registro.id);
      aplicadas++;
      await limparEspelho(registro.id);
    }
    for (const { atual: registro, alvo: linha } of diferenca.ajustar) {
      const novo = await zona.provedor.atualizar(zona.zonaId, registro.id, paraEntrada(linha));
      estado = [...estado.filter((r) => r.id !== registro.id), novo];
      // No DNS da casa o TTL é do conjunto (nome + tipo): mudar o de uma
      // linha muda o de todas as irmãs, e o estado acompanhado tem de dizer isso.
      if (zona.servico === "AVILA") {
        const mesmoConjunto = (r: RegistroDns) =>
          r.tipo.toUpperCase() === novo.tipo.toUpperCase() &&
          r.nome.toLowerCase().replace(/\.$/, "") === novo.nome.toLowerCase().replace(/\.$/, "");
        estado = estado.map((r) => (mesmoConjunto(r) ? { ...r, ttl: novo.ttl } : r));
      }
      aplicadas++;
    }
    for (const linha of diferenca.entrar) {
      const novo = await zona.provedor.criar(zona.zonaId, paraEntrada(linha));
      estado = [...estado, novo];
      aplicadas++;
    }
  } catch (e) {
    console.error("[dns] restauração interrompida", zona.fqdn, versaoId, e);
    falha = e instanceof Error ? e.message.slice(0, 500) : "erro desconhecido";
  }

  const guardada = await registrarVersaoAtual(
    zona,
    ator,
    (registros, relida) => {
      // Mudança recusada por timeout pode ter sido aplicada do outro lado
      // antes de a resposta chegar. Sem releitura, o estado calculado conta
      // só o que o servidor confirmou, e a versão diz que é incerto.
      if (falha && !relida) {
        return `Restauração da versão de ${quando} interrompida (${aplicadas} de ${total} mudanças confirmadas; estado incerto: a mudança seguinte pode ter sido aplicada)`;
      }
      if (falha) return `Restauração da versão de ${quando} interrompida (${aplicadas} de ${total} mudanças)`;
      if (!relida) return `Restauração da versão de ${quando} aplicada sem conferência`;
      return zonaIgual(diferencaParaVersao(registros, alvo, zona.fqdn))
        ? `Restaurada a versão de ${quando}`
        : `Restauração da versão de ${quando} não conferiu: a zona mudou durante a restauração`;
    },
    () => estado,
  );

  // Todas as chamadas deram certo não quer dizer que a zona ficou igual à
  // versão: alguém pode ter mexido nela no meio. Só se diz "restaurada"
  // depois de conferir a zona relida contra a versão.
  let divergente = false;
  if (!falha && guardada.relida) {
    divergente = !zonaIgual(diferencaParaVersao(guardada.registros, alvo, zona.fqdn));
  }

  // Sem a releitura não dá para descartar que alguém mexeu na zona no meio:
  // aplicado e não conferido não é "restaurado".
  const naoConferida = !falha && !guardada.relida;
  const resultado = falha ? "INCOMPLETA" : divergente ? "DIVERGENTE" : naoConferida ? "NAO_CONFERIDA" : "OK";
  await prisma.operationsAuditEvent
    .create({
      data: {
        actorId: ator.id,
        organizationId: zona.organizationId,
        // Uma ação por desfecho: "interrompida" é quando o laço parou no meio;
        // não conferida e divergente são restaurações que rodaram inteiras.
        action: ACAO_RESTAURACAO[resultado],
        entityType: "DomainAsset",
        entityId: zona.id,
        metadata: JSON.parse(
          JSON.stringify({
            fqdn: zona.fqdn,
            origem: ator.origem,
            servico: zona.servico,
            versaoId,
            aplicadas,
            total,
            resultado,
            versaoGuardada: guardada.guardada,
            saiu: diferenca.sair.map(paraAuditoria),
            entrou: diferenca.entrar,
            ajustou: diferenca.ajustar.map((a) => ({ antes: paraAuditoria(a.atual), depois: a.alvo })),
            ...(falha ? { erro: falha } : {}),
          }),
        ),
      },
    })
    .catch((e) => console.error("[dns] auditoria da restauração falhou", zona.fqdn, e));

  const ondeFicou = guardada.guardada
    ? "A zona como ficou foi guardada como versão"
    : "Não foi possível guardar a zona como ficou";
  if (falha) {
    const incerto = guardada.relida ? "" : " Uma mudança pode ter sido aplicada sem confirmação.";
    throw new ErroDeDns(
      `A restauração parou em ${aplicadas} de ${total} mudanças confirmadas.${incerto} ${ondeFicou}; ` +
        (ator.origem === "EQUIPE" ? `o servidor respondeu: ${falha}` : "fale com o seu atendimento."),
      502,
    );
  }
  if (naoConferida) {
    throw new ErroDeDns(
      `As ${total} mudanças foram aplicadas, mas o servidor não deixou reler a zona para conferir se ela ficou igual à versão. ` +
        `${ondeFicou}. Confira a zona em alguns minutos.`,
      502,
    );
  }
  if (divergente) {
    throw new ErroDeDns(
      "As mudanças foram aplicadas, mas a zona mudou durante a restauração e não ficou igual à versão escolhida. " +
        `${ondeFicou}. Confira as versões e restaure de novo se for o caso.`,
      409,
    );
  }
  return { aplicadas };
}

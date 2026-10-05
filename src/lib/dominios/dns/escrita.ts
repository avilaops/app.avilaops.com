import { exigirDominio } from "@/lib/dominio";
import { cleanText } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { lerServicoDeDns, provedorDeDnsDoDominio, tipoDnsValido } from "@/lib/dominios/dns";
import type { EntradaRegistroDns, RegistroDns } from "@/lib/dominios/dns/tipos";
import { nomeCompleto, validarRegistroDns, type ProblemaDns } from "@/lib/dominios/dns/validacao";
import {
  diferencaParaVersao,
  lerLinhas,
  paraEntrada,
  linhasDoTitular,
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

  return { tipo, nome, conteudo, ttl, prioridade };
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

  if (operacao.acao !== "apagar") {
    // "www" e "@" viram o nome completo antes de sair. O serviço externo
    // completaria sozinho, o DNS da casa não: lá "www" viraria "www." e cairia
    // fora da zona.
    operacao.entrada = { ...operacao.entrada, nome: nomeCompleto(operacao.entrada.nome, zona.fqdn) };
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
      // O espelho no banco sai junto: deixar a linha órfã faria a tela mostrar
      // um registro que já não existe até a próxima sincronização.
      await prisma.dnsRecord.deleteMany({ where: { cloudflareRecordId: operacao.registroId } });
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
      records: JSON.parse(JSON.stringify(linhas)),
      recordCount: linhas.length,
    },
  });
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
  motivo: string,
  calculada: () => RegistroDns[],
): Promise<{ registros: RegistroDns[]; relida: boolean } | null> {
  let registros: RegistroDns[];
  let relida = true;
  let texto = motivo;
  try {
    registros = await zona.provedor.listar(zona.zonaId);
  } catch (e) {
    console.error("[dns] releitura após escrita falhou; versão calculada", zona.fqdn, e);
    registros = calculada();
    relida = false;
    texto = `${motivo} (calculada; o servidor não respondeu à releitura)`;
  }
  try {
    await gravarVersao(zona.id, zona.fqdn, registros, ator.origem, ator.id, texto);
    return { registros, relida };
  } catch (e) {
    console.error("[dns] não foi possível gravar a versão da zona", zona.fqdn, e);
    return null;
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
      await prisma.dnsRecord.deleteMany({ where: { cloudflareRecordId: registro.id } });
      estado = estado.filter((r) => r.id !== registro.id);
      aplicadas++;
    }
    for (const { atual: registro, alvo: linha } of diferenca.ajustar) {
      const novo = await zona.provedor.atualizar(zona.zonaId, registro.id, paraEntrada(linha));
      estado = [...estado.filter((r) => r.id !== registro.id), novo];
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
    falha
      ? `Restauração da versão de ${quando} interrompida (${aplicadas} de ${total} mudanças)`
      : `Restaurada a versão de ${quando}`,
    () => estado,
  );

  // Todas as chamadas deram certo não quer dizer que a zona ficou igual à
  // versão: alguém pode ter mexido nela no meio. Só se diz "restaurada"
  // depois de conferir a zona relida contra a versão.
  let divergente = false;
  if (!falha && guardada?.relida) {
    divergente = !zonaIgual(diferencaParaVersao(guardada.registros, alvo, zona.fqdn));
  }

  // Sem a releitura não dá para descartar que alguém mexeu na zona no meio:
  // aplicado e não conferido não é "restaurado".
  const naoConferida = !falha && !guardada?.relida;
  const resultado = falha ? "INCOMPLETA" : divergente ? "DIVERGENTE" : naoConferida ? "NAO_CONFERIDA" : "OK";
  await prisma.operationsAuditEvent
    .create({
      data: {
        actorId: ator.id,
        organizationId: zona.organizationId,
        action: resultado === "OK" ? "DNS_ZONA_RESTAURADA" : "DNS_ZONA_RESTAURADA_INCOMPLETA",
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
            versaoGuardada: Boolean(guardada),
            saiu: diferenca.sair.map(paraAuditoria),
            entrou: diferenca.entrar,
            ajustou: diferenca.ajustar.map((a) => ({ antes: paraAuditoria(a.atual), depois: a.alvo })),
            ...(falha ? { erro: falha } : {}),
          }),
        ),
      },
    })
    .catch((e) => console.error("[dns] auditoria da restauração falhou", zona.fqdn, e));

  const ondeFicou = guardada
    ? "A zona como ficou foi guardada como versão"
    : "Não foi possível guardar a zona como ficou";
  if (falha) {
    throw new ErroDeDns(
      `A restauração parou em ${aplicadas} de ${total} mudanças. ${ondeFicou}; ` +
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

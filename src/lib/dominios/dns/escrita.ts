import { exigirDominio } from "@/lib/dominio";
import { cleanText } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { lerServicoDeDns, provedorDeDnsDoDominio, tipoDnsValido } from "@/lib/dominios/dns";
import type { EntradaRegistroDns, RegistroDns } from "@/lib/dominios/dns/tipos";
import { nomeCompleto, validarRegistroDns, type ProblemaDns } from "@/lib/dominios/dns/validacao";

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

  const servico = lerServicoDeDns(dominio.dnsProvider);
  const provedor = provedorDeDnsDoDominio(dominio);
  if (!provedor) throw new ErroDeDns("Este domínio não tem DNS gerenciado por esta plataforma.", 409);
  if (!provedor.configurado()) throw new ErroDeDns("O serviço de DNS deste domínio não está conectado.", 503);

  const zonaId = servico === "AVILA" ? dominio.fqdn : dominio.cloudflareZoneId;
  if (!zonaId) throw new ErroDeDns("Este domínio não tem zona de DNS configurada.", 409);

  return { ...dominio, provedor, zonaId, servico };
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

  try {
    let depois: RegistroDns | null = null;
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
    await auditar("OK", depois);
    return depois;
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
}

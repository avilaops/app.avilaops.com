import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Arquivar e excluir cliente.
 *
 * Arquivar é o caminho normal: tira o cliente da lista padrão, é reversível e
 * não mexe em nada ligado a ele. Excluir apaga a linha e tudo que cascateia
 * dela (perfil, contatos, arquivos, marcas, projetos, assinaturas, faturas),
 * então só vale para cliente que nunca virou operação: cadastro de teste,
 * duplicado, lead que não fechou. Quem já tem dinheiro, domínio, acesso ao
 * portal ou marca no ar é arquivado, nunca apagado.
 */

export const STATUS_ARQUIVAVEIS = ["ACTIVE", "ONBOARDING", "PAUSED", "ARCHIVED"] as const;

export type Impedimento = { motivo: string; quantidade: number };

export class ClienteNaoEncontradoError extends Error {}

/** O que impede a exclusão definitiva. Lista vazia = pode excluir. */
export async function impedimentosDeExclusao(organizationId: string): Promise<Impedimento[]> {
  const [assinaturas, dominios, marcas, contas] = await Promise.all([
    prisma.subscription.count({ where: { organizationId } }),
    prisma.domainAsset.count({ where: { organizationId } }),
    prisma.brand.count({ where: { organizationId } }),
    prisma.adminIdentity.count({ where: { organizationId } }),
  ]);
  return [
    { motivo: assinaturas === 1 ? "assinatura (com histórico de cobrança)" : "assinaturas (com histórico de cobrança)", quantidade: assinaturas },
    { motivo: dominios === 1 ? "domínio" : "domínios", quantidade: dominios },
    { motivo: marcas === 1 ? "marca" : "marcas", quantidade: marcas },
    { motivo: contas === 1 ? "conta de acesso ao portal" : "contas de acesso ao portal", quantidade: contas },
  ].filter((item) => item.quantidade > 0);
}

export function descreverImpedimentos(lista: Impedimento[]): string {
  return lista.map((item) => `${item.quantidade} ${item.motivo}`).join(", ");
}

export async function mudarStatus(organizationId: string, status: string, actorId: string) {
  const atual = await prisma.organization.findUnique({ where: { id: organizationId }, select: { status: true } });
  if (!atual) throw new ClienteNaoEncontradoError();
  if (atual.status === status) return;
  await prisma.$transaction([
    prisma.organization.update({ where: { id: organizationId }, data: { status } }),
    prisma.operationsAuditEvent.create({
      data: {
        actorId,
        organizationId,
        action: status === "ARCHIVED" ? "ORGANIZATION_ARCHIVED" : "ORGANIZATION_STATUS_CHANGED",
        entityType: "Organization",
        entityId: organizationId,
        metadata: { de: atual.status, para: status },
      },
    }),
  ]);
}

export type ResultadoExclusao =
  | { ok: true }
  | { ok: false; motivo: "confirmacao" | "impedido" | "vinculado"; mensagem: string };

export async function excluirCliente(
  organizationId: string,
  confirmacao: string,
  actorId: string,
): Promise<ResultadoExclusao> {
  const cliente = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { id: true, name: true, clientNumber: true, cpfCnpj: true, legalName: true, slug: true, createdAt: true },
  });
  if (!cliente) throw new ClienteNaoEncontradoError();

  // Digitar o nome é o freio: um clique errado numa lista de dez mil linhas
  // não pode apagar cliente.
  if (confirmacao.trim().toLocaleLowerCase("pt-BR") !== cliente.name.trim().toLocaleLowerCase("pt-BR")) {
    return { ok: false, motivo: "confirmacao", mensagem: "O nome digitado não confere com o do cliente." };
  }

  const impedimentos = await impedimentosDeExclusao(organizationId);
  if (impedimentos.length > 0) {
    return {
      ok: false,
      motivo: "impedido",
      mensagem: `Este cliente tem ${descreverImpedimentos(impedimentos)}. Arquive em vez de excluir: o histórico continua valendo.`,
    };
  }

  try {
    await prisma.$transaction([
      // O evento guarda quem era o cliente: depois da exclusão é o único
      // registro de que ele existiu. `organization_id` fica preenchido de
      // propósito; a coluna não tem chave estrangeira e serve para achar o
      // evento pelo id antigo.
      prisma.operationsAuditEvent.create({
        data: {
          actorId,
          organizationId,
          action: "ORGANIZATION_DELETED",
          entityType: "Organization",
          entityId: organizationId,
          metadata: {
            nome: cliente.name,
            razaoSocial: cliente.legalName,
            numero: cliente.clientNumber,
            cpfCnpj: cliente.cpfCnpj,
            slug: cliente.slug,
            criadoEm: cliente.createdAt.toISOString(),
          },
        },
      }),
      prisma.organization.delete({ where: { id: organizationId } }),
    ]);
  } catch (erro) {
    // Tabelas fora do Prisma (o schema `core` em produção) recusam a exclusão
    // com RESTRICT. O banco está certo; a mensagem é que precisa ser humana.
    if (erro instanceof Prisma.PrismaClientKnownRequestError && ["P2003", "P2014"].includes(erro.code)) {
      return {
        ok: false,
        motivo: "vinculado",
        mensagem: "Há contratos, pagamentos ou acessos ligados a este cliente em outra parte do sistema. Arquive em vez de excluir.",
      };
    }
    throw erro;
  }
  return { ok: true };
}

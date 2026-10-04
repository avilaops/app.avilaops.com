import { prisma } from "@/lib/prisma";

/**
 * Nome de quem fez, para trilha e histórico na tela.
 *
 * Para o cliente (`mascararCasa`), gente da casa aparece como "Equipe Ávila
 * Ops": ele precisa saber que foi a Ávila, não quem dela. Para a equipe, o
 * nome de cada um.
 */
export async function nomesDosAtores(
  ids: Array<string | null | undefined>,
  opcoes: { mascararCasa: boolean },
): Promise<(id: string | null | undefined, padrao?: string) => string> {
  const unicos = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  const atores = unicos.length
    ? await prisma.adminIdentity.findMany({ where: { id: { in: unicos } }, select: { id: true, nome: true, role: true } })
    : [];
  const mapa = new Map(
    atores.map((a) => [
      a.id,
      opcoes.mascararCasa && (a.role === "OWNER" || a.role === "SOCIO") ? "Equipe Ávila Ops" : a.nome,
    ]),
  );
  return (id, padrao = "Equipe Ávila Ops") => (id && mapa.get(id)) || padrao;
}

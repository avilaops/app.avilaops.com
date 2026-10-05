import { NextResponse, type NextRequest } from "next/server";
import { ehDonoDoNegocio, getSessaoPortal } from "@/lib/auth";
import { sameOrigin } from "@/lib/http";
import { participaDaEmpresa } from "@/lib/nucleo/acesso";

/**
 * A porta das rotas do portal do cliente.
 *
 * A empresa vem sempre da sessão, nunca da URL ou do corpo. `administrar`
 * exige o dono do negócio (`ADMIN`) com participação que permita administrar;
 * sem ele, basta participação vigente — é o que deixa a equipe do cliente ler
 * o que é da empresa sem mexer.
 *
 * Devolve a resposta de erro pronta para a rota retornar, no mesmo formato
 * das outras rotas do portal.
 */
export async function exigirPortal(
  request: NextRequest,
  opcoes: { administrar: boolean; motivoSemPermissao?: string },
): Promise<
  | { erro: NextResponse; sessao?: undefined; organizationId?: undefined }
  | { erro?: undefined; sessao: { id: string; role: string }; organizationId: string }
> {
  const sessao = await getSessaoPortal();
  if (!sessao) return { erro: NextResponse.json({ error: "Não autorizado." }, { status: 401 }) };
  if (request.method !== "GET" && !sameOrigin(request)) {
    return { erro: NextResponse.json({ error: "Origem não autorizada." }, { status: 403 }) };
  }
  if (opcoes.administrar && !ehDonoDoNegocio(sessao.role)) {
    return {
      erro: NextResponse.json(
        { error: opcoes.motivoSemPermissao ?? "Só o responsável pela empresa faz isto." },
        { status: 403 },
      ),
    };
  }
  if (!sessao.organizationId) {
    return { erro: NextResponse.json({ error: "Sua conta ainda não está ligada a uma empresa." }, { status: 409 }) };
  }
  if (!(await participaDaEmpresa(sessao.id, sessao.organizationId, opcoes.administrar))) {
    return {
      erro: NextResponse.json({ error: "Sua participação não permite esta ação nesta empresa." }, { status: 403 }),
    };
  }
  return { sessao, organizationId: sessao.organizationId };
}

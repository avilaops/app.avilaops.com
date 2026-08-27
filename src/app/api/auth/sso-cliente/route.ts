import { NextRequest, NextResponse } from "next/server";
import { destinoPorPapel } from "@/lib/auth";
import { lerSessaoCliente, urlLoginCliente } from "@/lib/sso";

export const runtime = "nodejs";

/**
 * Retorno do login de cliente pelo Google.
 *
 * É o `returnTo` que o `entrar.avilaops.com` usa. O cookie `avila_cliente` já
 * chega junto (é de `.avilaops.com`), então aqui só confirmamos que ele é
 * válido e mandamos a pessoa para a área dela.
 *
 * Não emitimos sessão local: o cookie do `entrar` já é a sessão, e
 * `getSessaoPortal()` sabe lê-lo. Criar uma segunda sessão aqui significaria
 * ter duas fontes de verdade para o mesmo login.
 */
export async function GET(req: NextRequest) {
  const sessao = await lerSessaoCliente();

  // Sem cookie válido: manda buscar um.
  if (!sessao) return NextResponse.redirect(urlLoginCliente());

  // O `entrar` só emite CLIENTE — mas conferir aqui custa nada e fecha a porta
  // caso aquele serviço mude no futuro.
  const destino = destinoPorPapel(sessao.papel === "ADMIN" ? "ADMIN" : "CLIENT");

  // `destinoPorPapel` devolve caminho relativo para a equipe e URL absoluta
  // para o cliente, enquanto a área dele estiver noutro subdomínio.
  return NextResponse.redirect(
    destino.startsWith("http") ? destino : new URL(destino, req.url).toString(),
  );
}

import { NextRequest, NextResponse } from "next/server";
import { ehDono, getAdmin } from "@/lib/auth";
import { origemEstrita } from "@/lib/http";
import {
  IconeInvalido,
  TAMANHO_MAXIMO_ICONE,
  iconeDaCasa,
  removerIconeDaCasa,
  salvarIconeDaCasa,
} from "@/lib/identidade-casa";

export const runtime = "nodejs";

/**
 * O ícone da casa: servir, trocar e remover.
 *
 * Servir é para qualquer sessão de admin, porque o ícone aparece no cabeçalho
 * de toda tela logada. Trocar e remover são do dono — é a marca do painel
 * inteiro, não uma preferência de quem está olhando.
 */
export async function GET() {
  const admin = await getAdmin();
  if (!admin) return new NextResponse(null, { status: 404 });

  const icone = await iconeDaCasa();
  if (!icone) return new NextResponse(null, { status: 404 });

  return new NextResponse(new Uint8Array(icone.dados), {
    headers: {
      "content-type": icone.mime,
      // Pode cachear à vontade: a URL carrega a versão do conteúdo, então uma
      // troca de ícone muda o endereço e o navegador busca o novo sozinho.
      "cache-control": "private, max-age=31536000, immutable",
      // O navegador não deve adivinhar o tipo do que serve do nosso domínio.
      "x-content-type-options": "nosniff",
    },
  });
}

export async function POST(request: NextRequest) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  if (!ehDono(admin.role)) {
    return NextResponse.json({ erro: "Só o dono da conta pode isto." }, { status: 403 });
  }
  if (!origemEstrita(request)) {
    return NextResponse.json({ erro: "Origem não autorizada." }, { status: 403 });
  }

  const formulario = await request.formData().catch(() => null);
  const arquivo = formulario?.get("icone");

  if (!(arquivo instanceof File)) {
    return NextResponse.json({ erro: "Escolha um arquivo de imagem." }, { status: 400 });
  }
  // A conferência pelo tamanho declarado evita carregar na memória um arquivo
  // que já se sabe grande demais.
  if (arquivo.size > TAMANHO_MAXIMO_ICONE) {
    return NextResponse.json({ erro: "O ícone precisa ter no máximo 512 KB." }, { status: 400 });
  }

  try {
    const dados = Buffer.from(await arquivo.arrayBuffer());
    const salvo = await salvarIconeDaCasa({
      dados,
      mimeDeclarado: arquivo.type,
      atorId: admin.id,
    });
    return NextResponse.json({ ok: true, ...salvo });
  } catch (erro) {
    if (erro instanceof IconeInvalido) {
      return NextResponse.json({ erro: erro.message }, { status: 400 });
    }
    return NextResponse.json({ erro: "Não consegui guardar o ícone." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  if (!ehDono(admin.role)) {
    return NextResponse.json({ erro: "Só o dono da conta pode isto." }, { status: 403 });
  }
  if (!origemEstrita(request)) {
    return NextResponse.json({ erro: "Origem não autorizada." }, { status: 403 });
  }

  await removerIconeDaCasa(admin.id);
  return NextResponse.json({ ok: true });
}

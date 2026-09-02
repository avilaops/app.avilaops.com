import { NextRequest, NextResponse } from "next/server";
import { verifyServiceJwt, isServiceCall } from "@/lib/service-auth";
import { cleanText } from "@/lib/http";
import { contratar, ContratacaoInvalida } from "@/lib/contratacao";
import { EmailRecuperacaoInvalido } from "@/lib/email-recuperacao";

export const runtime = "nodejs";

/**
 * Contratação por autoatendimento, chamada pelo produto.
 *
 * Quem chama é o **servidor** do produto (a plataforma de lojas, o webmail, o
 * Comandeiro), nunca o navegador do cliente: a chamada carrega credencial de
 * serviço, e credencial não vai para dentro de página pública. O produto
 * mantém a tela com a cara dele e delega aqui a parte que precisa ser uma só
 * na casa inteira: conta, assinatura, fatura e cobrança.
 *
 * Devolve senha provisória apenas quando a conta nasceu nesta chamada, para o
 * produto mostrar ao cliente na hora. Ela não é guardada nem reenviada: quem
 * perder usa "esqueci minha senha".
 *
 * `emailRecuperacao` é obrigatório e precisa estar fora dos domínios que a
 * casa hospeda. É o que faz o "esqueci minha senha" acima funcionar de fato:
 * sem ele o link chega na caixa profissional que a pessoa não abre. Produto
 * que não envia recebe 400 com o motivo, para a tela dele pedir o campo.
 */
export async function POST(request: NextRequest) {
  const porJwt = verifyServiceJwt(request);
  if (!porJwt && !isServiceCall(request)) {
    return NextResponse.json({ ok: false, erro: "unauthorized" }, { status: 401 });
  }

  let corpo: Record<string, unknown>;
  try {
    corpo = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, erro: "invalid_json" }, { status: 400 });
  }

  try {
    const resultado = await contratar({
      produto: cleanText(corpo.produto, 20),
      tenant: cleanText(corpo.tenant, 120),
      plano: cleanText(corpo.plano, 80),
      empresa: cleanText(corpo.empresa, 200),
      responsavel: cleanText(corpo.responsavel, 200),
      email: cleanText(corpo.email, 200),
      emailRecuperacao: cleanText(corpo.emailRecuperacao, 200),
      telefone: cleanText(corpo.telefone, 40) || null,
      cpfCnpj: cleanText(corpo.cpfCnpj, 20) || null,
    });

    return NextResponse.json({ ok: true, ...resultado });
  } catch (erro) {
    if (erro instanceof ContratacaoInvalida || erro instanceof EmailRecuperacaoInvalido) {
      return NextResponse.json({ ok: false, erro: erro.message }, { status: 400 });
    }
    console.error("[contratar] falhou", erro);
    return NextResponse.json(
      { ok: false, erro: "Não consegui concluir a contratação agora." },
      { status: 500 },
    );
  }
}

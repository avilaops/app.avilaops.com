import { NextRequest, NextResponse } from "next/server";
import { ehDono, getAdmin } from "@/lib/auth";
import {
  DadosInvalidos,
  removerCertificadoDaCasa,
  salvarCertificadoDaCasa,
} from "@/lib/dados-da-casa";
import { pedirConfirmacao, temConfirmacaoRecente } from "@/lib/confirmacao-recente";
import { origemEstrita } from "@/lib/http";

export const runtime = "nodejs";

/** Certificado A1 de verdade tem 3 a 10 KB; 100 KB já é folga de sobra. */
const TAMANHO_MAXIMO = 100 * 1024;

async function exigirDono(request: NextRequest) {
  const admin = await getAdmin();
  if (!admin) return { erro: NextResponse.json({ erro: "Não autorizado." }, { status: 401 }) };
  if (!ehDono(admin.role)) {
    return { erro: NextResponse.json({ erro: "Só o dono da conta pode isto." }, { status: 403 }) };
  }
  if (!origemEstrita(request)) {
    return { erro: NextResponse.json({ erro: "Origem não autorizada." }, { status: 403 }) };
  }
  // Trocar ou tirar o certificado é trocar quem assina a nota: pede a senha
  // de novo, mesmo com a sessão aberta.
  if (!(await temConfirmacaoRecente(admin.id))) return { erro: pedirConfirmacao() };
  return { admin };
}

/**
 * Recebe o .pfx e a senha da casa. O arquivo é lido com a senha antes de ser
 * guardado — senha errada volta como erro, não como cofre que não abre.
 */
export async function POST(request: NextRequest) {
  const { admin, erro } = await exigirDono(request);
  if (erro) return erro;

  const formulario = await request.formData().catch(() => null);
  const arquivo = formulario?.get("certificado");
  const senha = formulario?.get("senha");

  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return NextResponse.json({ erro: "Escolha o arquivo .pfx ou .p12." }, { status: 400 });
  }
  if (arquivo.size > TAMANHO_MAXIMO) {
    return NextResponse.json({ erro: "Arquivo grande demais para um certificado A1." }, { status: 400 });
  }
  if (typeof senha !== "string" || !senha) {
    return NextResponse.json({ erro: "Informe a senha do certificado." }, { status: 400 });
  }

  try {
    const info = await salvarCertificadoDaCasa({
      pfx: Buffer.from(await arquivo.arrayBuffer()),
      senha,
      atorId: admin.id,
    });
    return NextResponse.json({ ok: true, info });
  } catch (falha) {
    const mensagem = falha instanceof Error ? falha.message : "";
    // Erro de leitura é do arquivo ou da senha: volta ao usuário com a
    // mensagem do leitor, que distingue os dois casos.
    if (falha instanceof DadosInvalidos || /certificado|senha|pfx/i.test(mensagem)) {
      return NextResponse.json({ erro: mensagem }, { status: 400 });
    }
    console.error("Falha ao guardar certificado da casa:", falha);
    return NextResponse.json({ erro: "Não consegui guardar o certificado." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const { admin, erro } = await exigirDono(request);
  if (erro) return erro;

  await removerCertificadoDaCasa(admin.id);
  return NextResponse.json({ ok: true });
}

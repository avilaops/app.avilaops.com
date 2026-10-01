import { NextRequest, NextResponse } from "next/server";
import { extractText, getDocumentProxy } from "unpdf";
import { getAdmin } from "@/lib/auth";
import { sameOrigin } from "@/lib/http";
import { camposPreenchidos, lerFichaCadastral } from "@/lib/ficha-cadastral";

// Ficha cadastral é uma ou duas páginas; 5 MB cobre PDF com logo e assinatura
// escaneada e barra quem mandou o arquivo errado antes de abrir.
const TAMANHO_MAX = 5 * 1024 * 1024;
const PAGINAS_MAX = 10;

/**
 * Lê a ficha cadastral em PDF e devolve os campos reconhecidos.
 *
 * O arquivo não é gravado em lugar nenhum: é lido em memória, vira texto e é
 * descartado. Quem chamou recebe os campos para pré-preencher o formulário e
 * decide o que salva.
 */
export async function POST(request: NextRequest) {
  const admin = await getAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  }
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });
  }

  const form = await request.formData().catch(() => null);
  const arquivo = form?.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size <= 0) {
    return NextResponse.json({ error: "Envie a ficha em PDF." }, { status: 400 });
  }
  if (arquivo.size > TAMANHO_MAX) {
    return NextResponse.json({ error: "A ficha passa de 5 MB." }, { status: 413 });
  }

  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  // O tipo informado pelo navegador vem do nome do arquivo; quem diz se é PDF
  // é a assinatura no começo do conteúdo.
  if (new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-") {
    return NextResponse.json({ error: "O arquivo não é um PDF." }, { status: 415 });
  }

  let texto: string;
  try {
    const pdf = await getDocumentProxy(bytes);
    if (pdf.numPages > PAGINAS_MAX) {
      return NextResponse.json(
        { error: `A ficha tem ${pdf.numPages} páginas; o limite é ${PAGINAS_MAX}.` },
        { status: 413 },
      );
    }
    const resultado = await extractText(pdf, { mergePages: true });
    texto = resultado.text;
  } catch {
    return NextResponse.json(
      { error: "Não foi possível abrir o PDF. Ele pode estar protegido por senha ou corrompido." },
      { status: 422 },
    );
  }

  if (!texto.trim()) {
    return NextResponse.json(
      {
        error:
          "O PDF não tem texto selecionável (parece escaneado ou foto). Preencha o cadastro à mão ou peça a ficha gerada pelo computador.",
      },
      { status: 422 },
    );
  }

  const ficha = lerFichaCadastral(texto);
  const campos = camposPreenchidos(ficha);
  if (campos.length === 0) {
    return NextResponse.json(
      {
        error:
          "Nenhum campo reconhecido. A leitura procura rótulos como \"Razão Social:\", \"CNPJ:\" e \"Endereço:\".",
      },
      { status: 422 },
    );
  }

  return NextResponse.json({ ficha, campos });
}

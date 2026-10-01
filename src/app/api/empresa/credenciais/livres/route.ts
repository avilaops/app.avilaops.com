import { NextRequest, NextResponse } from "next/server";
import { ehDono, getAdmin } from "@/lib/auth";
import { removerCredencial, salvarCredencial } from "@/lib/credenciais";
import {
  PREFIXO_LIVRE,
  aceitaCampoLivre,
  chaveLivre,
  slugDaInstituicao,
} from "@/lib/credenciais-financeiro";
import { sameOrigin } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * Campo livre de banco: o dono nomeia, o cofre cifra, nenhum código lê.
 *
 * A porta do catálogo (`/api/empresa/credenciais`) recusa chave fora da lista,
 * e continua recusando. Esta só escreve chaves com o prefixo `BANCO_`, que
 * nenhuma integração lê — então não há como, por aqui, sobrescrever o token
 * do Mercado Pago com um valor digitado no lugar errado.
 */
async function exigirDono(request: NextRequest) {
  const admin = await getAdmin();
  if (!admin) return { erro: NextResponse.json({ erro: "Não autorizado." }, { status: 401 }) };
  if (!ehDono(admin.role)) {
    return { erro: NextResponse.json({ erro: "Só o dono da conta pode isto." }, { status: 403 }) };
  }
  if (!sameOrigin(request)) {
    return { erro: NextResponse.json({ erro: "Origem não autorizada." }, { status: 403 }) };
  }
  return { admin };
}

export async function POST(request: NextRequest) {
  const { admin, erro } = await exigirDono(request);
  if (erro) return erro;

  const corpo = (await request.json().catch(() => null)) as
    | { instituicao?: unknown; rotulo?: unknown; valor?: unknown }
    | null;
  const instituicao = typeof corpo?.instituicao === "string" ? corpo.instituicao.trim() : "";
  const rotulo = typeof corpo?.rotulo === "string" ? corpo.rotulo.trim() : "";
  const valor = typeof corpo?.valor === "string" ? corpo.valor.trim() : "";

  if (!instituicao || instituicao.length > 60) {
    return NextResponse.json({ erro: "Informe o nome da instituição (até 60 caracteres)." }, { status: 400 });
  }
  if (!rotulo || rotulo.length > 60) {
    return NextResponse.json({ erro: "Informe o nome do campo (até 60 caracteres)." }, { status: 400 });
  }
  if (!valor) {
    return NextResponse.json({ erro: "Informe o valor." }, { status: 400 });
  }
  if (!aceitaCampoLivre(instituicao)) {
    return NextResponse.json(
      { erro: `${instituicao} tem ficha própria, com os campos que o código lê. Preencha por lá.` },
      { status: 400 },
    );
  }

  let chave: string;
  try {
    chave = chaveLivre(instituicao, rotulo);
  } catch (falha) {
    return NextResponse.json({ erro: (falha as Error).message }, { status: 400 });
  }

  // Nomes diferentes podem cair na mesma chave depois de normalizados e
  // cortados ("Conta corrente PJ" e "Conta-corrente PJ"). Sobrescrever em
  // silêncio apagaria o valor do outro campo: recusa e pede outro nome.
  const existente = await prisma.platformCredential.findUnique({
    where: { chave },
    select: { grupo: true, rotulo: true },
  });
  if (
    existente &&
    (slugDaInstituicao(existente.grupo ?? "") !== slugDaInstituicao(instituicao) ||
      (existente.rotulo ?? "").trim().toLowerCase() !== rotulo.toLowerCase())
  ) {
    return NextResponse.json(
      { erro: `Já existe um campo "${existente.rotulo}" em ${existente.grupo} com nome equivalente. Use outro nome.` },
      { status: 409 },
    );
  }

  await salvarCredencial(
    {
      chave,
      valor,
      categoria: "bancos",
      grupo: instituicao,
      rotulo,
      descricao: `Cadastrado à mão em ${instituicao}. Nenhum código lê esta chave.`,
      origem: `tela:empresa/credenciais/${slugDaInstituicao(instituicao)}`,
      segredo: true,
    },
    admin.id,
  );

  await prisma.operationsAuditEvent.create({
    data: {
      actorId: admin.id,
      action: "CREDENCIAL_BANCO_LIVRE_GUARDADA",
      entityType: "PlatformCredential",
      entityId: chave,
      metadata: { instituicao, rotulo },
    },
  });

  return NextResponse.json({ ok: true, chave, slug: slugDaInstituicao(instituicao) });
}

export async function DELETE(request: NextRequest) {
  const { admin, erro } = await exigirDono(request);
  if (erro) return erro;

  const chave = request.nextUrl.searchParams.get("chave") ?? "";
  if (!chave.startsWith(PREFIXO_LIVRE)) {
    return NextResponse.json({ erro: "Só campo cadastrado à mão sai por aqui." }, { status: 400 });
  }

  try {
    await removerCredencial(chave);
  } catch {
    return NextResponse.json({ erro: "Campo não encontrado." }, { status: 404 });
  }

  await prisma.operationsAuditEvent.create({
    data: {
      actorId: admin.id,
      action: "CREDENCIAL_BANCO_LIVRE_REMOVIDA",
      entityType: "PlatformCredential",
      entityId: chave,
    },
  });

  return NextResponse.json({ ok: true });
}

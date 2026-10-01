import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import { sameOrigin } from "@/lib/http";
import { publicacaoSchema } from "@/lib/publicacoes/contratos";
import { ConflitoPublicacao, criarRascunho, listarPublicacoes } from "@/lib/publicacoes/repositorio";

export async function GET() {
  if(!await getAdmin()) return NextResponse.json({error:"Acesso não autorizado."},{status:401});
  return NextResponse.json(await listarPublicacoes());
}
export async function POST(req:NextRequest) {
  const admin=await getAdmin();
  if(!admin) return NextResponse.json({error:"Acesso não autorizado."},{status:401});
  if(!sameOrigin(req)) return NextResponse.json({error:"Origem não autorizada."},{status:403});
  const dados=publicacaoSchema.safeParse(await req.json().catch(()=>null));
  if(!dados.success) return NextResponse.json({error:dados.error.issues.map(i=>i.message).join(" ")},{status:400});
  try { return NextResponse.json({post:await criarRascunho(dados.data,admin.email)},{status:201}); }
  catch(e) { if(e instanceof ConflitoPublicacao) return NextResponse.json({error:e.message},{status:409}); throw e; }
}

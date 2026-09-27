import { NextRequest,NextResponse } from "next/server";
import { z } from "zod";
import { getAdmin } from "@/lib/auth";
import { sameOrigin } from "@/lib/http";
import { publicacaoSchema } from "@/lib/publicacoes/contratos";
import { alterarPublicacao,ConflitoPublicacao } from "@/lib/publicacoes/repositorio";
const entrada=z.object({versao:z.number().int().positive(),acao:z.enum(["editar","agendar","cancelar"]),dados:publicacaoSchema.optional()});
export async function PATCH(req:NextRequest,{params}:{params:Promise<{id:string}>}) {
  const admin=await getAdmin();
  if(!admin) return NextResponse.json({error:"Acesso não autorizado."},{status:401});
  if(!sameOrigin(req)) return NextResponse.json({error:"Origem não autorizada."},{status:403});
  const {id}=await params;
  const dados=entrada.safeParse(await req.json().catch(()=>null));
  if(!z.uuid().safeParse(id).success || !dados.success) return NextResponse.json({error:"Dados inválidos."},{status:400});
  try { await alterarPublicacao(id,dados.data.versao,dados.data.acao,admin.email,dados.data.dados); return NextResponse.json({ok:true}); }
  catch(e) { if(e instanceof ConflitoPublicacao) return NextResponse.json({error:e.message},{status:409}); throw e; }
}

import { NextRequest,NextResponse } from "next/server";
import { z } from "zod";
import { getAdmin,ehDono } from "@/lib/auth";
import { sameOrigin } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { conferirPublicacao,FalhaProvedor } from "@/lib/publicacoes/provedores";
import { reconciliarEntrega,repetirEntrega,ConflitoPublicacao,type Entrega } from "@/lib/publicacoes/repositorio";
const entrada=z.discriminatedUnion("acao",[z.object({acao:z.literal("conferir"),idExterno:z.string().trim().min(1).max(100)}),z.object({acao:z.literal("repetir"),motivo:z.string().trim().min(10).max(1000)})]);
export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}) {
  const admin=await getAdmin();
  if(!admin) return NextResponse.json({error:"Acesso não autorizado."},{status:401});
  if(!ehDono(admin.role)||!sameOrigin(req)) return NextResponse.json({error:"Acesso não autorizado."},{status:403});
  const {id}=await params;
  const dados=entrada.safeParse(await req.json().catch(()=>null));
  if(!z.uuid().safeParse(id).success||!dados.success) return NextResponse.json({error:"Dados inválidos."},{status:400});
  try {
    if(dados.data.acao==="repetir") await repetirEntrega(id,admin.email,dados.data.motivo);
    else {
      const [d]=await prisma.$queryRaw<Entrega[]>`SELECT * FROM operations.social_deliveries WHERE id=${id}::uuid`;
      if(!d||!["RECONCILIAR","QUARENTENA"].includes(d.estado)) throw new ConflitoPublicacao("Entrega não disponível para conferência.");
      const r=await conferirPublicacao(d,dados.data.idExterno);
      await reconciliarEntrega(id,r.id,r.url,admin.email);
    }
    return NextResponse.json({ok:true});
  } catch(e) {
    if(e instanceof ConflitoPublicacao || e instanceof FalhaProvedor) return NextResponse.json({error:e.message},{status:409});
    throw e;
  }
}

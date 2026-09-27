import { NextRequest,NextResponse } from "next/server";
import { getAdmin,ehDono } from "@/lib/auth";
import { sameOrigin } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { destinoSchema } from "@/lib/publicacoes/contratos";
import { verificarDestino,FalhaProvedor } from "@/lib/publicacoes/provedores";
export async function POST(req:NextRequest) {
  const admin=await getAdmin();
  if(!admin) return NextResponse.json({error:"Acesso não autorizado."},{status:401});
  if(!ehDono(admin.role) || !sameOrigin(req)) return NextResponse.json({error:"Apenas o dono pode configurar conexões."},{status:403});
  const dados=destinoSchema.safeParse(await req.json().catch(()=>null));
  if(!dados.success) return NextResponse.json({error:"Informe perfil, canal, ID e referência SOCIAL_*_TOKEN do cofre."},{status:400});
  const d=dados.data;
  const perfis=await prisma.$queryRaw<{id:string}[]>`SELECT id FROM operations.social_profiles WHERE id=${d.perfilId}::uuid`;
  if(!perfis.length) return NextResponse.json({error:"Perfil não encontrado."},{status:404});
  try { if(d.ativo) await verificarDestino({...d,perfil_id:d.perfilId}); }
  catch(e) { if(e instanceof FalhaProvedor) return NextResponse.json({error:e.codigo},{status:422}); throw e; }
  await prisma.$executeRaw`INSERT INTO operations.social_destinations(perfil_id,canal,identificador,credencial,ativo)
    VALUES(${d.perfilId}::uuid,${d.canal},${d.identificador},${d.credencial},${d.ativo})
    ON CONFLICT(perfil_id,canal) DO UPDATE SET identificador=EXCLUDED.identificador,credencial=EXCLUDED.credencial,ativo=EXCLUDED.ativo`;
  return NextResponse.json({ok:true});
}

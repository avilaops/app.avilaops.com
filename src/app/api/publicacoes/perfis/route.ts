import { NextRequest,NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import { sameOrigin } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { perfilSchema } from "@/lib/publicacoes/contratos";
export async function POST(req:NextRequest) {
  const admin=await getAdmin();
  if(!admin) return NextResponse.json({error:"Acesso não autorizado."},{status:401});
  if(!sameOrigin(req)) return NextResponse.json({error:"Origem não autorizada."},{status:403});
  const dados=perfilSchema.safeParse(await req.json().catch(()=>null));
  if(!dados.success) return NextResponse.json({error:"Informe nome e empresa."},{status:400});
  const empresa=await prisma.organization.findFirst({where:{id:dados.data.organizationId,status:{not:"ARCHIVED"}},select:{id:true}});
  if(!empresa) return NextResponse.json({error:"Empresa não encontrada."},{status:400});
  const perfis=await prisma.$queryRaw<{id:string}[]>`INSERT INTO operations.social_profiles(nome,organization_id) VALUES(${dados.data.nome},${empresa.id}) ON CONFLICT(organization_id,nome) DO UPDATE SET nome=EXCLUDED.nome RETURNING id`;
  return NextResponse.json({perfil:perfis[0]},{status:201});
}

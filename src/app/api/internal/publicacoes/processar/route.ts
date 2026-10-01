import { timingSafeEqual } from "node:crypto";
import { NextRequest,NextResponse } from "next/server";
import { processarFila } from "@/lib/publicacoes/worker";
export const runtime="nodejs";
export async function POST(req:NextRequest) {
  const segredo=process.env.SOCIAL_WORKER_TOKEN;
  const recebido=req.headers.get("authorization")?.replace(/^Bearer /,"") || "";
  if(!segredo || Buffer.byteLength(recebido)!==Buffer.byteLength(segredo) || !timingSafeEqual(Buffer.from(recebido),Buffer.from(segredo))) return NextResponse.json({error:"Acesso não autorizado."},{status:401});
  return NextResponse.json(await processarFila());
}

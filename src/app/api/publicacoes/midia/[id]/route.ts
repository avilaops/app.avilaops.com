import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { NextRequest,NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { caminhoDoRender,mimeDoNome } from "@/lib/estudio-storage";
import { validarAssinatura } from "@/lib/publicacoes/midia";
export const runtime="nodejs";
export async function GET(req:NextRequest,{params}:{params:Promise<{id:string}>}) {
  const {id}=await params;
  if(!/^[a-z0-9]{1,80}$/.test(id)||!validarAssinatura(id,req.nextUrl.searchParams.get("expira"),req.nextUrl.searchParams.get("assinatura"))) return new NextResponse(null,{status:403});
  const render=await prisma.studioRender.findUnique({where:{id},select:{status:true,fileName:true}});
  const caminho=render?.status==="DONE" && render.fileName?caminhoDoRender(render.fileName):null;
  if(!caminho) return new NextResponse(null,{status:404});
  const info=await stat(caminho).catch(()=>null);
  if(!info?.isFile() || !info.size) return new NextResponse(null,{status:404});
  let inicio=0,fim=info.size-1,status=200;
  const range=req.headers.get("range");
  if(range) {
    const m=/^bytes=(\d*)-(\d*)$/.exec(range);
    if(!m||(!m[1]&&!m[2])) return new NextResponse(null,{status:416});
    if(m[1]) inicio=Number(m[1]);
    if(m[2]) fim=Math.min(Number(m[2]),fim);
    if(!m[1]&&m[2]) {inicio=Math.max(0,info.size-Number(m[2]));fim=info.size-1;}
    if(inicio>fim||inicio>=info.size) return new NextResponse(null,{status:416,headers:{"Content-Range":`bytes */${info.size}`}});
    status=206;
  }
  const headers:Record<string,string>={"Content-Type":mimeDoNome(render!.fileName!),"Content-Length":String(fim-inicio+1),"Accept-Ranges":"bytes","Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"};
  if(status===206)headers["Content-Range"]=`bytes ${inicio}-${fim}/${info.size}`;
  return new NextResponse(Readable.toWeb(createReadStream(caminho,{start:inicio,end:fim})) as ReadableStream,{status,headers});
}

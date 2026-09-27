import { createHmac,timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { NovaPublicacao } from "./contratos";
import type { Prisma } from "@prisma/client";

function segredo() {
  const chave=process.env.SOCIAL_MEDIA_SIGNING_KEY;
  if(!chave || chave.length<32) throw new Error("SOCIAL_MEDIA_SIGNING_KEY_AUSENTE");
  return chave;
}
function assinatura(id:string,expira:number) {
  return createHmac("sha256",segredo()).update(`social-render:${id}:${expira}`).digest("hex");
}
export function assinarMidia(id:string,agora=Date.now()) {
  const expira=Math.floor(agora/1000)+3600;
  const base=new URL(process.env.APP_URL || "https://app.avilaops.com");
  if(base.protocol!=="https:") throw new Error("APP_URL_EXIGE_HTTPS");
  const url=new URL(`/api/publicacoes/midia/${id}`,base);
  url.searchParams.set("expira",String(expira));url.searchParams.set("assinatura",assinatura(id,expira));
  return url.toString();
}
export function validarAssinatura(id:string,expira:string|null,valor:string|null,agora=Date.now()) {
  if(!expira || !/^\d+$/.test(expira) || !valor || !/^[a-f0-9]{64}$/.test(valor)) return false;
  const tempo=Number(expira);
  if(tempo<Math.floor(agora/1000) || tempo>Math.floor(agora/1000)+3600) return false;
  try {return timingSafeEqual(Buffer.from(valor,"hex"),Buffer.from(assinatura(id,tempo),"hex"));} catch{return false;}
}
export async function validarRender(dados:NovaPublicacao,organizationId:string,db:Prisma.TransactionClient=prisma) {
  if(!dados.renderId) return;
  const render=await db.studioRender.findUnique({where:{id:dados.renderId},include:{piece:{select:{organizationId:true}}}});
  if(!render || render.status!=="DONE" || !render.fileName || render.kind!==dados.tipo || render.piece.organizationId!==organizationId) throw new Error("Escolha um resultado concluído do Estúdio, do mesmo formato e da mesma empresa do perfil.");
}

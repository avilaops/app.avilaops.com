import { obterCredencial } from "@/lib/credenciais";
import { metaGraphVersion,tokenParaPublicacaoMeta } from "@/lib/meta";
import { prisma } from "@/lib/prisma";
import { createHmac } from "node:crypto";
import type { Destino, Entrega, Post } from "./repositorio";

export class FalhaProvedor extends Error {
  constructor(public codigo: string, public ambigua = false, public transitoria = false) { super(codigo); }
}
export type Requisicao = (url: string, token: string, corpo?: URLSearchParams, efeito?: boolean) => Promise<Record<string, unknown>>;
export const requisitar: Requisicao = async (url, token, corpo, efeito = Boolean(corpo)) => {
  const alvo=new URL(url);
  if(alvo.hostname==="graph.facebook.com") {
    const segredo=await obterCredencial("META_APP_SECRET");
    if(segredo)alvo.searchParams.set("appsecret_proof",createHmac("sha256",segredo).update(token).digest("hex"));
  }
  let resposta: Response;
  try {
    resposta=await fetch(alvo,{method:corpo?"POST":"GET",headers:{Authorization:`Bearer ${token}`,"User-Agent":"avilaops-hub-social/1.0"},body:corpo,signal:AbortSignal.timeout(25000),redirect:"error",cache:"no-store"});
  } catch { throw new FalhaProvedor("SEM_RESPOSTA",efeito,!efeito); }
  if(!resposta.ok) {
    // 5xx depois de um POST não prova que o provedor recusou a publicação.
    throw new FalhaProvedor(`HTTP_${resposta.status}`,efeito && resposta.status>=500,resposta.status===429 || (!efeito && resposta.status>=500));
  }
  try { return await resposta.json(); } catch { throw new FalhaProvedor("RESPOSTA_INVALIDA",efeito,!efeito); }
};

async function tokenDoDestino(d: Pick<Destino,"canal"|"identificador"|"credencial"|"perfil_id">) {
  if(d.credencial!=="META_EMPRESA") return obterCredencial(d.credencial);
  if(!["instagram","facebook"].includes(d.canal)) throw new FalhaProvedor("CONEXAO_META_INCOMPATIVEL");
  const [perfil]=await prisma.$queryRaw<{organization_id:string}[]>`SELECT organization_id FROM operations.social_profiles WHERE id=${d.perfil_id}::uuid`;
  if(!perfil)throw new FalhaProvedor("PERFIL_AUSENTE");
  try {return await tokenParaPublicacaoMeta(perfil.organization_id,d.canal as "instagram"|"facebook",d.identificador);} catch {throw new FalhaProvedor("CONEXAO_META_SEM_ACESSO_AO_DESTINO");}
}

export async function verificarDestino(d: Pick<Destino,"canal"|"identificador"|"credencial"|"perfil_id">) {
  if(d.canal==="tiktok") throw new FalhaProvedor("TIKTOK_REQUER_INTEGRACAO_APROVADA");
  if(d.canal==="whatsapp") throw new FalhaProvedor("WHATSAPP_REQUER_DESTINO_SUPORTADO");
  const token=await tokenDoDestino(d);
  if(!token) throw new FalhaProvedor("CREDENCIAL_AUSENTE");
  if(d.canal==="reddit") {
    if(!/^[A-Za-z0-9_]{3,21}$/.test(d.identificador)) throw new FalhaProvedor("SUBREDDIT_INVALIDO");
    await requisitar("https://oauth.reddit.com/api/v1/me",token);
    const dados=await requisitar(`https://oauth.reddit.com/r/${d.identificador}/about`,token);
    const info=dados.data as {display_name?:string}|undefined;
    if(info?.display_name?.toLowerCase()!==d.identificador.toLowerCase()) throw new FalhaProvedor("DESTINO_NAO_CONFIRMADO");
  } else {
    if(!/^\d+$/.test(d.identificador)) throw new FalhaProvedor("ID_META_INVALIDO");
    const info=await requisitar(`https://graph.facebook.com/${await metaGraphVersion()}/${d.identificador}?fields=id`,token);
    if(String(info.id)!==d.identificador) throw new FalhaProvedor("DESTINO_NAO_CONFIRMADO");
  }
}

export async function conferirPublicacao(d: Entrega, id: string) {
  const token=await tokenDoDestino(d.destino);
  if(!token) throw new FalhaProvedor("CREDENCIAL_AUSENTE");
  if(d.canal==="instagram") {
    if(!/^\d+$/.test(id)) throw new FalhaProvedor("ID_INVALIDO");
    const base=`https://graph.facebook.com/${await metaGraphVersion()}/${d.destino.identificador}/media`;
    let cursor="";
    for(let pagina=0;pagina<10;pagina++) {
      const dados=await requisitar(`${base}?fields=id,permalink&limit=100${cursor?`&after=${encodeURIComponent(cursor)}`:""}`,token);
      const medias=dados.data as {id:string;permalink?:string}[] | undefined;
      const encontrada=medias?.find(m=>m.id===id);
      if(encontrada) return {id,url:encontrada.permalink || null};
      const paging=dados.paging as {next?:string;cursors?:{after?:string}}|undefined;
      if(!paging?.next || !paging.cursors?.after) break;
      cursor=paging.cursors.after;
    }
  } else if(d.canal==="facebook") {
    if(!/^\d+(?:_\d+)?$/.test(id)) throw new FalhaProvedor("ID_INVALIDO");
    const dados=await requisitar(`https://graph.facebook.com/${await metaGraphVersion()}/${id}?fields=id,from,permalink_url`,token);
    if((dados.from as {id?:string}|undefined)?.id===d.destino.identificador) return {id:String(dados.id),url:typeof dados.permalink_url==="string"?dados.permalink_url:null};
  } else if(d.canal==="reddit") {
    if(!/^t3_[a-z0-9]+$/.test(id)) throw new FalhaProvedor("ID_INVALIDO");
    const dados=await requisitar(`https://oauth.reddit.com/api/info?id=${id}`,token);
    const info=(dados.data as {children?:{data:{name?:string;subreddit?:string;permalink?:string}}[]}|undefined)?.children?.[0]?.data;
    if(info?.name===id && info.subreddit?.toLowerCase()===d.destino.identificador.toLowerCase()) return {id,url:info.permalink?.startsWith("/r/")?`https://www.reddit.com${info.permalink}`:null};
  }
  throw new FalhaProvedor("PUBLICACAO_NAO_CONFIRMADA_NESTE_DESTINO");
}

export async function publicar(post: Post, d: Entrega, checkpoint: (valor: Record<string,string>)=>Promise<void>, op: {request?:Requisicao;token?:string;versao?:string}={}) {
  const destino=d.destino;
  if(!destino.ativo || destino.canal!==d.canal) throw new FalhaProvedor("DESTINO_DESABILITADO");
  if(d.canal==="tiktok") throw new FalhaProvedor("TIKTOK_REQUER_INTEGRACAO_APROVADA");
  if(d.canal==="whatsapp") throw new FalhaProvedor("WHATSAPP_REQUER_DESTINO_SUPORTADO");
  const token=op.token || await tokenDoDestino(destino);
  if(!token) throw new FalhaProvedor("CREDENCIAL_AUSENTE");
  const request=op.request || requisitar;
  const p=post.conteudo;
  if(d.canal==="reddit") {
    if(!["text","link"].includes(p.tipo)) throw new FalhaProvedor("REDDIT_MIDIA_NATIVA_REQUER_UPLOAD");
    if(!/^[A-Za-z0-9_]{3,21}$/.test(destino.identificador)) throw new FalhaProvedor("SUBREDDIT_INVALIDO");
    const corpo=new URLSearchParams({api_type:"json",sr:destino.identificador,title:p.titulo,kind:p.tipo==="text"?"self":"link",resubmit:"false"});
    corpo.set(p.tipo==="text"?"text":"url",p.tipo==="text"?p.texto:p.midiaUrl!);
    const resposta=await request("https://oauth.reddit.com/api/submit",token,corpo);
    const json=resposta.json as {errors?:unknown[];data?:{name?:string;url?:string}}|undefined;
    if(json?.errors?.length) throw new FalhaProvedor("REDDIT_RECUSOU_CONTEUDO");
    if(!json?.data?.name) throw new FalhaProvedor("REDDIT_SEM_CONFIRMACAO",true);
    return {id:json.data.name,url:json.data.url || null};
  }
  if(!/^\d+$/.test(destino.identificador)) throw new FalhaProvedor("ID_META_INVALIDO");
  const base=`https://graph.facebook.com/${op.versao || await metaGraphVersion()}`;
  if(d.canal==="instagram") {
    if(!["image","video"].includes(p.tipo)) throw new FalhaProvedor("INSTAGRAM_EXIGE_MIDIA");
    let container=d.checkpoint.container;
    if(!container) {
      const corpo=new URLSearchParams({caption:p.texto});
      if(p.tipo==="image") corpo.set("image_url",p.midiaUrl!);
      else { corpo.set("video_url",p.midiaUrl!); corpo.set("media_type","REELS"); }
      const resposta=await request(`${base}/${destino.identificador}/media`,token,corpo,false);
      if(!resposta.id) throw new FalhaProvedor("INSTAGRAM_SEM_CONTAINER",false,true);
      container=String(resposta.id);
      await checkpoint({container});
    }
    const status=await request(`${base}/${container}?fields=status_code`,token);
    if(status.status_code==="ERROR" || status.status_code==="EXPIRED") throw new FalhaProvedor("INSTAGRAM_CONTAINER_INVALIDO");
    if(status.status_code!=="FINISHED") throw new FalhaProvedor("INSTAGRAM_PROCESSANDO",false,true);
    const resposta=await request(`${base}/${destino.identificador}/media_publish`,token,new URLSearchParams({creation_id:container}));
    if(!resposta.id) throw new FalhaProvedor("INSTAGRAM_SEM_CONFIRMACAO",true);
    // Salvar o id antes de buscar o permalink; uma falha na leitura não deve repetir o POST.
    await checkpoint({idPublicado:String(resposta.id)});
    let url: string|null=null;
    try { const dados=await request(`${base}/${resposta.id}?fields=permalink`,token); url=typeof dados.permalink==="string"?dados.permalink:null; } catch { /* ID externo já confirmado. */ }
    return {id:String(resposta.id),url};
  }
  if(d.canal==="facebook") {
    if(p.tipo==="video") throw new FalhaProvedor("FACEBOOK_VIDEO_REQUER_PROCESSAMENTO");
    const corpo=new URLSearchParams({message:p.texto});
    const endpoint=p.tipo==="image"?"photos":"feed";
    if(p.tipo==="image") { corpo.set("url",p.midiaUrl!); corpo.set("published","true"); }
    if(p.tipo==="link") corpo.set("link",p.midiaUrl!);
    const resposta=await request(`${base}/${destino.identificador}/${endpoint}`,token,corpo);
    const id=resposta.post_id || resposta.id;
    if(!id) throw new FalhaProvedor("FACEBOOK_SEM_CONFIRMACAO",true);
    return {id:String(id),url:`https://www.facebook.com/${encodeURIComponent(String(id))}`};
  }
  throw new FalhaProvedor("CANAL_DESCONHECIDO");
}

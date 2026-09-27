import { describe,it,expect,vi } from "vitest";
vi.mock("@/lib/credenciais",()=>({obterCredencial:vi.fn()}));
vi.mock("@/lib/meta",()=>({metaGraphVersion:vi.fn(()=>"v25.0")}));
import { classificarFalha,publicacaoSchema,impedimentoDoCanal } from "@/lib/publicacoes/contratos";
import { publicar,requisitar,FalhaProvedor,type Requisicao } from "@/lib/publicacoes/provedores";
import type { Post,Entrega } from "@/lib/publicacoes/repositorio";
const payload={perfilId:"d6c74c65-4840-4113-8399-c804cddc9ca1",chave:"4370b568-5435-413b-ad3c-82d57fd146a1",titulo:"Teste",texto:"Linha 1\nLinha 2",tipo:"image" as const,midiaUrl:"https://example.com/meme.jpg",canais:["instagram" as const],opcionais:[],agendadoEm:"2026-09-28T11:00:00-03:00"};
const post:Post={id:"post",perfil_id:payload.perfilId,conteudo:payload,agendado_em:new Date(payload.agendadoEm),estado:"PROCESSANDO",versao:2};
const entrega={canal:"instagram",checkpoint:{},destino:{ativo:true,canal:"instagram",identificador:"123",credencial:"SOCIAL_CHEF_INSTAGRAM_TOKEN"}} as Entrega;
describe("publicação editorial",()=>{
  it("preserva legenda multilinha e exige fuso, mídia e canal obrigatório",()=>{
    expect(publicacaoSchema.parse(payload).texto).toBe("Linha 1\nLinha 2");
    expect(publicacaoSchema.safeParse({...payload,agendadoEm:"2026-09-28"}).success).toBe(false);
    expect(publicacaoSchema.safeParse({...payload,midiaUrl:null}).success).toBe(false);
    expect(publicacaoSchema.safeParse({...payload,opcionais:["instagram"]}).success).toBe(false);
    expect(publicacaoSchema.safeParse({...payload,canais:["instagram","instagram"]}).success).toBe(false);
  });
  it("não tenta automaticamente após resultado ambíguo",()=>{
    expect(classificarFalha(true,true,1)).toBe("RECONCILIAR");
    expect(classificarFalha(false,true,4)).toBe("REPETIR");
    expect(classificarFalha(false,true,5)).toBe("QUARENTENA");
    expect(impedimentoDoCanal("tiktok","video")).toMatch(/aprovada/);
  });
  it("Instagram cria container, consulta processamento e publica na segunda etapa",async()=>{
    const request=vi.fn<Requisicao>().mockResolvedValueOnce({id:"container"}).mockResolvedValueOnce({status_code:"FINISHED"}).mockResolvedValueOnce({id:"media"}).mockResolvedValueOnce({permalink:"https://www.instagram.com/p/test/"});
    const checkpoint=vi.fn();
    const resultado=await publicar(post,entrega,checkpoint,{request,token:"teste",versao:"v25.0"});
    expect(request.mock.calls.map(c=>new URL(c[0]).pathname)).toEqual(["/v25.0/123/media","/v25.0/container","/v25.0/123/media_publish","/v25.0/media"]);
    expect(request.mock.calls[2][2]?.get("creation_id")).toBe("container");
    expect(checkpoint).toHaveBeenCalledWith({container:"container"});
    expect(checkpoint).toHaveBeenCalledWith({idPublicado:"media"});
    expect(resultado.id).toBe("media");
  });
  it("processamento pendente reaproveita o container sem publicar",async()=>{
    const request=vi.fn<Requisicao>().mockResolvedValue({status_code:"IN_PROGRESS"});
    await expect(publicar(post,{...entrega,checkpoint:{container:"existente"}},vi.fn(),{request,token:"t",versao:"v25.0"})).rejects.toMatchObject({codigo:"INSTAGRAM_PROCESSANDO",ambigua:false,transitoria:true});
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("falha ao buscar permalink não desfaz publicação confirmada",async()=>{
    const request=vi.fn<Requisicao>().mockResolvedValueOnce({status_code:"FINISHED"}).mockResolvedValueOnce({id:"confirmado"}).mockRejectedValueOnce(new Error("timeout"));
    expect(await publicar(post,{...entrega,checkpoint:{container:"existente"}},vi.fn(),{request,token:"t",versao:"v25.0"})).toEqual({id:"confirmado",url:null});
  });
  it("Reddit usa self para texto e rejeita erros de negócio HTTP 200",async()=>{
    const request=vi.fn<Requisicao>().mockResolvedValue({json:{errors:[["RATELIMIT"]]}});
    await expect(publicar({...post,conteudo:{...payload,tipo:"text"}}, {...entrega,canal:"reddit",destino:{...entrega.destino,canal:"reddit",identificador:"ChefConfuso"}},vi.fn(),{request,token:"t"})).rejects.toBeInstanceOf(FalhaProvedor);
    expect(request.mock.calls[0][2]?.get("kind")).toBe("self");
    expect(request.mock.calls[0][2]?.get("text")).toBe(payload.texto);
  });
  it("transportes classificam timeout e 5xx de escrita como ambíguos",async()=>{
    const fetch=vi.spyOn(globalThis,"fetch").mockRejectedValueOnce(new Error("timeout"));
    try {
      await expect(requisitar("https://example.com","t",new URLSearchParams())).rejects.toMatchObject({codigo:"SEM_RESPOSTA",ambigua:true});
      fetch.mockResolvedValueOnce(new Response("",{status:503}));
      await expect(requisitar("https://example.com","t",new URLSearchParams())).rejects.toMatchObject({ambigua:true});
      fetch.mockResolvedValueOnce(new Response("",{status:429}));
      await expect(requisitar("https://example.com","t",new URLSearchParams())).rejects.toMatchObject({ambigua:false,transitoria:true});
    } finally {fetch.mockRestore();}
  });
});

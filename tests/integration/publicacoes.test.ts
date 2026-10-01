import { randomUUID } from "node:crypto";
import { beforeAll,afterAll,describe,it,expect } from "vitest";
import { prisma } from "@/lib/prisma";
import { criarRascunho,alterarPublicacao,reservarEntrega,concluirEntrega,falharEntrega,recuperarReservas } from "@/lib/publicacoes/repositorio";
import type { NovaPublicacao } from "@/lib/publicacoes/contratos";

// A suite exige o Postgres descartável validado por tests/setup.ts.
const empresaId=`publicacoes-teste-${randomUUID()}`;
let perfilId:string;
const ids:string[]=[];
const dados=():NovaPublicacao=>({chave:randomUUID(),perfilId,titulo:"Teste integração",texto:"Uma legenda\ncom duas linhas",tipo:"image",midiaUrl:"https://example.com/test.jpg",canais:["instagram","facebook"],opcionais:[],agendadoEm:"2020-01-01T00:00:00Z"});
beforeAll(async()=>{
  await prisma.organization.create({data:{id:empresaId,name:"Empresa de teste publicações",slug:empresaId}});
  const [p]=await prisma.$queryRaw<{id:string}[]>`INSERT INTO operations.social_profiles(organization_id,nome) VALUES(${empresaId},'Perfil de teste') RETURNING id`;
  perfilId=p.id;
  for(const canal of ["instagram","facebook"]) await prisma.$executeRaw`INSERT INTO operations.social_destinations(perfil_id,canal,identificador,credencial,ativo) VALUES(${perfilId}::uuid,${canal},'123','SOCIAL_TEST_TOKEN',true)`;
});
afterAll(async()=>{
  for(const id of ids) {
    await prisma.$executeRaw`DELETE FROM operations.social_events WHERE post_id=${id}::uuid`;
    await prisma.$executeRaw`DELETE FROM operations.social_deliveries WHERE post_id=${id}::uuid`;
    await prisma.$executeRaw`DELETE FROM operations.social_posts WHERE id=${id}::uuid`;
  }
  if(perfilId) {
    await prisma.$executeRaw`DELETE FROM operations.social_destinations WHERE perfil_id=${perfilId}::uuid`;
    await prisma.$executeRaw`DELETE FROM operations.social_profiles WHERE id=${perfilId}::uuid`;
  }
  await prisma.organization.deleteMany({where:{id:empresaId}});
});
describe("fila persistente de publicações",()=>{
  it("criação concorrente é idempotente e fechamento exige todos os canais",async()=>{
    const entrada=dados();
    const posts=await Promise.all(Array.from({length:5},()=>criarRascunho(entrada,"teste")));
    ids.push(posts[0].id);
    expect(new Set(posts.map(p=>p.id)).size).toBe(1);
    await alterarPublicacao(posts[0].id,1,"agendar","teste");
    const claims=(await Promise.all(Array.from({length:6},()=>reservarEntrega()))).filter(x=>x!==null);
    // SKIP LOCKED pode devolver vazio enquanto outra transação segura o post.
    for(let i=0;i<2;i++) {const extra=await reservarEntrega();if(extra)claims.push(extra);}
    expect(claims).toHaveLength(2);
    expect(new Set(claims.map(x=>x.entrega.id)).size).toBe(2);
    await concluirEntrega(claims[0].entrega,"externo-1",null);
    let [p]=await prisma.$queryRaw<{estado:string}[]>`SELECT estado FROM operations.social_posts WHERE id=${posts[0].id}::uuid`;
    expect(p.estado).toBe("PROCESSANDO");
    await concluirEntrega(claims[1].entrega,"externo-2",null);
    [p]=await prisma.$queryRaw<{estado:string}[]>`SELECT estado FROM operations.social_posts WHERE id=${posts[0].id}::uuid`;
    expect(p.estado).toBe("PUBLICADO");
    expect(await reservarEntrega()).toBeNull();
    await expect(criarRascunho({...entrada,texto:"alterado"},"teste")).rejects.toThrow(/outro conteúdo/);
  });
  it("conclusões simultâneas consolidam o post e a reserva expirada não republica",async()=>{
    const p=await criarRascunho(dados(),"teste");ids.push(p.id);
    await alterarPublicacao(p.id,1,"agendar","teste");
    const a=await reservarEntrega(),b=await reservarEntrega();
    expect(a).not.toBeNull();expect(b).not.toBeNull();
    await Promise.all([concluirEntrega(a!.entrega,"a",null),concluirEntrega(b!.entrega,"b",null)]);
    const [resultado]=await prisma.$queryRaw<{estado:string}[]>`SELECT estado FROM operations.social_posts WHERE id=${p.id}::uuid`;
    expect(resultado.estado).toBe("PUBLICADO");
    const proximo=await criarRascunho({...dados(),canais:["instagram"]},"teste");ids.push(proximo.id);
    await alterarPublicacao(proximo.id,1,"agendar","teste");
    const item=await reservarEntrega();
    await prisma.$executeRaw`UPDATE operations.social_deliveries SET reserva_ate=now()-interval '1 second' WHERE id=${item!.entrega.id}::uuid`;
    expect(await recuperarReservas()).toBe(1);
    await expect(concluirEntrega(item!.entrega,"tardio",null)).rejects.toThrow("RESERVA_PERDIDA");
    expect(await reservarEntrega()).toBeNull();
  });
  it("rejeita edição concorrente e cancelamento após tentativa",async()=>{
    const p=await criarRascunho({...dados(),canais:["instagram"]},"teste");ids.push(p.id);
    await alterarPublicacao(p.id,1,"editar","teste",{...dados(),perfilId,canais:["instagram"]});
    await expect(alterarPublicacao(p.id,1,"agendar","teste")).rejects.toThrow(/alterada/);
    await alterarPublicacao(p.id,2,"agendar","teste");
    const item=await reservarEntrega();
    await falharEntrega(item!.entrega,"TIMEOUT",true,true);
    await expect(alterarPublicacao(p.id,3,"cancelar","teste")).rejects.toThrow(/iniciou/);
    expect(await reservarEntrega()).toBeNull();
  });
});

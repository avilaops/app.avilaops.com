import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { classificarFalha, impedimentoDoCanal, type NovaPublicacao } from "./contratos";
import { validarRender } from "./midia";

type Banco = Prisma.TransactionClient;
export type Perfil = { id: string; nome: string; organization_id: string; empresa: string };
export type Destino = { perfil_id: string; canal: string; identificador: string; credencial: string; ativo: boolean };
export type Post = { id: string; perfil_id: string; conteudo: NovaPublicacao; agendado_em: Date; estado: string; versao: number };
export type Entrega = { id: string; post_id: string; canal: string; destino: Destino; reserva: string; tentativa: number; checkpoint: Record<string,string>; estado: string; id_externo: string | null; url_publicada: string | null; ultimo_erro: string | null };
export class ConflitoPublicacao extends Error {}

async function evento(db: Banco, postId: string, nome: string, autor: string, detalhe = {}, entregaId: string | null = null) {
  await db.$executeRaw`INSERT INTO operations.social_events(post_id,entrega_id,evento,autor,detalhe)
    VALUES(${postId}::uuid,${entregaId}::uuid,${nome},${autor},${JSON.stringify(detalhe)}::jsonb)`;
}
export async function listarPublicacoes() {
  const [perfis, destinos, posts, renders] = await Promise.all([
    prisma.$queryRaw<Perfil[]>`SELECT p.*,o.name AS empresa FROM operations.social_profiles p JOIN operations.organizations o ON o.id=p.organization_id ORDER BY p.nome`,
    prisma.$queryRaw<Destino[]>`SELECT * FROM operations.social_destinations ORDER BY perfil_id,canal`,
    prisma.$queryRaw<(Post & {entregas: Entrega[]})[]>`SELECT p.*,COALESCE((SELECT jsonb_agg(jsonb_build_object('id',d.id,'canal',d.canal,'estado',d.estado,'tentativa',d.tentativa,'id_externo',d.id_externo,'url_publicada',d.url_publicada,'ultimo_erro',d.ultimo_erro)) FROM operations.social_deliveries d WHERE d.post_id=p.id),'[]'::jsonb) AS entregas FROM operations.social_posts p ORDER BY p.agendado_em DESC LIMIT 200`,
    prisma.studioRender.findMany({where:{status:"DONE",fileName:{not:null},piece:{organizationId:{not:null}}},select:{id:true,kind:true,piece:{select:{title:true,organizationId:true}}},orderBy:{createdAt:"desc"},take:100}),
  ]);
  return {perfis,destinos,posts,renders};
}
export async function criarRascunho(dados: NovaPublicacao, autor: string) {
  return prisma.$transaction(async db => {
    const perfis = await db.$queryRaw<Perfil[]>`SELECT * FROM operations.social_profiles WHERE id=${dados.perfilId}::uuid`;
    if (!perfis.length) throw new ConflitoPublicacao("Perfil não encontrado.");
    try {await validarRender(dados,perfis[0].organization_id,db);} catch(e) {throw new ConflitoPublicacao((e as Error).message);}
    const criado = await db.$queryRaw<Post[]>`INSERT INTO operations.social_posts(chave,perfil_id,conteudo,agendado_em,criado_por)
      VALUES(${dados.chave}::uuid,${dados.perfilId}::uuid,${JSON.stringify(dados)}::jsonb,${new Date(dados.agendadoEm)},${autor})
      ON CONFLICT(chave) DO NOTHING RETURNING *`;
    if (criado.length) { await evento(db,criado[0].id,"RASCUNHO_CRIADO",autor); return criado[0]; }
    const [existente] = await db.$queryRaw<Post[]>`SELECT * FROM operations.social_posts WHERE chave=${dados.chave}::uuid`;
    // jsonb não preserva ordem de chaves. Compara os objetos por equivalência no Postgres.
    const [igual] = await db.$queryRaw<{ok:boolean}[]>`SELECT conteudo=${JSON.stringify(dados)}::jsonb AS ok FROM operations.social_posts WHERE id=${existente.id}::uuid`;
    if (!igual.ok) throw new ConflitoPublicacao("Esta chave já pertence a outro conteúdo.");
    return existente;
  });
}
export async function alterarPublicacao(id: string, versao: number, acao: string, autor: string, dados?: NovaPublicacao) {
  return prisma.$transaction(async db => {
    const [post] = await db.$queryRaw<Post[]>`SELECT * FROM operations.social_posts WHERE id=${id}::uuid FOR UPDATE`;
    if (!post || post.versao!==versao) throw new ConflitoPublicacao("Publicação alterada ou inexistente. Atualize a tela.");
    if (acao==="editar") {
      if (post.estado!=="RASCUNHO" || !dados || dados.perfilId!==post.perfil_id) throw new ConflitoPublicacao("Somente rascunhos do mesmo perfil podem ser editados.");
      const [perfil]=await db.$queryRaw<Perfil[]>`SELECT * FROM operations.social_profiles WHERE id=${post.perfil_id}::uuid`;
      try {await validarRender(dados,perfil.organization_id,db);} catch(e) {throw new ConflitoPublicacao((e as Error).message);}
      await db.$executeRaw`UPDATE operations.social_posts SET conteudo=${JSON.stringify(dados)}::jsonb,agendado_em=${new Date(dados.agendadoEm)},versao=versao+1 WHERE id=${id}::uuid`;
    } else if (acao==="agendar") {
      if (post.estado!=="RASCUNHO") throw new ConflitoPublicacao("Somente rascunhos podem ser aprovados.");
      const destinos = await db.$queryRaw<Destino[]>`SELECT * FROM operations.social_destinations WHERE perfil_id=${post.perfil_id}::uuid AND ativo FOR SHARE`;
      for (const canal of post.conteudo.canais) {
        const impedimento=impedimentoDoCanal(canal,post.conteudo.tipo);
        if(impedimento) throw new ConflitoPublicacao(impedimento);
        const destino=destinos.find(d=>d.canal===canal);
        if (!destino) throw new ConflitoPublicacao(`Conecte e habilite ${canal} neste perfil antes de aprovar.`);
        await db.$executeRaw`INSERT INTO operations.social_deliveries(post_id,canal,obrigatorio,destino)
          VALUES(${id}::uuid,${canal},${!post.conteudo.opcionais.includes(canal)},${JSON.stringify(destino)}::jsonb)`;
      }
      await db.$executeRaw`UPDATE operations.social_posts SET estado='AGENDADO',versao=versao+1 WHERE id=${id}::uuid`;
    } else if (acao==="cancelar") {
      const enviadas = await db.$queryRaw<{id:string}[]>`SELECT id FROM operations.social_deliveries WHERE post_id=${id}::uuid AND tentativa>0 LIMIT 1`;
      if (enviadas.length || !["RASCUNHO","AGENDADO"].includes(post.estado)) throw new ConflitoPublicacao("A publicação já iniciou entregas. Confira os resultados por canal.");
      await db.$executeRaw`UPDATE operations.social_deliveries SET estado='CANCELADO' WHERE post_id=${id}::uuid`;
      await db.$executeRaw`UPDATE operations.social_posts SET estado='CANCELADO',versao=versao+1 WHERE id=${id}::uuid`;
    } else throw new ConflitoPublicacao("Ação desconhecida.");
    await evento(db,id,acao.toUpperCase(),autor);
  });
}
export async function reservarEntrega() {
  return prisma.$transaction(async db => {
    // Trava o post antes da entrega: cancelar/aprovar usa a mesma ordem.
    const [post] = await db.$queryRaw<Post[]>`SELECT p.* FROM operations.social_posts p WHERE p.estado IN ('AGENDADO','PROCESSANDO','PUBLICADO') AND p.agendado_em<=now()
      AND EXISTS(SELECT 1 FROM operations.social_deliveries d WHERE d.post_id=p.id AND d.estado IN ('PENDENTE','REPETIR') AND d.proxima_em<=now())
      ORDER BY p.agendado_em FOR UPDATE SKIP LOCKED LIMIT 1`;
    if (!post) return null;
    const [d] = await db.$queryRaw<Entrega[]>`SELECT * FROM operations.social_deliveries WHERE post_id=${post.id}::uuid AND estado IN ('PENDENTE','REPETIR') AND proxima_em<=now() ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1`;
    if (!d) return null;
    const [entrega] = await db.$queryRaw<Entrega[]>`UPDATE operations.social_deliveries SET estado='PROCESSANDO',tentativa=tentativa+1,reserva=${randomUUID()}::uuid,reserva_ate=now()+interval '5 minutes' WHERE id=${d.id}::uuid RETURNING *`;
    await db.$executeRaw`UPDATE operations.social_posts SET estado='PROCESSANDO' WHERE id=${post.id}::uuid AND estado='AGENDADO'`;
    await evento(db,post.id,"ENTREGA_RESERVADA","worker",{tentativa:entrega.tentativa},entrega.id);
    return {post,entrega};
  });
}
export async function salvarCheckpoint(d: Entrega, checkpoint: Record<string,string>) {
  const total=await prisma.$executeRaw`UPDATE operations.social_deliveries SET checkpoint=checkpoint || ${JSON.stringify(checkpoint)}::jsonb,reserva_ate=now()+interval '5 minutes' WHERE id=${d.id}::uuid AND reserva=${d.reserva}::uuid AND estado='PROCESSANDO' AND reserva_ate>now()`;
  if (!total) throw new Error("RESERVA_PERDIDA");
  d.checkpoint={...d.checkpoint,...checkpoint};
}
export async function concluirEntrega(d: Entrega, idExterno: string, url: string | null) {
  if (!idExterno) throw new Error("SEM_IDENTIFICADOR_EXTERNO");
  return prisma.$transaction(async db => {
    await db.$queryRaw`SELECT id FROM operations.social_posts WHERE id=${d.post_id}::uuid FOR UPDATE`;
    const total=await db.$executeRaw`UPDATE operations.social_deliveries SET estado='PUBLICADO',id_externo=${idExterno},url_publicada=${url},publicado_em=now(),reserva=NULL,reserva_ate=NULL,ultimo_erro=NULL
      WHERE id=${d.id}::uuid AND reserva=${d.reserva}::uuid AND estado='PROCESSANDO' AND reserva_ate>now()`;
    if (!total) throw new Error("RESERVA_PERDIDA");
    await db.$executeRaw`UPDATE operations.social_posts SET estado='PUBLICADO',publicado_em=COALESCE(publicado_em,now()) WHERE id=${d.post_id}::uuid AND NOT EXISTS(SELECT 1 FROM operations.social_deliveries WHERE post_id=${d.post_id}::uuid AND obrigatorio AND estado<>'PUBLICADO')`;
    await evento(db,d.post_id,"ENTREGA_PUBLICADA","worker",{idExterno},d.id);
  });
}
export async function falharEntrega(d: Entrega, codigo: string, ambigua: boolean, transitoria: boolean) {
  const estado=classificarFalha(ambigua,transitoria,d.tentativa);
  return prisma.$transaction(async db => {
    const n=await db.$executeRaw`UPDATE operations.social_deliveries SET estado=${estado},ultimo_erro=${codigo},reserva=NULL,reserva_ate=NULL,proxima_em=now()+(${Math.min(3600,30*2**d.tentativa)} * interval '1 second')
      WHERE id=${d.id}::uuid AND reserva=${d.reserva}::uuid AND estado='PROCESSANDO'`;
    if(n) await evento(db,d.post_id,estado,"worker",{codigo},d.id);
  });
}
export async function recuperarReservas() {
  return prisma.$transaction(async db => {
    const expiradas=await db.$queryRaw<Entrega[]>`UPDATE operations.social_deliveries SET estado='RECONCILIAR',ultimo_erro='RESERVA_EXPIRADA',reserva=NULL,reserva_ate=NULL WHERE estado='PROCESSANDO' AND reserva_ate<now() RETURNING *`;
    for(const d of expiradas) await evento(db,d.post_id,"RECONCILIAR","worker",{codigo:"RESERVA_EXPIRADA"},d.id);
    return expiradas.length;
  });
}

export async function reconciliarEntrega(id: string, idExterno: string, url: string|null, autor: string) {
  return prisma.$transaction(async db=>{
    const [d]=await db.$queryRaw<Entrega[]>`SELECT * FROM operations.social_deliveries WHERE id=${id}::uuid`;
    if(!d) throw new ConflitoPublicacao("Entrega não encontrada.");
    await db.$queryRaw`SELECT id FROM operations.social_posts WHERE id=${d.post_id}::uuid FOR UPDATE`;
    const n=await db.$executeRaw`UPDATE operations.social_deliveries SET estado='PUBLICADO',id_externo=${idExterno},url_publicada=${url},publicado_em=now(),ultimo_erro=NULL WHERE id=${id}::uuid AND estado IN ('RECONCILIAR','QUARENTENA')`;
    if(!n) throw new ConflitoPublicacao("Esta entrega já mudou de estado.");
    await db.$executeRaw`UPDATE operations.social_posts SET estado='PUBLICADO',publicado_em=COALESCE(publicado_em,now()) WHERE id=${d.post_id}::uuid AND NOT EXISTS(SELECT 1 FROM operations.social_deliveries WHERE post_id=${d.post_id}::uuid AND obrigatorio AND estado<>'PUBLICADO')`;
    await evento(db,d.post_id,"PUBLICACAO_CONFERIDA",autor,{idExterno},id);
  });
}

export async function repetirEntrega(id:string,autor:string,motivo:string) {
  return prisma.$transaction(async db=>{
    const [d]=await db.$queryRaw<Entrega[]>`UPDATE operations.social_deliveries SET estado='REPETIR',tentativa=0,proxima_em=now() WHERE id=${id}::uuid AND estado='QUARENTENA' RETURNING *`;
    if(!d) throw new ConflitoPublicacao("Somente falhas confirmadas podem ser repetidas. Entregas ambíguas precisam ser conferidas.");
    await evento(db,d.post_id,"REPETICAO_AUTORIZADA",autor,{motivo},id);
  });
}

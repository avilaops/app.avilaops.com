import { prisma } from "@/lib/prisma";
import { publicar, FalhaProvedor } from "./provedores";
import { concluirEntrega, falharEntrega, recuperarReservas, reservarEntrega, salvarCheckpoint } from "./repositorio";
import { assinarMidia,validarRender } from "./midia";

export async function processarFila(limite = 5) {
  await recuperarReservas();
  let processadas=0;
  for(let i=0;i<Math.min(limite,10);i++) {
    const item=await reservarEntrega();
    if(!item) break;
    const d=item.entrega;
    try {
      // Revalida a habilitação para que desligar a conta interrompa filas já aprovadas.
      const ativos=await prisma.$queryRaw<{ativo:boolean}[]>`SELECT ativo FROM operations.social_destinations WHERE perfil_id=${item.post.perfil_id}::uuid AND canal=${d.canal} AND identificador=${d.destino.identificador} AND credencial=${d.destino.credencial}`;
      if(!ativos[0]?.ativo) throw new FalhaProvedor("DESTINO_DESABILITADO");
      if(item.post.conteudo.renderId) {
        try {
          const [perfil]=await prisma.$queryRaw<{organization_id:string}[]>`SELECT organization_id FROM operations.social_profiles WHERE id=${item.post.perfil_id}::uuid`;
          await validarRender(item.post.conteudo,perfil.organization_id);
          item.post.conteudo={...item.post.conteudo,midiaUrl:assinarMidia(item.post.conteudo.renderId)};
        } catch {throw new FalhaProvedor("MIDIA_DO_ESTUDIO_INDISPONIVEL");}
      }
      const resultado=await publicar(item.post,d,valor=>salvarCheckpoint(d,valor));
      await concluirEntrega(d,resultado.id,resultado.url);
    } catch(erro) {
      // Uma exceção depois do POST também pode significar que só a gravação local falhou.
      const falha=erro instanceof FalhaProvedor?erro:new FalhaProvedor("ERRO_INTERNO",true);
      await falharEntrega(d,falha.codigo,falha.ambigua,falha.transitoria);
    }
    processadas++;
  }
  return {processadas};
}

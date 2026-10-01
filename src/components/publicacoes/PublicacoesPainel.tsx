"use client";
import { useEffect,useState, type FormEvent } from "react";
import Link from "next/link";
import CabecalhoPagina from "@/components/hub-social/CabecalhoPagina";
import { Button } from "@/components/shadcn/button";
import { canais, type Canal, type NovaPublicacao } from "@/lib/publicacoes/contratos";
import styles from "./publicacoes.module.css";

type PostDTO={id:string;perfil_id:string;conteudo:NovaPublicacao;agendado_em:string;estado:string;versao:number;entregas:{id:string;canal:string;estado:string;ultimo_erro:string|null;id_externo:string|null;url_publicada:string|null}[]};
export type DadosPainel={perfis:{id:string;nome:string;empresa:string;organization_id:string}[];destinos:{perfil_id:string;canal:string;identificador:string;credencial:string;ativo:boolean}[];posts:PostDTO[];renders:{id:string;kind:string;piece:{title:string;organizationId:string|null}}[]};
const nomes:Record<string,string>={instagram:"Instagram",facebook:"Facebook",reddit:"Reddit",tiktok:"TikTok",whatsapp:"WhatsApp"};
const estados:Record<string,string>={RASCUNHO:"Rascunho",AGENDADO:"Agendado",PROCESSANDO:"Processando",PUBLICADO:"Publicado",CANCELADO:"Cancelado",PENDENTE:"Pendente",REPETIR:"Nova tentativa",RECONCILIAR:"Conferir publicação",QUARENTENA:"Precisa de atenção"};
function dataLocal(iso:string) { const d=new Date(iso); return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16); }
export default function PublicacoesPainel({inicial,empresas,dono}:{inicial:DadosPainel;empresas:{id:string;name:string}[];dono:boolean}) {
  const [dados,setDados]=useState(inicial),[erro,setErro]=useState(""),[ocupado,setOcupado]=useState(false),[editando,setEditando]=useState<PostDTO|null>(null);
  const [filtro,setFiltro]=useState("");
  const [chave,setChave]=useState(()=>crypto.randomUUID());
  const [atualizacao,setAtualizacao]=useState("");
  useEffect(()=>{
    let ativo=true;
    const intervalo=setInterval(async()=>{
      try {
        const r=await fetch("/api/publicacoes",{cache:"no-store",signal:AbortSignal.timeout(10000)});
        if(!r.ok)throw new Error();
        const recebido=await r.json();
        if(ativo){setDados(recebido);setAtualizacao(`Atualizado às ${new Date().toLocaleTimeString("pt-BR")}`);}
      } catch {if(ativo)setAtualizacao("Atualização indisponível. Recarregue antes de agir.");}
    },30000);
    return ()=>{ativo=false;clearInterval(intervalo);};
  },[]);
  async function executar(url:string,body:unknown,method="POST") {
    setOcupado(true);setErro("");
    try {
      const r=await fetch(url,{method,headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
      const j=await r.json();
      if(!r.ok) throw new Error(j.error || "Não foi possível salvar.");
      const leitura=await fetch("/api/publicacoes",{cache:"no-store"});
      if(!leitura.ok) throw new Error("Salvo, mas não foi possível atualizar a tela. Recarregue para conferir.");
      setDados(await leitura.json()); return true;
    } catch(e) {setErro(e instanceof Error?e.message:"Falha de conexão.");return false;}
    finally {setOcupado(false);}
  }
  async function salvar(e:FormEvent<HTMLFormElement>) {
    e.preventDefault();const form=e.currentTarget;const f=new FormData(form);
    const payload={perfilId:String(f.get("perfil")),titulo:String(f.get("titulo")),texto:String(f.get("texto")),tipo:String(f.get("tipo")),midiaUrl:String(f.get("midia")) || null,renderId:String(f.get("render")) || null,canais:f.getAll("canais"),opcionais:[],agendadoEm:new Date(String(f.get("data"))).toISOString(),chave:editando?.conteudo.chave || chave};
    const ok=editando?await executar(`/api/publicacoes/${editando.id}`,{acao:"editar",versao:editando.versao,dados:payload},"PATCH"):await executar("/api/publicacoes",payload);
    if(ok) {setEditando(null);setChave(crypto.randomUUID());form.reset();}
  }
  return <div className={styles.painel}>
    <CabecalhoPagina titulo="Publicações" subtitulo="Prepare, aprove e acompanhe cada entrega da sua rede de perfis." voltar={{href:"/hub-social/estudio",label:"Estúdio"}} acoes={<Button asChild variant="outline"><Link href="/hub-social/estudio">Criar mídia no Estúdio</Link></Button>} />
    {erro && <p role="alert" className={styles.erro}>{erro}</p>}
    {dados.posts.some(p=>p.entregas.some(d=>["RECONCILIAR","QUARENTENA"].includes(d.estado)))&&<p role="status" className={styles.erro}>Há entregas que precisam de atenção. Confira o motivo em cada canal antes de autorizar um novo envio.</p>}
    {atualizacao&&<p className={styles.ajuda} role="status">{atualizacao}</p>}
    <div className={styles.colunas}>
      <section className={styles.cartao}>
        <h2>{editando?"Editar rascunho":"Nova publicação"}</h2>
        {!dados.perfis.length?<p>Cadastre um perfil abaixo para começar.</p>:<form key={editando?.id || chave} onSubmit={salvar} className={styles.formulario}>
          <label>Perfil<select name="perfil" required defaultValue={editando?.perfil_id}>{dados.perfis.map(p=><option key={p.id} value={p.id}>{p.nome} · {p.empresa}</option>)}</select></label>
          <label>Título<input name="titulo" required maxLength={250} defaultValue={editando?.conteudo.titulo} /></label>
          <label>Legenda<textarea name="texto" required rows={6} maxLength={10000} defaultValue={editando?.conteudo.texto} /></label>
          <label>Formato<select name="tipo" defaultValue={editando?.conteudo.tipo || "image"}><option value="image">Imagem</option><option value="video">Vídeo</option><option value="text">Texto</option><option value="link">Link</option></select></label>
          <label>Endereço público da mídia ou link<input name="midia" type="url" placeholder="https://" defaultValue={editando?.conteudo.midiaUrl || ""} /></label>
          <label>Ou escolha uma mídia concluída no Estúdio<select name="render" defaultValue={editando?.conteudo.renderId || ""}><option value="">Usar endereço acima</option>{dados.renders.map(r=><option key={r.id} value={r.id}>{r.piece.title} · {r.kind==="image"?"Imagem":"Vídeo"} · {empresas.find(e=>e.id===r.piece.organizationId)?.name}</option>)}</select></label>
          <label>Data e hora no seu fuso<input name="data" type="datetime-local" required defaultValue={editando?dataLocal(editando.agendado_em):undefined} /></label>
          <fieldset><legend>Canais obrigatórios</legend><div className={styles.canais}>{canais.map(c=><label key={c}><input type="checkbox" name="canais" value={c} defaultChecked={editando?.conteudo.canais.includes(c as Canal)} />{nomes[c]}</label>)}</div></fieldset>
          <p className={styles.ajuda}>Salvar cria um rascunho. A publicação só entra na fila após a aprovação, com os destinos conectados.</p>
          <div className={styles.acoes}><Button disabled={ocupado} >Salvar rascunho</Button>{editando&&<Button type="button" variant="outline" onClick={()=>setEditando(null)}>Sair da edição</Button>}</div>
        </form>}
      </section>
      <section className={styles.cartao}>
        <h2>Calendário e entregas</h2>
        <label>Filtrar por perfil<select value={filtro} onChange={e=>setFiltro(e.target.value)}><option value="">Todos os perfis</option>{dados.perfis.map(p=><option key={p.id} value={p.id}>{p.nome}</option>)}</select></label>
        {!dados.posts.length&&<p>Nenhuma publicação cadastrada. Os resultados aparecerão aqui após cada entrega.</p>}
        <div className={styles.lista}>{dados.posts.filter(p=>!filtro||p.perfil_id===filtro).map(p=><article key={p.id} className={styles.post}>
          <div className={styles.linha}><strong>{p.conteudo.titulo}</strong><span>{estados[p.estado] || p.estado}</span></div>
          <p>{dados.perfis.find(f=>f.id===p.perfil_id)?.nome} · <time dateTime={p.agendado_em}>{new Date(p.agendado_em).toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo"})}</time> (Brasília)</p>
          <p className={styles.legenda}>{p.conteudo.texto}</p>
          {p.conteudo.midiaUrl&&<a href={p.conteudo.midiaUrl} target="_blank" rel="noreferrer">Ver mídia ou link</a>}
          <ul>{p.entregas.map(d=><li key={d.id}>{nomes[d.canal]}: <strong>{estados[d.estado]}</strong>{d.url_publicada&&<> · <a href={d.url_publicada} target="_blank" rel="noreferrer">Abrir publicação</a></>}{d.id_externo&&<small className={styles.evidencia}>ID confirmado: {d.id_externo}</small>}{d.ultimo_erro&&<small className={styles.evidencia}>Motivo: {d.ultimo_erro}</small>}
            {dono&&["RECONCILIAR","QUARENTENA"].includes(d.estado)&&<details><summary>Resolver entrega</summary>
              <p>Se o conteúdo já está na rede, informe seu ID. O app confere se pertence ao destino antes de concluir.</p>
              <form className={styles.formulario} onSubmit={async e=>{e.preventDefault();await executar(`/api/publicacoes/entregas/${d.id}`,{acao:"conferir",idExterno:new FormData(e.currentTarget).get("externo")});}}><label>ID da publicação<input name="externo" required /></label><Button variant="outline" disabled={ocupado}>Conferir na rede</Button></form>
              {d.estado==="QUARENTENA"&&<form className={styles.formulario} onSubmit={async e=>{e.preventDefault();await executar(`/api/publicacoes/entregas/${d.id}`,{acao:"repetir",motivo:new FormData(e.currentTarget).get("motivo")});}}><label>O que foi corrigido?<input name="motivo" required minLength={10} maxLength={1000}/></label><Button variant="outline" disabled={ocupado}>Autorizar nova tentativa</Button></form>}
            </details>}
          </li>)}</ul>
          <div className={styles.acoes}>{p.estado==="RASCUNHO"&&<><Button variant="outline" disabled={ocupado} onClick={()=>setEditando(p)}>Editar</Button><Button  disabled={ocupado} onClick={()=>executar(`/api/publicacoes/${p.id}`,{acao:"agendar",versao:p.versao},"PATCH")}>Aprovar e agendar</Button></>}{["RASCUNHO","AGENDADO"].includes(p.estado)&&<Button variant="outline" disabled={ocupado} onClick={()=>executar(`/api/publicacoes/${p.id}`,{acao:"cancelar",versao:p.versao},"PATCH")}>Cancelar</Button>}</div>
        </article>)}</div>
      </section>
    </div>
    <section className={styles.cartao}><h2>Perfis e conexões</h2>
      <p>Cada perfil pertence a uma empresa e tem seus próprios destinos. TikTok e comunidades do WhatsApp aguardam integração compatível; cadastrar um nome não habilita a publicação.</p>
      <form className={styles.formulario} onSubmit={async e=>{e.preventDefault();const form=e.currentTarget;const f=new FormData(form);if(await executar("/api/publicacoes/perfis",{nome:f.get("nome"),organizationId:f.get("empresa")}))form.reset();}}>
        <label>Nome do perfil<input name="nome" required maxLength={120}/></label><label>Empresa<select name="empresa" required><option value="">Selecione</option>{empresas.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select></label><Button variant="outline" disabled={ocupado}>Cadastrar perfil</Button>
      </form>
      {dados.perfis.map(p=><details key={p.id} className={styles.post}><summary>{p.nome} · {p.empresa}</summary><ul>{dados.destinos.filter(d=>d.perfil_id===p.id).map(d=><li key={d.canal}>{nomes[d.canal]} · {d.identificador} · {d.ativo?"Habilitado":"Desabilitado"}</li>)}</ul>
        {dono&&<form className={styles.formulario} onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);await executar("/api/publicacoes/destinos",{perfilId:p.id,canal:f.get("canal"),identificador:f.get("identificador"),credencial:f.get("credencial"),ativo:f.get("ativo")==="on"});}}>
          <label>Canal<select name="canal">{canais.map(c=><option key={c} value={c}>{nomes[c]}</option>)}</select></label>
          <label>ID da conta ou nome do subreddit<input name="identificador" required /></label>
          <label>Conexão da empresa ou referência do cofre<input name="credencial" required pattern="(SOCIAL_[A-Z0-9_]+_TOKEN|META_EMPRESA)" placeholder="META_EMPRESA" /></label>
          <p className={styles.ajuda}>Use META_EMPRESA para a conexão já autorizada em <Link href="/hub-social/meta">Meta</Link>. Para um token individual, use sua referência SOCIAL_PERFIL_CANAL_TOKEN no cofre.</p>
          <label className={styles.linha}><input name="ativo" type="checkbox"/>Verificar acesso e habilitar</label><Button variant="outline" disabled={ocupado}>Salvar conexão</Button>
        </form>}
      </details>)}
    </section>
  </div>;
}

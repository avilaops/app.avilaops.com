// Worker do próprio app. Token e URL vêm do ambiente, nunca dos logs.
const url=process.env.SOCIAL_WORKER_URL;
const token=process.env.SOCIAL_WORKER_TOKEN;
if(!url || !token) throw new Error("Configure SOCIAL_WORKER_URL e SOCIAL_WORKER_TOKEN");
const destino=new URL(url);
if(destino.protocol!=="https:" && !["127.0.0.1","localhost"].includes(destino.hostname)) throw new Error("O worker exige HTTPS");
let parar=false;
process.on("SIGTERM",()=>{parar=true;});
process.on("SIGINT",()=>{parar=true;});
while(!parar) {
  try {
    const resposta=await fetch(destino,{method:"POST",headers:{authorization:`Bearer ${token}`},signal:AbortSignal.timeout(180000),redirect:"error"});
    console.log(JSON.stringify({evento:"fila_publicacoes",status:resposta.status,em:new Date().toISOString()}));
  } catch { console.error(JSON.stringify({evento:"fila_indisponivel",em:new Date().toISOString()})); }
  if(!parar) await new Promise(resolve=>setTimeout(resolve,30000));
}

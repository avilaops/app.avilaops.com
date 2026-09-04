/**
 * Templates do Estúdio: cada um devolve um HTML autossuficiente (1080 de largura) que
 * serve tanto para a pré-visualização no navegador (iframe) quanto para o worker
 * renderizar quadro a quadro. Vídeo expõe window.render(t) e nunca usa animação CSS
 * correndo em tempo real: o quadro é função do tempo, e só.
 */

export type Formato = "9:16" | "1:1" | "4:5";

export const DIMENSOES: Record<Formato, { largura: number; altura: number; rotulo: string }> = {
  "9:16": { largura: 1080, altura: 1920, rotulo: "Reels e Stories" },
  "1:1": { largura: 1080, altura: 1080, rotulo: "Feed quadrado" },
  "4:5": { largura: 1080, altura: 1350, rotulo: "Feed retrato" },
};

export type TipoCampo = "texto" | "textoLongo" | "imagem" | "cor" | "numero" | "opcao";

export type Campo = {
  chave: string;
  rotulo: string;
  tipo: TipoCampo;
  padrao: string;
  ajuda?: string;
  opcoes?: { valor: string; rotulo: string }[];
};

export type Narracao = { texto: string; inicio: number };

export type Marca = {
  nome: string;
  slogan: string;
  logoUrl: string;
  corPrimaria: string; // navy
  corDestaque: string; // azul
  site: string;
};

export const MARCA_PADRAO: Marca = {
  nome: "ÁVILA OPS",
  slogan: "Estratégia em operação digital",
  logoUrl: "/estudio/logo-avilaops.png",
  corPrimaria: "#102840",
  corDestaque: "#2f6fe0",
  site: "www.avilaops.com",
};

export type Valores = Record<string, string>;

export type Template = {
  id: string;
  nome: string;
  descricao: string;
  tipo: "video" | "imagem";
  duracaoPadrao?: number;
  campos: Campo[];
  /** frases narradas e o instante em que cada uma começa (só vídeo) */
  narracao?: (v: Valores, duracao: number) => Narracao[];
  html: (v: Valores, formato: Formato, marca: Marca, duracao: number) => string;
};

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** **negrito** vira <b>; quebra de linha vira <br> */
const rico = (s: string) =>
  esc(s).replace(/\*\*([\s\S]+?)\*\*/g, "<b>$1</b>").replace(/\n/g, "<br>");

const base = (formato: Formato, marca: Marca, css: string, corpo: string, script = "") => {
  const { largura, altura } = DIMENSOES[formato];
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${largura}px;height:${altura}px;overflow:hidden}
body{font-family:Inter,"Segoe UI",system-ui,sans-serif;color:${marca.corPrimaria};position:relative;--primaria:${marca.corPrimaria};--destaque:${marca.corDestaque}}
.blob{position:absolute;border-radius:50%;filter:blur(80px);opacity:.5}
.logo{display:flex;align-items:center;gap:22px}
.logo img{width:96px;height:auto}
.logo .nome{font-size:48px;font-weight:800;letter-spacing:1px;line-height:1;color:var(--primaria)}
.logo .nome span{color:var(--destaque)}
.logo .slogan{margin-top:10px;font-size:15px;letter-spacing:3.2px;text-transform:uppercase;color:#3a4b60;font-weight:500}
${css}
</style></head><body>${corpo}
<script>
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const easeOut=x=>1-Math.pow(1-x,3);
const easeBack=x=>{const c1=1.4,c3=c1+1;return 1+c3*Math.pow(x-1,3)+c1*Math.pow(x-1,2)};
const el=id=>document.getElementById(id);
function anima(id,ini,dur,t,fn){const e=el(id);if(e)fn(e,clamp((t-ini)/dur,0,1))}
${script}
if(typeof window.render==="function")window.render(0);
</script></body></html>`;
};

const blocoLogo = (marca: Marca) => {
  const [primeira, ...resto] = marca.nome.split(" ");
  return `<div class="logo"><img src="${esc(marca.logoUrl)}" alt=""><div><div class="nome">${esc(primeira)} <span>${esc(resto.join(" "))}</span></div><div class="slogan">${esc(marca.slogan)}</div></div></div>`;
};

/* ------------------------------------------------------------------ */
/* 1. Cena com personagem + notificações (vídeo)                        */
/* ------------------------------------------------------------------ */
const cenaPersonagem: Template = {
  id: "cena-personagem",
  nome: "Cena com personagem",
  descricao: "Ilustração ou foto recortada, selo, título e três notificações entrando em sequência. Base do vídeo do 7 de Setembro.",
  tipo: "video",
  duracaoPadrao: 5,
  campos: [
    { chave: "selo", rotulo: "Selo no topo", tipo: "texto", padrao: "7 de Setembro · feriado" },
    { chave: "titulo", rotulo: "Título", tipo: "textoLongo", padrao: "Você curte o feriado.\n**Sua loja vende\n24 horas.**", ajuda: "**negrito** e quebra de linha valem" },
    { chave: "imagem", rotulo: "Personagem (PNG sem fundo)", tipo: "imagem", padrao: "/estudio/exemplo-personagem.png" },
    { chave: "card1", rotulo: "Notificação 1", tipo: "texto", padrao: "Novo pedido confirmado" },
    { chave: "card2", rotulo: "Notificação 2", tipo: "texto", padrao: "Pagamento aprovado" },
    { chave: "card3", rotulo: "Notificação 3", tipo: "texto", padrao: "Etiqueta e nota emitidas" },
    { chave: "narracao", rotulo: "Narração", tipo: "textoLongo", padrao: "Enquanto você curte o feriado, sua loja vende 24 horas.", ajuda: "uma frase por linha; cada linha começa quando a anterior termina" },
    { chave: "fundoA", rotulo: "Cor do céu", tipo: "cor", padrao: "#dcefff" },
    { chave: "fundoB", rotulo: "Cor do chão", tipo: "cor", padrao: "#fff1e2" },
  ],
  narracao: (v, duracao) => {
    const linhas = (v.narracao ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
    return linhas.map((texto, i) => ({ texto, inicio: (i * duracao) / Math.max(linhas.length, 1) }));
  },
  html: (v, formato, marca, duracao) => {
    const { altura } = DIMENSOES[formato];
    const alto = altura >= 1600;
    const css = `
body{background:linear-gradient(180deg,${v.fundoA} 0%,#f3f7fb 55%,${v.fundoB} 100%)}
.sol{position:absolute;width:900px;height:900px;border-radius:50%;right:-320px;top:-260px;background:radial-gradient(circle,rgba(255,214,150,.75) 0%,rgba(255,214,150,0) 65%)}
.b1{width:700px;height:700px;background:#bfe0ff;left:-250px;top:${alto ? 500 : 200}px}
.b2{width:600px;height:600px;background:#ffd9d0;right:-200px;bottom:100px}
.pill{position:absolute;left:50%;top:${alto ? 150 : 70}px;transform:translateX(-50%);background:rgba(255,255,255,.85);border:1px solid rgba(16,40,64,.08);border-radius:999px;padding:18px 40px;font-size:${alto ? 34 : 28}px;font-weight:600;box-shadow:0 10px 30px rgba(16,40,64,.10);white-space:nowrap;opacity:0}
.titulo{position:absolute;left:80px;top:${alto ? 300 : 170}px;font-size:${alto ? 78 : 58}px;line-height:1.12;font-weight:300;opacity:0;max-width:${alto ? 920 : 560}px}
.titulo b{font-weight:800}
.homem{position:absolute;left:-110px;bottom:-40px;width:${alto ? 930 : 620}px;transform-origin:40% 100%}
.cards{position:absolute;right:50px;top:${alto ? 560 : altura - 600}px;width:${alto ? 500 : 430}px;display:flex;flex-direction:column;gap:22px}
.card{background:#fff;border-radius:26px;padding:24px 28px;display:flex;gap:20px;align-items:center;box-shadow:0 18px 44px rgba(16,40,64,.16);opacity:0}
.card .ico{width:64px;height:64px;border-radius:18px;display:grid;place-items:center;font-size:30px;color:#fff;flex:none}
.verde{background:#25b562}.azul{background:var(--destaque)}.roxo{background:#6b5ce7}
.card .tx b{display:block;font-size:${alto ? 28 : 24}px}
.card .tx small{color:#5a6b80;font-size:22px}`;
    const corpo = `
<div class="sol"></div><div class="blob b1"></div><div class="blob b2"></div>
<div class="pill" id="pill">${esc(v.selo)}</div>
<div class="titulo" id="titulo">${rico(v.titulo)}</div>
<img class="homem" id="homem" src="${esc(v.imagem)}" alt="">
<div class="cards">
 <div class="card" id="c1"><div class="ico verde">✓</div><div class="tx"><b>${esc(v.card1)}</b><small>agora</small></div></div>
 <div class="card" id="c2"><div class="ico azul">Pix</div><div class="tx"><b>${esc(v.card2)}</b><small>agora</small></div></div>
 <div class="card" id="c3"><div class="ico roxo">▶</div><div class="tx"><b>${esc(v.card3)}</b><small>automático</small></div></div>
</div>`;
    const d = duracao;
    const script = `
window.render=function(t){
 anima("homem",0,0.45,t,(e,p)=>{const z=1+0.055*(t/${d});e.style.transform=\`translateY(\${(1-easeOut(p))*24}px) scale(\${z})\`});
 anima("pill",0,0.3,t,(e,p)=>{e.style.opacity=p;e.style.transform=\`translateX(-50%) translateY(\${(1-easeOut(p))*-20}px)\`});
 anima("titulo",0.35,0.5,t,(e,p)=>{e.style.opacity=p;e.style.transform=\`translateY(\${(1-easeOut(p))*30}px)\`});
 [["c1",${(0.34 * d).toFixed(2)}],["c2",${(0.54 * d).toFixed(2)}],["c3",${(0.75 * d).toFixed(2)}]].forEach(([id,ini])=>anima(id,ini,0.45,t,(e,p)=>{e.style.opacity=clamp(p*1.6,0,1);e.style.transform=\`translateX(\${(1-easeBack(p))*160}px)\`}));
};`;
    return base(formato, marca, css, corpo, script);
  },
};

/* ------------------------------------------------------------------ */
/* 2. Cartão de chamada (imagem ou fecho de vídeo)                      */
/* ------------------------------------------------------------------ */
const iphoneSvg = (tela: string) => `<svg viewBox="0 0 200 400" width="250" height="500" fill="none" xmlns="http://www.w3.org/2000/svg">
<path fill="#303333" d="M196.11,128.09c0-.25-.2-.45-.45-.45-.11.04-.37.03-.69,0V36.69c0-17.84-14.46-32.31-32.31-32.31H37.48C19.63,4.39,5.17,18.85,5.17,36.69v33.16c-.42.02-.77.03-.9,0-.25,0-.45.2-.45.45v9.9c0,.25.2.45.45.45.14-.04.48-.04.9,0v9.06c-.42.02-.77.03-.9,0-.25,0-.45.2-.45.45v19.97c0,.25.2.45.45.45.14-.04.48-.04.9,0v9.06c-.42.02-.77.03-.9,0-.25,0-.45.2-.45.45v19.97c0,.25.2.45.45.45.14-.04.48-.04.9,0v222.94c0,17.84,14.46,32.31,32.31,32.31h125.18c17.84,0,32.31-14.46,32.31-32.31v-197.66c.32-.03.58-.04.69,0,.25,0,.45-.2.45-.45v-36.46Z"/>
<path fill="#0b1020" d="M191.07,36.69v326.62c0,15.61-12.65,28.26-28.26,28.26H37.33c-15.61,0-28.26-12.65-28.26-28.26V36.69c0-15.61,12.65-28.26,28.26-28.26h125.48c15.61,0,28.26,12.65,28.26,28.26Z"/>
<clipPath id="tela"><rect x="13.29" y="13.09" width="173.56" height="373.81" rx="24.67"/></clipPath>
<rect x="13.29" y="13.09" width="173.56" height="373.81" rx="24.67" fill="#fff"/>
<image href="${esc(tela)}" x="13.29" y="13.09" width="173.56" height="373.81" preserveAspectRatio="xMidYMin slice" clip-path="url(#tela)"/>
<rect x="72" y="20" width="56" height="16" rx="8" fill="#0b1020"/>
</svg>`;

const cartaoChamada: Template = {
  id: "cartao-chamada",
  nome: "Cartão de chamada",
  descricao: "Logo, celular com uma tela real, título e botão. Serve de fecho de vídeo ou post estático.",
  tipo: "imagem",
  campos: [
    { chave: "titulo", rotulo: "Título", tipo: "textoLongo", padrao: "Clica no **link da bio** e\nfale com um especialista" },
    { chave: "botao", rotulo: "Texto do botão", tipo: "texto", padrao: "Falar com um especialista" },
    { chave: "tela", rotulo: "Captura de tela do celular", tipo: "imagem", padrao: "/estudio/exemplo-tela.png", ajuda: "captura em 393×852 (modo iPhone); deixe vazio para esconder o celular" },
    { chave: "mostrarSite", rotulo: "Mostrar site no rodapé", tipo: "opcao", padrao: "sim", opcoes: [{ valor: "sim", rotulo: "Sim" }, { valor: "nao", rotulo: "Não" }] },
  ],
  html: (v, formato, marca) => {
    const { altura } = DIMENSOES[formato];
    const alto = altura >= 1600;
    const comTela = Boolean(v.tela?.trim());
    const css = `
body{background:#f4f6f9}
.b1{width:520px;height:520px;background:#bfe0ff;left:-180px;top:-160px}
.b2{width:460px;height:460px;background:#cfe9dc;right:-160px;top:160px}
.b3{width:520px;height:520px;background:#ffd9d0;left:-120px;bottom:-220px}
.b4{width:420px;height:420px;background:#dcd6ff;right:-140px;bottom:-120px}
.ring{position:absolute;border:26px solid rgba(16,40,64,.10);border-radius:50%}
.r1{width:150px;height:150px;left:-10px;top:10px}
.conteudo{position:relative;height:100%;display:flex;flex-direction:column;align-items:center;text-align:center;padding:${alto ? 110 : 60}px 60px ${alto ? 80 : 50}px;gap:${alto ? 44 : 28}px}
.celular{margin-top:${alto ? 10 : 0}px;filter:drop-shadow(0 30px 40px rgba(16,40,64,.28))}
.celular svg{display:block;width:${alto ? 250 : 190}px;height:auto}
.titulo{font-size:${alto ? 50 : 40}px;line-height:1.18;font-weight:400;white-space:nowrap}
.titulo b{font-weight:700}
.botao{background:var(--destaque);color:#fff;font-size:${alto ? 36 : 30}px;font-weight:600;padding:28px 50px;border-radius:16px;box-shadow:0 14px 34px rgba(54,110,198,.35);display:inline-flex;align-items:center;gap:18px}
.site{margin-top:auto;display:flex;align-items:center;gap:16px;font-size:32px;font-weight:600}
.site .ico{width:56px;height:56px;border-radius:14px;background:var(--primaria);color:#fff;display:grid;place-items:center;font-size:30px}`;
    const corpo = `
<div class="blob b1"></div><div class="blob b2"></div><div class="blob b3"></div><div class="blob b4"></div><div class="ring r1"></div>
<div class="conteudo">
 ${blocoLogo(marca)}
 ${comTela ? `<div class="celular">${iphoneSvg(v.tela)}</div>` : ""}
 <div class="titulo">${rico(v.titulo)}</div>
 <div class="botao">${esc(v.botao)} <span>→</span></div>
 ${v.mostrarSite === "sim" ? `<div class="site"><div class="ico">🌐</div>${esc(marca.site)}</div>` : ""}
</div>`;
    return base(formato, marca, css, corpo);
  },
};

/* ------------------------------------------------------------------ */
/* 3. Post de frase (imagem)                                            */
/* ------------------------------------------------------------------ */
const postFrase: Template = {
  id: "post-frase",
  nome: "Post de frase",
  descricao: "Uma afirmação grande sobre fundo da marca, com assinatura. Para o mural e as redes.",
  tipo: "imagem",
  campos: [
    { chave: "frase", rotulo: "Frase", tipo: "textoLongo", padrao: "Operação estruturada\nnão depende de\n**ninguém estar online.**" },
    { chave: "apoio", rotulo: "Linha de apoio", tipo: "texto", padrao: "Automação que vende, cobra e entrega." },
    { chave: "fundo", rotulo: "Fundo", tipo: "opcao", padrao: "escuro", opcoes: [{ valor: "escuro", rotulo: "Escuro (navy)" }, { valor: "claro", rotulo: "Claro" }] },
  ],
  html: (v, formato, marca) => {
    const { altura } = DIMENSOES[formato];
    const escuro = v.fundo !== "claro";
    const css = `
body{background:${escuro ? `linear-gradient(160deg,${marca.corPrimaria} 0%,#0b1c30 100%)` : "#f4f6f9"};color:${escuro ? "#fff" : marca.corPrimaria}}
.b1{width:700px;height:700px;background:${escuro ? "rgba(47,111,224,.45)" : "#bfe0ff"};right:-250px;top:-200px}
.b2{width:600px;height:600px;background:${escuro ? "rgba(255,160,120,.25)" : "#ffd9d0"};left:-220px;bottom:-200px}
.conteudo{position:relative;height:100%;display:flex;flex-direction:column;padding:${altura >= 1600 ? 140 : 90}px 90px}
.frase{margin:auto 0;font-size:${altura >= 1600 ? 92 : 76}px;line-height:1.1;font-weight:300;letter-spacing:-1px}
.frase b{font-weight:800;color:${escuro ? "#8fb8ff" : marca.corDestaque}}
.apoio{font-size:34px;opacity:.85;margin-top:40px}
.assin{display:flex;align-items:center;gap:18px;font-size:30px;font-weight:600;opacity:.95}
.assin img{width:64px;height:auto;${escuro ? "filter:brightness(0) invert(1)" : ""}}`;
    const corpo = `
<div class="blob b1"></div><div class="blob b2"></div>
<div class="conteudo">
 <div class="assin"><img src="${esc(marca.logoUrl)}" alt="">${esc(marca.nome)}</div>
 <div class="frase">${rico(v.frase)}<div class="apoio">${esc(v.apoio)}</div></div>
 <div class="assin" style="opacity:.7;font-weight:500">${esc(marca.site)}</div>
</div>`;
    return base(formato, marca, css, corpo);
  },
};

export const TEMPLATES: Template[] = [cenaPersonagem, cartaoChamada, postFrase];

export const templatePorId = (id: string) => TEMPLATES.find((t) => t.id === id);

export function valoresPadrao(t: Template): Valores {
  return Object.fromEntries(t.campos.map((c) => [c.chave, c.padrao]));
}

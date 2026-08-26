// GERADO por packages/tema-noturno/sincronizar.mjs — não edite aqui.
// O canônico é packages/tema-noturno/src/. Edite lá e rode o script.
/**
 * Modo noturno por horário — o padrão da Avila Ops.
 *
 * Uma regra só, em todos os produtos: das 18h às 6h a interface fica escura.
 * Quem quiser sair do automático toca no botão, e a escolha vale até a próxima
 * virada de horário — ninguém fica preso num tema que escolheu uma vez.
 *
 * Sem dependência, sem framework. Roda igual em Next, em HTML estático e
 * dentro do Odoo.
 *
 * ATENÇÃO: o canônico deste arquivo é `packages/tema-noturno/src/index.ts`.
 * As cópias dentro de cada app são geradas por `node sincronizar.mjs` — edite
 * aqui e rode o script, nunca o contrário.
 */

export type Tema = "dark" | "light";
export type ModoTema = "auto" | Tema;

/** Chave do localStorage que guarda a escolha manual e a validade dela. */
export const CHAVE = "avilaops-tema";

/**
 * Nome do cookie. Não é escolha nossa: é o nome que o Odoo lê no
 * `webclient_templates.xml` para decidir qual bundle de CSS servir. Usar o
 * mesmo nome em todo lugar deixa um app só ler o tema do outro no servidor,
 * antes da primeira pintura.
 */
export const COOKIE = "color_scheme";

/** Hora em que escurece e hora em que clareia, no relógio de quem está olhando. */
export const HORA_ESCURO = 18;
export const HORA_CLARO = 6;

export function temaPorHorario(agora: Date = new Date()): Tema {
  const hora = agora.getHours();
  return hora >= HORA_ESCURO || hora < HORA_CLARO ? "dark" : "light";
}

/** Instante da próxima troca de tema. É também o prazo de validade do override. */
export function proximaVirada(agora: Date = new Date()): number {
  const virada = new Date(agora.getTime());
  virada.setMinutes(0, 0, 0);

  const hora = agora.getHours();
  if (hora < HORA_CLARO) {
    virada.setHours(HORA_CLARO);
  } else if (hora < HORA_ESCURO) {
    virada.setHours(HORA_ESCURO);
  } else {
    virada.setDate(virada.getDate() + 1);
    virada.setHours(HORA_CLARO);
  }

  return virada.getTime();
}

type OverrideGravado = { tema: Tema; ate: number };

function lerBruto(): OverrideGravado | null {
  try {
    const cru = window.localStorage.getItem(CHAVE);
    if (!cru) return null;

    const dado = JSON.parse(cru) as Partial<OverrideGravado>;
    if (dado.tema !== "dark" && dado.tema !== "light") return null;
    if (typeof dado.ate !== "number") return null;

    return { tema: dado.tema, ate: dado.ate };
  } catch {
    return null;
  }
}

/** Escolha manual ainda válida, ou null quando o prazo já passou. */
export function lerOverride(agora: number = Date.now()): Tema | null {
  const dado = lerBruto();
  if (!dado) return null;

  if (agora >= dado.ate) {
    limparOverride();
    return null;
  }

  return dado.tema;
}

export function gravarOverride(tema: Tema, agora: Date = new Date()): void {
  try {
    const dado: OverrideGravado = { tema, ate: proximaVirada(agora) };
    window.localStorage.setItem(CHAVE, JSON.stringify(dado));
  } catch {
    // Navegador com armazenamento bloqueado: o automático continua valendo.
  }
}

export function limparOverride(): void {
  try {
    window.localStorage.removeItem(CHAVE);
  } catch {
    // idem
  }
}

/** O tema que deve estar na tela agora: o manual se valer, senão o do relógio. */
export function temaEfetivo(agora: Date = new Date()): Tema {
  return lerOverride(agora.getTime()) ?? temaPorHorario(agora);
}

export function modoAtual(agora: Date = new Date()): ModoTema {
  return lerOverride(agora.getTime()) ?? "auto";
}

/**
 * Escreve o tema no documento em todos os dialetos que a casa usa, porque os
 * apps não nasceram iguais: `data-theme` no Ávila OS, classe `.dark` no site e
 * no Comandeiro (Tailwind), `color-scheme` para os controles nativos do
 * navegador e o cookie para quem renderiza no servidor.
 */
export function aplicar(tema: Tema): void {
  const raiz = document.documentElement;

  raiz.dataset.theme = tema;
  raiz.classList.toggle("dark", tema === "dark");
  raiz.style.colorScheme = tema;

  try {
    document.cookie = `${COOKIE}=${tema}; path=/; max-age=31536000; samesite=lax`;
  } catch {
    // Contexto sem cookie (sandbox): o resto do tema já foi aplicado.
  }
}

export interface OpcoesIniciar {
  /** Chamado toda vez que o tema efetivo muda. Serve para o React re-renderizar. */
  aoMudar?: (tema: Tema, modo: ModoTema) => void;
}

/**
 * Liga o tema e o mantém correto: aplica agora, agenda a virada, reavalia
 * quando a aba volta do sono (um notebook fechado às 17h não recebe o
 * setTimeout das 18h) e acompanha as outras abas.
 *
 * Devolve a função de desligar.
 */
export function iniciar(opcoes: OpcoesIniciar = {}): () => void {
  if (typeof window === "undefined") return () => {};

  let timer: ReturnType<typeof setTimeout> | undefined;
  let ultimo: Tema | null = null;

  const sincronizar = () => {
    const agora = new Date();
    const tema = temaEfetivo(agora);

    aplicar(tema);
    if (tema !== ultimo) {
      ultimo = tema;
      opcoes.aoMudar?.(tema, modoAtual(agora));
    }

    if (timer) clearTimeout(timer);
    // +1s para o timer cair do lado de dentro da fronteira, não em cima dela.
    const espera = Math.max(1000, proximaVirada(agora) - agora.getTime() + 1000);
    timer = setTimeout(sincronizar, espera);
  };

  const aoVoltar = () => {
    if (document.visibilityState === "visible") sincronizar();
  };

  sincronizar();
  window.addEventListener("storage", sincronizar);
  window.addEventListener("focus", aoVoltar);
  document.addEventListener("visibilitychange", aoVoltar);

  return () => {
    if (timer) clearTimeout(timer);
    window.removeEventListener("storage", sincronizar);
    window.removeEventListener("focus", aoVoltar);
    document.removeEventListener("visibilitychange", aoVoltar);
  };
}

/** Inverte o tema atual e guarda a escolha até a próxima virada. */
export function alternar(agora: Date = new Date()): Tema {
  const proximo: Tema = temaEfetivo(agora) === "dark" ? "light" : "dark";

  gravarOverride(proximo, agora);
  aplicar(proximo);
  // As outras abas ouvem `storage`, mas esta não ouve a si mesma.
  window.dispatchEvent(new StorageEvent("storage", { key: CHAVE }));

  return proximo;
}

/** Descarta a escolha manual e devolve o controle ao relógio. */
export function voltarAoAutomatico(agora: Date = new Date()): Tema {
  limparOverride();

  const tema = temaPorHorario(agora);
  aplicar(tema);
  window.dispatchEvent(new StorageEvent("storage", { key: CHAVE }));

  return tema;
}

/**
 * Script para colar no `<head>`, antes de qualquer CSS.
 *
 * Sem isto a página pinta clara e escurece um instante depois — o flash branco
 * às 22h é pior do que não ter modo noturno. É uma cópia reduzida da lógica
 * acima de propósito: ele precisa rodar sem bundle, sem import e sem espera.
 */
export function scriptInicial(): string {
  return `(function(){try{
var E=${HORA_ESCURO},C=${HORA_CLARO},K=${JSON.stringify(CHAVE)},N=${JSON.stringify(COOKIE)};
var a=new Date(),h=a.getHours(),t=(h>=E||h<C)?"dark":"light";
try{var g=JSON.parse(localStorage.getItem(K)||"null");
if(g&&(g.tema==="dark"||g.tema==="light")&&typeof g.ate==="number"){
if(a.getTime()<g.ate){t=g.tema}else{localStorage.removeItem(K)}}}catch(e){}
var r=document.documentElement;
r.dataset.theme=t;r.classList.toggle("dark",t==="dark");r.style.colorScheme=t;
document.cookie=N+"="+t+"; path=/; max-age=31536000; samesite=lax";
}catch(e){}})();`;
}

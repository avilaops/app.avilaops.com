/**
 * O que a tela de Telas (Ávila TV) calcula a partir do que o agente responde.
 *
 * Fica separado do cliente HTTP (`avila-tv.ts`) porque é a parte que tem
 * regra: o que conta como problema, em que ordem as telas aparecem e como um
 * número vira frase. Sem rede e sem `fetch`, então tem teste de verdade.
 *
 * A pergunta que esta tela responde não é "está no ar?" — isso o ponto verde
 * já diz. É **"o que precisa de mim agora?"**. Por isso tudo aqui converge
 * para alertas ordenados por gravidade.
 */
import type { Evidencia } from "@/lib/evidencia";
import type { PendenteDoAgente, RespostaLink, RespostaSaude, SaudeDaTela, TelaDoAgente } from "@/lib/avila-tv";

export type Gravidade = "erro" | "aviso";
export type Alerta = { gravidade: Gravidade; texto: string };
export type TomDaTela = "vermelho" | "amarelo" | "azul" | "cinza";

/**
 * Um agente não é uma tela.
 *
 * Os dois falam o mesmo protocolo e chegam pela mesma conexão, mas o que há do
 * outro lado é diferente: a tela mostra uma página, o agente alcança a LAN de
 * um cliente. Tratar os dois igual faria o painel dizer "nada no ar" sobre um
 * aparelho que está fazendo exatamente o que deve — e cobrar dele uma
 * allowlist de `exibir` que ele nunca vai usar.
 */
export function ehAgente(tela: { cliente: { tipo: string } | null }): boolean {
  return tela.cliente?.tipo === "agente";
}

export type TelaNoPainel = TelaDoAgente & {
  /** Telemetria da janela pedida. `null` enquanto não houver amostra. */
  saude: SaudeDaTela | null;
  /** Allowlist efetiva: a própria, ou a do agente quando ela está vazia. */
  origensEfetivas: string[];
};

/** Disponibilidade abaixo disso, na semana, é conversa com o cliente. */
export const PISO_DISPONIBILIDADE = 98;
/** Acima disso a tela não está caindo: está com problema de rede ou de energia. */
export const TETO_QUEDAS = 3;
/** O protocolo prevê rotação de token a cada 30 dias (PROTOCOLO.md seção 4). */
export const DIAS_PARA_ROTACIONAR = 30;

const dias = (desde: string | null, agora: Date) =>
  desde ? (agora.getTime() - Date.parse(desde)) / 864e5 : null;

export function juntarTelasComSaude(link: RespostaLink, saude: RespostaSaude | null): TelaNoPainel[] {
  const porId = new Map((saude?.telas ?? []).map((t) => [t.dispositivo, t]));
  return link.telas.map((tela) => ({
    ...tela,
    saude: porId.get(tela.id) ?? null,
    origensEfetivas: tela.origens.length ? tela.origens : link.origens_padrao,
  }));
}

/**
 * A versão mais nova que alguma tela está rodando agora.
 *
 * É a régua de "defasada": não existe número de versão canônico no servidor —
 * o cliente é servido como arquivo estático e cada tela atualiza quando
 * recarrega. Quem ficou para trás é quem está atrás das outras.
 */
export function versaoMaisNova(telas: TelaNoPainel[]): string | null {
  const versoes = telas
    // Agente e tela são programas diferentes, com numeração própria: a régua
    // de "defasada" sai errada se as duas entrarem na mesma conta.
    .filter((t) => !t.revogadoEm && !ehAgente(t))
    .map((t) => t.pulso?.versao ?? t.saude?.versao ?? t.cliente?.versao)
    .filter((v): v is string => Boolean(v));
  if (!versoes.length) return null;
  return versoes.sort(compararVersoes).at(-1) ?? null;
}

/** Ordena "1.10.0" depois de "1.9.0" — comparar string faria o contrário. */
export function compararVersoes(a: string, b: string): number {
  const partes = (v: string) => v.split(".").map((p) => Number.parseInt(p, 10) || 0);
  const [x, y] = [partes(a), partes(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

export function versaoDaTela(tela: TelaNoPainel): string | null {
  return tela.pulso?.versao ?? tela.saude?.versao ?? tela.cliente?.versao ?? null;
}

/**
 * O que está errado com esta tela, em ordem de quem grita mais alto.
 *
 * Tela revogada não gera alerta nenhum de propósito: ela está desligada
 * porque alguém decidiu isso, e repetir "sem pulso" para cada tela aposentada
 * encheria a fila de atenção com decisões já tomadas.
 */
export function alertasDaTela(tela: TelaNoPainel, agora: Date, maisNova: string | null = null): Alerta[] {
  if (tela.revogadoEm) return [];
  const fora: Alerta[] = [];

  if (tela.estado !== "online") {
    const desde = tela.pulsoEm ?? tela.vistoEm;
    const d = dias(desde, agora);
    fora.push({
      gravidade: "erro",
      texto: d === null
        ? "nunca se conectou desde que foi vinculada"
        : d >= 1
          ? `sem pulso há ${Math.floor(d)} dia${Math.floor(d) > 1 ? "s" : ""}`
          : `sem pulso há ${Math.max(1, Math.round((d * 24 * 60)))} min`,
    });
  }

  const ultimo = tela.pulso?.ultimo_comando;
  if (ultimo && !ultimo.ok) {
    fora.push({ gravidade: "aviso", texto: `o último comando (${ultimo.comando}) falhou` });
  }

  if (tela.pulso?.ultimo_erro) {
    fora.push({ gravidade: "aviso", texto: `a tela relatou: ${tela.pulso.ultimo_erro}` });
  }

  const s = tela.saude;
  if (s && s.amostras > 0) {
    if (s.disponibilidade < PISO_DISPONIBILIDADE) {
      fora.push({ gravidade: "aviso", texto: `ficou no ar ${formatarDisponibilidade(s.disponibilidade)} do tempo` });
    }
    if (s.quedas > TETO_QUEDAS) {
      fora.push({ gravidade: "aviso", texto: `caiu ${s.quedas} vezes (maior parada: ${s.maiorQuedaMin} min)` });
    }
  }

  // Allowlist é a guarda do comando `exibir`, que só existe em tela. Cobrá-la
  // de um agente seria pedir configuração para uma porta que ele não tem.
  if (!ehAgente(tela) && !tela.origensEfetivas.length) {
    fora.push({ gravidade: "aviso", texto: "sem allowlist: o comando exibir vai recusar qualquer endereço" });
  }

  const versao = versaoDaTela(tela);
  if (!ehAgente(tela) && maisNova && versao && compararVersoes(versao, maisNova) < 0) {
    fora.push({ gravidade: "aviso", texto: `versão ${versao}, atrás da ${maisNova} que as outras rodam` });
  }

  const idade = dias(tela.tokenTrocadoEm, agora);
  if (idade !== null && idade > DIAS_PARA_ROTACIONAR) {
    fora.push({ gravidade: "aviso", texto: `token com ${Math.floor(idade)} dias, e o protocolo prevê rotação a cada ${DIAS_PARA_ROTACIONAR}` });
  }

  return fora;
}

/** Vermelho pede gente agora, amarelo pede olhada, azul está em paz, cinza saiu. */
export function tomDaTela(tela: TelaNoPainel, agora: Date, maisNova: string | null = null): TomDaTela {
  if (tela.revogadoEm) return "cinza";
  const alertas = alertasDaTela(tela, agora, maisNova);
  if (alertas.some((a) => a.gravidade === "erro")) return "vermelho";
  return alertas.length ? "amarelo" : "azul";
}

export type ResumoDasTelas = {
  total: number;
  online: number;
  offline: number;
  revogadas: number;
  aguardando: number;
  pedindoAtencao: number;
  /** Média das telas ativas com amostra. `null` quando ainda não há histórico. */
  disponibilidade: number | null;
  quedas: number;
};

export function resumirTelas(telas: TelaNoPainel[], pendentes: PendenteDoAgente[], agora: Date): ResumoDasTelas {
  const ativas = telas.filter((t) => !t.revogadoEm);
  const maisNova = versaoMaisNova(telas);
  const comAmostra = ativas.filter((t) => t.saude && t.saude.amostras > 0);
  const soma = comAmostra.reduce((n, t) => n + (t.saude?.disponibilidade ?? 0), 0);
  return {
    total: ativas.length,
    online: ativas.filter((t) => t.estado === "online").length,
    offline: ativas.filter((t) => t.estado !== "online").length,
    revogadas: telas.length - ativas.length,
    aguardando: pendentes.length,
    pedindoAtencao: ativas.filter((t) => alertasDaTela(t, agora, maisNova).length > 0).length,
    disponibilidade: comAmostra.length ? +(soma / comAmostra.length).toFixed(1) : null,
    quedas: ativas.reduce((n, t) => n + (t.saude?.quedas ?? 0), 0),
  };
}

/**
 * Quem precisa de gente primeiro; revogada por último.
 *
 * Ordem alfabética seria previsível e inútil: numa parede de dez telas, a que
 * caiu tem que estar em cima sem ninguém procurar.
 */
export function ordenarTelas(telas: TelaNoPainel[], agora: Date): TelaNoPainel[] {
  const maisNova = versaoMaisNova(telas);
  const peso = (t: TelaNoPainel) => ({ vermelho: 0, amarelo: 1, azul: 2, cinza: 3 })[tomDaTela(t, agora, maisNova)];
  return [...telas].sort((a, b) => peso(a) - peso(b) || a.nome.localeCompare(b.nome, "pt-BR"));
}

// ---------- frases ----------

export function formatarDisponibilidade(valor: number): string {
  return `${valor.toFixed(1).replace(".", ",")}%`;
}

/** "no ar há 3 d" — uptime é o que separa tela estável de tela que reinicia sozinha. */
export function formatarUptime(segundos: number | null | undefined): string | null {
  if (typeof segundos !== "number" || segundos < 0) return null;
  if (segundos < 3600) return `${Math.max(1, Math.round(segundos / 60))} min`;
  if (segundos < 864e2) return `${Math.floor(segundos / 3600)} h`;
  const d = Math.floor(segundos / 864e2);
  return `${d} dia${d > 1 ? "s" : ""}`;
}

/** A linha de resumo da tela fechada: o essencial sem abrir o detalhe. */
export function descricaoDaTela(tela: TelaNoPainel): string {
  if (tela.revogadoEm) return "revogada: volta ao código de pareamento se reconectar";
  const partes: string[] = [tela.estado === "online" ? "no ar" : "sem pulso"];
  if (ehAgente(tela)) {
    // Um agente não exibe nada: o que ele tem para contar é quantos aparelhos
    // alcança. Zero é informação — é agente instalado onde ainda não há nada.
    const n = aparelhosDoAgente(tela).length;
    partes.push(n === 1 ? "1 aparelho na LAN" : `${n} aparelhos na LAN`);
  } else {
    const exibindo = tela.pulso?.exibindo;
    if (tela.estado === "online" && exibindo) partes.push(exibindo);
  }
  if (tela.saude?.amostras) partes.push(formatarDisponibilidade(tela.saude.disponibilidade));
  const versao = versaoDaTela(tela);
  if (versao) partes.push(`v${versao}`);
  return partes.join(" · ");
}

/** Quanto falta para o código na tela expirar. Dez minutos, do protocolo. */
export function minutosParaExpirar(pendente: PendenteDoAgente, agora: Date): number {
  return Math.max(0, Math.round((Date.parse(pendente.expiraEm) - agora.getTime()) / 60_000));
}

/**
 * A procedência de cada número desta tela.
 *
 * Regra da casa: número sem evidência não entra (CLAUDE.md). Aqui ela tem um
 * recado a mais — nada disto sai do banco do Ávila OS. É leitura direta do
 * agente a cada carga da página, e a folha precisa dizer isso para ninguém
 * procurar a tabela que não existe.
 */
export function evidenciaDoAgente(
  rotulo: string,
  detalhes: { formula: string; lidoEm: string; caminho: string; bruto?: unknown },
): Evidencia {
  return {
    rotulo,
    origem: `tv.avilaops.com ${detalhes.caminho}`,
    funcao: "lerPainelDeTelas() em src/lib/avila-tv.ts",
    formula: detalhes.formula,
    lidoEm: detalhes.lidoEm,
    bruto: detalhes.bruto,
    observacao:
      "Leitura direta do agente Ávila TV a cada carga desta tela. O Ávila OS não guarda cópia do estado das telas: " +
      "o pulso vive na memória do gateway e a telemetria, em arquivo no disco do agente.",
  };
}

/** O inventário que o pulso do agente carrega, ou vazio. */
export function aparelhosDoAgente(tela: TelaNoPainel): Array<{ id: string; tipo: string; recursos: string[] }> {
  return Array.isArray(tela.pulso?.dispositivos) ? tela.pulso.dispositivos : [];
}

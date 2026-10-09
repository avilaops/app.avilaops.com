import type { Evidencia } from "@/lib/evidencia";
import type { LojaDaPlataforma, RotinaDaPlataforma, SaudeDasRotinas } from "@/lib/lojas-plataforma";

/**
 * O acompanhamento das lojas dos clientes, do lado de cá.
 *
 * A plataforma `lojas.avilaops.com` é dona do estado das lojas — quem está no
 * ar, quantos produtos, quantos pedidos. O Ávila OS é dono de quem é o
 * cliente. Nenhum dos dois sabe o suficiente sozinho: a plataforma não sabe
 * que a `brilhax` é da Brilhax Automotiva, e o OS não sabe que a vitrine dela
 * está no ar com o catálogo vazio.
 *
 * Este módulo cruza os dois e **não guarda cópia de nada**: é leitura a cada
 * carga de tela, pelo mesmo motivo que o painel do Mercado Pago não guarda —
 * cópia desatualizada de estado de negócio é pior que ausência dele.
 *
 * Tudo aqui é função pura, com `agora` recebido em vez de lido do relógio: a
 * regra que decide se um provisionamento travou tem que dar para testar sem
 * esperar um dia passar.
 */

export type ClienteVinculado = { id: string; nome: string };

/** O vínculo que o Ávila OS guarda: `OrganizationIntegration` de `lojas_avilaops`. */
export type VinculoDeLoja = { slug: string; cliente: ClienteVinculado };

export type LojaNoPainel = LojaDaPlataforma & {
  /** Nulo quando nenhuma ficha do OS reivindica esta loja. */
  cliente: ClienteVinculado | null;
};

export type Gravidade = "atencao" | "erro";

export type Alerta = {
  gravidade: Gravidade;
  titulo: string;
  /** O que fazer a respeito, não só o que está errado. */
  detalhe: string;
};

/** Horas desde um instante ISO, ou null quando a data não veio ou não é data. */
export function horasDesde(iso: string | null | undefined, agora: Date): number | null {
  if (!iso) return null;
  const instante = new Date(iso).getTime();
  if (Number.isNaN(instante)) return null;
  return Math.max(0, agora.getTime() - instante) / (60 * 60 * 1000);
}

/**
 * Junta a lista da plataforma com os vínculos do OS.
 *
 * A plataforma é a lista mestra: loja que existe lá aparece aqui mesmo sem
 * cliente vinculado — e aparecer é o ponto, porque loja sem dono no OS é
 * justamente o que ninguém descobre olhando só a ficha do cliente.
 */
export function juntarLojasComClientes(
  lojas: LojaDaPlataforma[],
  vinculos: VinculoDeLoja[],
): LojaNoPainel[] {
  const porSlug = new Map(vinculos.map((v) => [v.slug, v.cliente]));
  return lojas.map((loja) => ({ ...loja, cliente: porSlug.get(loja.slug) ?? null }));
}

/**
 * O que precisa de gente nesta loja.
 *
 * Só entra alerta com caminho: dizer "suspensa" sem dizer que o lojista está
 * sem vender hoje não faz ninguém agir. E só entra o que é mesmo problema —
 * loja recém-criada ainda provisionando é o fluxo normal, não pendência.
 */
export function alertasDaLoja(loja: LojaNoPainel, agora: Date = new Date()): Alerta[] {
  const alertas: Alerta[] = [];

  if (loja.status === "SUSPENSA") {
    alertas.push({
      gravidade: "erro",
      titulo: "Loja suspensa",
      detalhe: "A vitrine está fora do ar e o lojista não vende hoje. Ver a cobrança no Mercado Pago.",
    });
  }

  // Provisionamento é questão de segundos na plataforma. Um dia parado aí é
  // DNS que não propagou ou passo que falhou — não é fila.
  const provisionando = horasDesde(loja.criadoEm, agora);
  if (loja.status === "PROVISIONANDO" && provisionando !== null && provisionando > 24) {
    alertas.push({
      gravidade: "erro",
      titulo: "Provisionamento parado",
      detalhe: `Criada há ${Math.floor(provisionando / 24)} dia(s) e ainda configurando. Algum passo do provisionamento falhou.`,
    });
  }

  if (loja.status === "ATIVA" && loja._count.produtos === 0) {
    alertas.push({
      gravidade: "erro",
      titulo: "No ar sem catálogo",
      detalhe: "A loja responde no domínio e não tem nenhum produto. Quem entrar vê vitrine vazia.",
    });
  }

  if (loja.tentativasFalhas > 0) {
    alertas.push({
      gravidade: "atencao",
      titulo: `Cobrança recusada ${loja.tentativasFalhas}x`,
      detalhe: "O cartão da assinatura está recusando. Sem acerto, a varredura suspende a loja.",
    });
  }

  // Assinatura criada e nunca autorizada: o link do cartão foi mandado e
  // ninguém preencheu. Uma semana é o prazo em que ainda adianta cobrar.
  const criada = horasDesde(loja.criadoEm, agora);
  if (loja.assinaturaStatus === "pending" && criada !== null && criada > 7 * 24) {
    alertas.push({
      gravidade: "atencao",
      titulo: "Assinatura nunca autorizada",
      detalhe: "A assinatura foi criada mas o cartão nunca foi preenchido. Reenviar o link ao lojista.",
    });
  }

  if (!loja.cliente) {
    alertas.push({
      gravidade: "atencao",
      titulo: "Sem cliente vinculado",
      detalhe: "Esta loja existe na plataforma e nenhuma ficha do Ávila OS a reivindica.",
    });
  }

  return alertas;
}

/** Em que bloco da tela esta loja entra. A ordem é a da lista. */
export type Faixa = "atencao" | "no-ar" | "configurando" | "encerradas";

export const FAIXAS: { chave: Faixa; titulo: string }[] = [
  { chave: "atencao", titulo: "Precisam de gente" },
  { chave: "no-ar", titulo: "No ar" },
  { chave: "configurando", titulo: "Configurando" },
  { chave: "encerradas", titulo: "Encerradas" },
];

export function faixaDaLoja(loja: LojaNoPainel, agora: Date = new Date()): Faixa {
  if (alertasDaLoja(loja, agora).some((a) => a.gravidade === "erro")) return "atencao";
  if (loja.status === "CANCELADA") return "encerradas";
  if (loja.status === "PROVISIONANDO") return "configurando";
  return "no-ar";
}

/**
 * As lojas separadas por bloco, com cabeçalho — o jeito de uma lista de iOS
 * dizer por que a ordem é aquela. Bloco vazio não aparece: seção com título e
 * nada dentro é ruído.
 */
export function agruparPorFaixa(
  lojas: LojaNoPainel[],
  agora: Date = new Date(),
): { chave: Faixa; titulo: string; lojas: LojaNoPainel[] }[] {
  return FAIXAS.map((faixa) => ({
    ...faixa,
    lojas: lojas
      .filter((loja) => faixaDaLoja(loja, agora) === faixa.chave)
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
  })).filter((bloco) => bloco.lojas.length > 0);
}

/**
 * As lojas organizadas por cliente, pelo vínculo que o Ávila OS guarda.
 *
 * Quem tem mais de uma loja aparece com todas juntas. Loja sem vínculo vai
 * para um grupo próprio, no fim — a tela não adivinha de quem ela é.
 */
export function agruparPorCliente(lojas: LojaNoPainel[]): { chave: string; titulo: string; lojas: LojaNoPainel[] }[] {
  const grupos = new Map<string, { chave: string; titulo: string; lojas: LojaNoPainel[] }>();
  for (const loja of lojas) {
    const chave = loja.cliente ? `cliente-${loja.cliente.id}` : "sem-cliente";
    const grupo = grupos.get(chave) ?? { chave, titulo: loja.cliente?.nome ?? "Sem cliente vinculado", lojas: [] };
    grupo.lojas.push(loja);
    grupos.set(chave, grupo);
  }
  return [...grupos.values()]
    .map((g) => ({ ...g, lojas: g.lojas.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")) }))
    .sort((a, b) => {
      if ((a.chave === "sem-cliente") !== (b.chave === "sem-cliente")) return a.chave === "sem-cliente" ? 1 : -1;
      return a.titulo.localeCompare(b.titulo, "pt-BR");
    });
}

/** Busca por nome da loja, endereço ou nome do cliente — o que se tem na mão. */
export function filtrarLojas(lojas: LojaNoPainel[], busca: string): LojaNoPainel[] {
  const q = busca.trim().toLowerCase();
  if (!q) return lojas;
  return lojas.filter((loja) =>
    `${loja.nome} ${loja.slug} ${loja.dominioPrincipal ?? ""} ${loja.cliente?.nome ?? ""}`
      .toLowerCase()
      .includes(q),
  );
}

export type ResumoLojas = {
  total: number;
  noAr: number;
  suspensas: number;
  configurando: number;
  canceladas: number;
  produtos: number;
  pedidos: number;
  semCliente: number;
  /** Lojas com ao menos um alerta de gravidade `erro`. */
  comProblema: number;
};

export function resumirLojas(lojas: LojaNoPainel[], agora: Date = new Date()): ResumoLojas {
  return {
    total: lojas.length,
    noAr: lojas.filter((l) => l.status === "ATIVA").length,
    suspensas: lojas.filter((l) => l.status === "SUSPENSA").length,
    configurando: lojas.filter((l) => l.status === "PROVISIONANDO").length,
    canceladas: lojas.filter((l) => l.status === "CANCELADA").length,
    produtos: lojas.reduce((soma, l) => soma + l._count.produtos, 0),
    pedidos: lojas.reduce((soma, l) => soma + l._count.pedidos, 0),
    semCliente: lojas.filter((l) => !l.cliente).length,
    comProblema: lojas.filter((l) => alertasDaLoja(l, agora).some((a) => a.gravidade === "erro")).length,
  };
}

/**
 * Plano contratado, no vocabulário da tabela de preços.
 *
 * Fica aqui e não no mapa de status da casa porque plano **não é status**: é
 * o produto que o cliente comprou, e "Loja Pro" é nome comercial, com a
 * maiúscula que o mapa de status proíbe de propósito nos seus rótulos.
 */
const PLANOS: Record<string, string> = {
  SITE: "Site",
  LOJA: "Loja",
  LOJA_PRO: "Loja Pro",
};

export function rotuloDoPlano(plano: string): string {
  return PLANOS[plano] ?? plano;
}

/** Endereço público da loja, na mesma regra que a plataforma usa. */
export function enderecoDaLoja(loja: { slug: string; dominioPrincipal: string | null }): string {
  return `https://${loja.dominioPrincipal ?? `${loja.slug}.lojas.avilaops.com`}`;
}

/* ────────────────────── vínculo com o cliente ────────────────────── */

/** Um cliente do Ávila OS, no mínimo que o casamento precisa. */
export type ClienteCandidato = { id: string; nome: string; slug: string };

export type Sugestao = {
  cliente: ClienteCandidato;
  /** Por que este e não outro — a frase que a tela mostra antes de confirmar. */
  motivo: string;
  /** `exato` é slug idêntico; `provavel` é nome igual; `fraco` é nome contido. */
  forca: "exato" | "provavel" | "fraco";
};

/** Tira acento, caixa e pontuação: "Brilhax Automotiva LTDA." e "brilhax-automotiva" viram comparáveis. */
function chave(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(ltda|me|epp|eireli|sa|s\/a)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Quem provavelmente é o dono desta loja.
 *
 * **Sugere, nunca grava.** O vínculo decide de quem é a receita, em qual ficha
 * o pedido aparece e para quem a cobrança vai — e depois de gravado vira
 * verdade para o resto do sistema. Um palpite plausível gravado sozinho é o
 * tipo de erro que ninguém descobre até a venda de um cliente aparecer na
 * ficha de outro. Por isso a função devolve motivo e força: quem confirma é
 * gente, e gente precisa saber por que aquele nome foi oferecido.
 *
 * Devolve `null` quando nada casa — em branco é melhor que um palpite ruim.
 */
export function sugerirCliente(
  loja: { slug: string; nome: string },
  clientes: ClienteCandidato[],
): Sugestao | null {
  const slugDaLoja = chave(loja.slug);
  const nomeDaLoja = chave(loja.nome);

  const porSlug = clientes.find((c) => chave(c.slug) === slugDaLoja);
  if (porSlug) return { cliente: porSlug, motivo: `O slug da loja e o do cliente são o mesmo: ${loja.slug}`, forca: "exato" };

  const porNome = clientes.find((c) => chave(c.nome) === nomeDaLoja);
  if (porNome) return { cliente: porNome, motivo: `O nome do cliente é igual ao da loja: ${loja.nome}`, forca: "provavel" };

  // Contido dos dois lados: "Brilhax" (loja) dentro de "Brilhax Automotiva"
  // (cliente), e o contrário. Exige pelo menos quatro letras para "FX" não
  // casar com metade da carteira.
  if (nomeDaLoja.length >= 4) {
    const contido = clientes.find((c) => {
      const nomeDoCliente = chave(c.nome);
      return nomeDoCliente.length >= 4 && (nomeDoCliente.includes(nomeDaLoja) || nomeDaLoja.includes(nomeDoCliente));
    });
    if (contido) return { cliente: contido, motivo: `"${contido.nome}" e "${loja.nome}" têm o mesmo nome dentro`, forca: "fraco" };
  }

  return null;
}

/* O catálogo (filtros, ordenação, agrupamento, paginação e indicadores) mora
   em `lojas-catalogo.ts`, que trabalha sobre a lista enxuta da plataforma. */

/* ─────────────────────────── evidência ─────────────────────────── */

/**
 * A procedência de todo número desta área. A regra da casa é que número na
 * tela abre a evidência; aqui a fonte é sempre a mesma API, então a folha se
 * monta de um lugar só em vez de repetir origem em cada chamada.
 */
export function evidenciaDaPlataforma(
  rotulo: string,
  detalhes: { formula?: string; lidoEm: string; bruto?: unknown; caminho: string; funcao: string },
): Evidencia {
  return {
    rotulo,
    origem: `lojas.avilaops.com ${detalhes.caminho}`,
    funcao: `${detalhes.funcao} em src/lib/lojas-plataforma.ts`,
    formula: detalhes.formula,
    lidoEm: detalhes.lidoEm,
    bruto: detalhes.bruto,
    observacao:
      "Leitura direta da plataforma de lojas a cada carga desta tela. O Ávila OS não guarda cópia deste estado.",
  };
}

/* ─────────────────────────── rotinas ─────────────────────────── */

/**
 * O que roda sozinho na plataforma, do lado de cá.
 *
 * Quem decide se uma rotina está atrasada ou falhando é a própria plataforma
 * (`emAtraso`, `falhando`, `saudavel` vêm prontos): recalcular isso aqui
 * significaria repetir a cadência e o fuso em dois lugares e vê-los
 * discordar no primeiro deploy. Esta tela lê e ordena, não julga.
 */
export type ResumoDasRotinas = {
  total: number;
  /** Nem atrasada nem falhando — o estado em que ninguém precisa olhar. */
  emPaz: number;
  comProblema: number;
  /** As que precisam de gente, primeiro a pior. */
  problemas: RotinaDaPlataforma[];
  /** Quando a plataforma rodou alguma coisa pela última vez. */
  ultimaAtividadeEm: string | null;
  /** `false` quando o relógio está desligado neste container. */
  agendadorLigado: boolean;
};

export function resumirRotinas(saude: SaudeDasRotinas | null): ResumoDasRotinas {
  const rotinas = saude?.rotinas ?? [];
  const problemas = ordenarRotinas(rotinas).filter((r) => !r.saudavel);
  const datas = rotinas.map((r) => r.ultimaEm).filter((d): d is string => Boolean(d));
  return {
    total: rotinas.length,
    emPaz: rotinas.filter((r) => r.saudavel).length,
    comProblema: problemas.length,
    problemas,
    ultimaAtividadeEm: datas.length ? datas.reduce((a, b) => (a > b ? a : b)) : null,
    agendadorLigado: saude?.agendador.ligado ?? false,
  };
}

/** Falhando na frente, depois atrasada, depois pela ordem do catálogo. */
export function ordenarRotinas(rotinas: RotinaDaPlataforma[]): RotinaDaPlataforma[] {
  const peso = (r: RotinaDaPlataforma) => (r.falhando ? 0 : r.emAtraso ? 1 : 2);
  return [...rotinas].sort((a, b) => peso(a) - peso(b));
}

/**
 * O nome curto da rotina, para o título da linha.
 *
 * A plataforma manda `titulo` desde 19/09/2026; antes disso só havia a frase
 * inteira, que num celular sai cortada em "Gera e publica em lote o …". Sem o
 * campo a tela mostra o que tem, em vez de linha sem título.
 */
export function tituloDaRotina(rotina: RotinaDaPlataforma): string {
  return rotina.titulo?.trim() || rotina.descricao;
}

/** Vermelho pede gente agora, amarelo pede olhada, azul está em paz. */
export function tomDaRotina(rotina: RotinaDaPlataforma): "vermelho" | "amarelo" | "azul" {
  if (rotina.falhando) return "vermelho";
  return rotina.emAtraso ? "amarelo" : "azul";
}

/**
 * A frase de uma linha que resume o estado da rotina.
 *
 * Só o estado, sem repetir a cadência: ela já é a coluna de trás e aparece
 * aberta na dobra. "toda segunda às 07:00 · ainda não venceu — toda segunda às
 * 07:00" foi o que a primeira versão desta tela escreveu.
 *
 * Rotina que nunca rodou **não** é rotina com problema: é rotina que ainda não
 * venceu (o relatório semanal, numa quarta-feira). Dizer "nunca rodou" em
 * vermelho ensinaria a ignorar o vermelho.
 */
export function situacaoDaRotina(rotina: RotinaDaPlataforma, agora: Date): string {
  if (rotina.executandoDesde) return "rodando agora";
  if (rotina.falhando) {
    return `falhou ${contarFalhas(rotina.falhasSeguidas)}`;
  }
  if (rotina.emAtraso) return `atrasada — devia ter rodado ${haQuantoTempo(rotina.proximaEm, agora)}`;
  if (!rotina.ultimaEm) return "ainda não venceu";
  return `rodou ${haQuantoTempo(rotina.ultimaEm, agora)}`;
}

/**
 * "e de novo quando?" — a pergunta que sobra depois de "rodou?".
 *
 * `null` quando a própria situação já respondeu: numa rotina atrasada o
 * horário da próxima execução **é** o que já passou, e a linha diria "atrasada
 * — devia ter rodado há 2 h" com um "há 2 h" colado ao lado.
 */
export function proximaLegivel(rotina: RotinaDaPlataforma, agora: Date): string | null {
  if (rotina.emAtraso || rotina.executandoDesde) return null;
  // Venceu agora há pouco e ainda não é atraso: a passada do agendador é de um
  // minuto, então a resposta honesta não é "há 1 min" — é que está para sair.
  if (new Date(rotina.proximaEm).getTime() <= agora.getTime()) return "a qualquer momento";
  return haQuantoTempo(rotina.proximaEm, agora);
}

function contarFalhas(n: number): string {
  return n === 1 ? "na última execução" : `nas últimas ${n} execuções`;
}

/**
 * "há 3 min", "há 2 h", "ontem" — tempo relativo, que é como se lê frescor.
 *
 * "19 de set., 04:27" obriga quem lê a fazer a subtração de cabeça para
 * responder a única pergunta que importa numa tela de rotina: isso é recente?
 * Acima de uma semana a data absoluta volta, porque aí "há 23 dias" é que
 * vira a conta difícil.
 */
export function haQuantoTempo(quando: string | Date, agora: Date): string {
  const ms = agora.getTime() - new Date(quando).getTime();
  const futuro = ms < 0;
  const abs = Math.abs(ms);
  const min = Math.round(abs / 60_000);
  if (min < 1) return futuro ? "em instantes" : "agora mesmo";
  const prefixo = futuro ? "em" : "há";
  if (min < 60) return `${prefixo} ${min} min`;
  const horas = Math.round(min / 60);
  if (horas < 24) return `${prefixo} ${horas} h`;
  const dias = Math.round(horas / 24);
  if (dias === 1) return futuro ? "amanhã" : "ontem";
  if (dias <= 7) return `${prefixo} ${dias} dias`;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(quando));
}

/** "2,3 s" / "412 ms" — duração na unidade em que ela se lê. */
export function duracaoLegivel(ms: number | null): string | null {
  if (ms === null) return null;
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} s`;
}

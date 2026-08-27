import {
  buscarConfiguracaoWebhook,
  buscarConta,
  listarAssinaturas,
  listarPagamentos,
  mercadoPagoConfigurado,
  type Assinatura,
  type ConfiguracaoWebhook,
  type ContaMercadoPago,
  type PagamentoRecebido,
} from "./mercadopago";
import { listarLojas, type LojaDaPlataforma } from "./lojas-plataforma";

/**
 * O cruzamento entre o Mercado Pago e a plataforma de lojas.
 *
 * Sozinha, cada fonte engana: o MP diz que a assinatura está autorizada mas
 * não sabe se a loja está no ar; a plataforma diz que a loja está ativa mas
 * não sabe se o cartão passou. **O valor deste painel é a diferença entre as
 * duas** — e é justamente ela que ninguém veria olhando um lado só.
 */

/** URL que o webhook da aplicação precisa ter para as faturas chegarem na hora. */
export const WEBHOOK_ESPERADO = "https://lojas.avilaops.com/api/webhooks/mercadopago-assinatura";

export type Gravidade = "ok" | "atencao" | "erro";

export interface Divergencia {
  gravidade: Gravidade;
  titulo: string;
  detalhe: string;
}

export interface LinhaAssinatura {
  /** Presente quando o Mercado Pago conhece a assinatura. */
  mp: Assinatura | null;
  /** Presente quando a plataforma conhece a loja. */
  loja: LojaDaPlataforma | null;
  divergencias: Divergencia[];
}

export interface PainelMercadoPago {
  configurado: boolean;
  conta: ContaMercadoPago | null;
  webhook: ConfiguracaoWebhook | null;
  saudeWebhook: Divergencia | null;
  linhas: LinhaAssinatura[];
  pagamentos: PagamentoRecebido[];
  /** Falhas de leitura por fonte: a tela mostra o que deu para carregar. */
  falhas: string[];
  receitaMensalCentavos: number;
}

const STATUS_MP_PARA_NOSSO: Record<string, string> = {
  pending: "PENDENTE",
  authorized: "AUTORIZADA",
  paused: "PAUSADA",
  cancelled: "CANCELADA",
};

function conferirWebhook(w: ConfiguracaoWebhook | null): Divergencia | null {
  if (!w) {
    return {
      gravidade: "atencao",
      titulo: "Não consegui ler a aplicação",
      detalhe: "Falta MP_CLIENT_ID no ambiente. Sem isso não dá para diagnosticar o webhook daqui.",
    };
  }
  if (w.url !== WEBHOOK_ESPERADO) {
    return {
      gravidade: "erro",
      titulo: "Webhook apontando para o lugar errado",
      detalhe: `Está em ${w.url ?? "(vazio)"}. Deveria ser ${WEBHOOK_ESPERADO}. Enquanto isso, as faturas só aparecem na varredura do dia seguinte.`,
    };
  }
  const assinaturaOuvida = w.topicos.some((t) => t.includes("subscription") || t.includes("preapproval") || t === "plan");
  if (!assinaturaOuvida) {
    return {
      gravidade: "erro",
      titulo: "Webhook não escuta eventos de assinatura",
      detalhe: `Tópicos ativos: ${w.topicos.join(", ") || "nenhum"}. Marque "Planos e assinaturas" no painel do Mercado Pago.`,
    };
  }
  return null;
}

function conferirLinha(mp: Assinatura | null, loja: LojaDaPlataforma | null): Divergencia[] {
  const fora: Divergencia[] = [];

  if (mp && !loja) {
    fora.push({
      gravidade: "atencao",
      titulo: "Assinatura sem loja",
      detalhe: `O Mercado Pago cobra por "${mp.loja ?? "sem referência"}", mas não existe loja com esse slug. Pode ser teste antigo — vale cancelar.`,
    });
    return fora;
  }

  if (loja && !mp) {
    if (loja.assinaturaId) {
      fora.push({
        gravidade: "erro",
        titulo: "Assinatura sumiu do Mercado Pago",
        detalhe: `A loja guarda o id ${loja.assinaturaId}, mas ele não aparece na conta. Ou foi apagada, ou está em outra conta.`,
      });
    }
    return fora;
  }

  if (!mp || !loja) return fora;

  const esperado = STATUS_MP_PARA_NOSSO[mp.status];
  if (esperado && loja.assinaturaStatus !== esperado) {
    fora.push({
      gravidade: "erro",
      titulo: "Estados divergentes",
      detalhe: `No Mercado Pago está "${mp.status}" (${esperado}); na plataforma está "${loja.assinaturaStatus}". A varredura diária corrige, mas vale entender por quê.`,
    });
  }

  if (mp.status === "authorized" && loja.status === "SUSPENSA") {
    fora.push({
      gravidade: "erro",
      titulo: "Cliente pagando com a loja suspensa",
      detalhe: "A assinatura está ativa no Mercado Pago e a loja está fora do ar. É o pior caso possível: ele paga e não vende.",
    });
  }

  if (mp.status === "cancelled" && loja.status === "ATIVA") {
    fora.push({
      gravidade: "atencao",
      titulo: "Loja no ar sem assinatura ativa",
      detalhe: "O Mercado Pago cancelou a cobrança e a loja continua vendendo. A varredura suspende ao fim da tolerância.",
    });
  }

  if (loja.tentativasFalhas > 0) {
    fora.push({
      gravidade: "atencao",
      titulo: `${loja.tentativasFalhas} cobrança(s) recusada(s)`,
      detalhe: "O lojista já foi avisado pela régua. A partir da segunda recusa entra tarefa no Todoist.",
    });
  }

  return fora;
}

export async function montarPainel(): Promise<PainelMercadoPago> {
  const falhas: string[] = [];

  if (!mercadoPagoConfigurado()) {
    return {
      configurado: false,
      conta: null,
      webhook: null,
      saudeWebhook: null,
      linhas: [],
      pagamentos: [],
      falhas: ["MP_ACCESS_TOKEN não está configurado neste ambiente."],
      receitaMensalCentavos: 0,
    };
  }

  // Uma fonte fora do ar não pode apagar a tela inteira: o que carregou aparece.
  const [conta, webhook, assinaturas, pagamentos, lojas] = await Promise.all([
    buscarConta().catch((e) => {
      falhas.push(`conta: ${e instanceof Error ? e.message : e}`);
      return null;
    }),
    buscarConfiguracaoWebhook().catch(() => null),
    listarAssinaturas({ limite: 100 }).catch((e) => {
      falhas.push(`assinaturas: ${e instanceof Error ? e.message : e}`);
      return { total: 0, assinaturas: [] as Assinatura[] };
    }),
    listarPagamentos(30).catch((e) => {
      falhas.push(`pagamentos: ${e instanceof Error ? e.message : e}`);
      return [] as PagamentoRecebido[];
    }),
    listarLojas().catch((e) => {
      falhas.push(`plataforma de lojas: ${e instanceof Error ? e.message : e}`);
      return [] as LojaDaPlataforma[];
    }),
  ]);

  const porSlug = new Map(lojas.map((l) => [l.slug, l]));
  const usadas = new Set<string>();

  const linhas: LinhaAssinatura[] = assinaturas.assinaturas.map((mp) => {
    const loja = (mp.loja && porSlug.get(mp.loja)) || null;
    if (loja) usadas.add(loja.slug);
    return { mp, loja, divergencias: conferirLinha(mp, loja) };
  });

  // Lojas que a plataforma conhece e o Mercado Pago não — inclusive as que
  // ainda estão no período de teste, que é informação de cobrança também.
  for (const loja of lojas) {
    if (usadas.has(loja.slug)) continue;
    linhas.push({ mp: null, loja, divergencias: conferirLinha(null, loja) });
  }

  const ordem: Record<Gravidade, number> = { erro: 0, atencao: 1, ok: 2 };
  linhas.sort((a, b) => {
    const pior = (l: LinhaAssinatura) => Math.min(...l.divergencias.map((d) => ordem[d.gravidade]), ordem.ok);
    return pior(a) - pior(b);
  });

  const receitaMensalCentavos = linhas
    .filter((l) => l.mp?.status === "authorized")
    .reduce((s, l) => s + (l.mp?.valorCentavos ?? 0), 0);

  return {
    configurado: true,
    conta,
    webhook,
    saudeWebhook: conferirWebhook(webhook),
    linhas,
    pagamentos,
    falhas,
    receitaMensalCentavos,
  };
}

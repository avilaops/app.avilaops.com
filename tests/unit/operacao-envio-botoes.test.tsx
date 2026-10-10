import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Os quatro botões de envio de cobrança da ficha do cliente, clicados.
 *
 * `pedidoDeEnvio` já é testada como função pura; faltava provar a ligação
 * botão → modo. Trocar "teste" por "cliente" num `onClick` mandaria a mensagem
 * ao cliente real pelo botão de teste, e nenhum teste caía.
 *
 * O projeto não tem DOM de teste (jsdom): o painel é renderizado de verdade no
 * servidor e o `onClick` de cada botão é capturado na criação do elemento, pelo
 * runtime de JSX. Clicar é chamar esse `onClick` — o mesmo código que o
 * navegador chamaria — com `prompt`, `confirm` e `fetch` simulados.
 *
 * Para ver o que o painel mostra DEPOIS do clique, o `useState` guarda o que os
 * `set...` receberam (render no servidor não tem segunda renderização); renderizar
 * de novo com esse estado é o que o navegador faria sozinho.
 */

type Botao = { rotulo: string; onClick: () => unknown };

const { botoes, memoria } = vi.hoisted(() => ({
  botoes: [] as { rotulo: string; onClick: () => unknown }[],
  /** O estado do painel entre uma renderização e outra, pela ordem dos `useState`. */
  memoria: { valores: new Map<number, unknown>(), cursor: 0 },
}));

function capturando<T extends (tipo: unknown, props: Record<string, unknown>, ...resto: unknown[]) => unknown>(criar: T): T {
  return ((tipo, props, ...resto) => {
    if (tipo === "button" && typeof props?.onClick === "function" && typeof props.children === "string") {
      botoes.push({ rotulo: props.children.trim(), onClick: props.onClick as () => unknown });
    }
    return criar(tipo, props, ...resto);
  }) as T;
}

vi.mock("react/jsx-runtime", async (original) => {
  const real = await original<typeof import("react/jsx-runtime")>();
  return { ...real, jsx: capturando(real.jsx as never), jsxs: capturando(real.jsxs as never) };
});
vi.mock("react/jsx-dev-runtime", async (original) => {
  const real = await original<typeof import("react/jsx-dev-runtime")>();
  return { ...real, jsxDEV: capturando(real.jsxDEV as never) };
});
vi.mock("react", async (original) => {
  const real = await original<typeof import("react")>();
  return {
    ...real,
    useState: (inicial: unknown) => {
      const indice = memoria.cursor++;
      const [doReact] = real.useState(inicial);
      const atual = () => (memoria.valores.has(indice) ? memoria.valores.get(indice) : doReact);
      const gravar = (novo: unknown) =>
        memoria.valores.set(indice, typeof novo === "function" ? (novo as (antes: unknown) => unknown)(atual()) : novo);
      return [atual(), gravar];
    },
  };
});
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined }) }));

const { default: OperacaoPanel } = await import("@/components/OperacaoPanel");

const COBRANCA = { id: "cobranca-1", method: "PIX", status: "PENDING", pixCopyPaste: "000201", boletoUrl: null, boletoBarcode: null, expiresAt: null };

function fatura(cobranca: typeof COBRANCA | null) {
  return { id: "fatura-1", competence: "2026-09", kind: "MONTHLY", amountCents: 29900, dueDate: "2026-09-10", status: "OPEN", paidAt: null, cobranca };
}

/** Renderiza a ficha com uma fatura e devolve os botões de envio dela. */
function renderizar(
  cobranca: typeof COBRANCA | null = COBRANCA,
  status = "OPEN",
  manterEstado = false,
): { html: string; botao: (rotulo: string) => Botao } {
  botoes.length = 0;
  if (!manterEstado) memoria.valores.clear();
  memoria.cursor = 0;
  const html = renderToStaticMarkup(
    <OperacaoPanel
      organizationId="org-1"
      nomeCliente="Cliente Teste"
      assinaturas={[
        {
          id: "assinatura-1",
          description: "Mensalidade",
          amountCents: 29900,
          currency: "BRL",
          billingDay: 10,
          billingCycle: "MONTHLY",
          status: "ACTIVE",
          startedAt: "2026-09-01",
          productKey: null,
          productTenantId: null,
          salesCommissionPercent: null,
          invoices: [{ ...fatura(cobranca), status }],
        },
      ]}
      planos={[]}
      marcas={[]}
      credenciais={[]}
      etapas={[]}
      cofreDisponivel={false}
      clienteNoBrasil
    />,
  );
  return {
    html,
    botao: (rotulo) => {
      const achados = botoes.filter((b) => b.rotulo === rotulo);
      expect(achados, `botão "${rotulo}"`).toHaveLength(1);
      return achados[0];
    },
  };
}

/** O painel como fica depois do clique, sem os comentários que o React põe entre os textos. */
const depoisDoClique = () => renderizar(COBRANCA, "OPEN", true).html.replace(/<!-- -->/g, "");

type Chamada = { url: string; method: string; corpo: unknown };
/** O que a rota de envio responde (sempre 200 aqui: a mensagem saiu). */
let resposta: Record<string, unknown> = {};
let chamadas: Chamada[] = [];
let prompts: string[] = [];
let confirmacoes: string[] = [];

/** Simula o navegador: respostas do `prompt` na ordem, e a do `confirm`. */
function navegador(opcoes: { prompt?: (string | null)[]; confirm?: boolean } = {}) {
  const respostas = [...(opcoes.prompt ?? [])];
  vi.stubGlobal("window", {
    prompt: (texto: string) => {
      prompts.push(texto);
      return respostas.length ? respostas.shift() : null;
    },
    confirm: (texto: string) => {
      confirmacoes.push(texto);
      return opcoes.confirm ?? false;
    },
  });
}

beforeEach(() => {
  chamadas = [];
  prompts = [];
  confirmacoes = [];
  resposta = { ok: true, destino: "x", registrado: true };
  vi.stubGlobal("fetch", async (url: string, init: { method: string; body: string }) => {
    chamadas.push({ url, method: init.method, corpo: JSON.parse(init.body) });
    return { ok: true, status: 200, json: async () => resposta };
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const ROTA = "/api/billing/faturas/fatura-1/enviar";

describe("OperacaoPanel — os quatro botões de envio de cobrança", () => {
  it("mostra os quatro, cada um com o seu rótulo", () => {
    const { html, botao } = renderizar();

    for (const rotulo of [
      "Enviar teste por e-mail",
      "Enviar ao cliente por e-mail",
      "Enviar teste por WhatsApp",
      "Enviar ao cliente por WhatsApp",
    ]) {
      expect(html).toContain(rotulo);
      botao(rotulo);
    }
  });

  it('"Enviar teste por e-mail" manda teste: true para o endereço informado, e não pede confirmação de cliente', async () => {
    const { botao } = renderizar();
    navegador({ prompt: ["1", " eu@avilaops.com "] });

    await botao("Enviar teste por e-mail").onClick();

    expect(chamadas).toEqual([
      { url: ROTA, method: "POST", corpo: { canal: "email", conteudo: "cobranca", teste: true, destinoTeste: "eu@avilaops.com" } },
    ]);
    expect(prompts[1]).toContain("Envio de TESTE por email");
    expect(confirmacoes).toEqual([]);
  });

  it('"Enviar ao cliente por e-mail" manda teste: false, sem destino de teste, depois da confirmação', async () => {
    const { botao } = renderizar();
    navegador({ prompt: ["3"], confirm: true });

    await botao("Enviar ao cliente por e-mail").onClick();

    expect(chamadas).toEqual([{ url: ROTA, method: "POST", corpo: { canal: "email", conteudo: "ambos", teste: false } }]);
    expect(confirmacoes).toEqual(["Enviar esta cobrança por email ao CLIENTE REAL agora?"]);
    // Só a escolha do conteúdo: o envio real nunca pergunta destino.
    expect(prompts).toHaveLength(1);
  });

  it('"Enviar teste por WhatsApp" manda teste: true pelo canal whatsapp', async () => {
    const { botao } = renderizar();
    navegador({ prompt: ["2", "5511999990000"] });

    await botao("Enviar teste por WhatsApp").onClick();

    expect(chamadas).toEqual([
      { url: ROTA, method: "POST", corpo: { canal: "whatsapp", conteudo: "fatura", teste: true, destinoTeste: "5511999990000" } },
    ]);
    expect(confirmacoes).toEqual([]);
  });

  it('"Enviar ao cliente por WhatsApp" manda teste: false pelo canal whatsapp', async () => {
    const { botao } = renderizar();
    navegador({ prompt: ["1"], confirm: true });

    await botao("Enviar ao cliente por WhatsApp").onClick();

    expect(chamadas).toEqual([{ url: ROTA, method: "POST", corpo: { canal: "whatsapp", conteudo: "cobranca", teste: false } }]);
    expect(confirmacoes).toEqual(["Enviar esta cobrança por whatsapp ao CLIENTE REAL agora?"]);
  });

  it("sem confirmar, o botão de cliente não envia nada", async () => {
    const { botao } = renderizar();
    navegador({ prompt: ["1", "1"], confirm: false });

    await botao("Enviar ao cliente por e-mail").onClick();
    await botao("Enviar ao cliente por WhatsApp").onClick();

    expect(confirmacoes).toHaveLength(2);
    expect(chamadas).toEqual([]);
  });

  it("teste com destino em branco ou cancelado não envia nada — e nunca vira envio ao cliente", async () => {
    const { botao } = renderizar();

    navegador({ prompt: ["1", "   "] });
    await botao("Enviar teste por e-mail").onClick();
    navegador({ prompt: ["1", null] });
    await botao("Enviar teste por WhatsApp").onClick();
    // Cancelou já na escolha do conteúdo.
    navegador({ prompt: [null] });
    await botao("Enviar teste por e-mail").onClick();

    expect(chamadas).toEqual([]);
  });

  it("fatura sem cobrança emitida envia o resumo da fatura, sem perguntar o conteúdo", async () => {
    const { botao } = renderizar(null);
    navegador({ prompt: ["eu@avilaops.com"], confirm: true });

    await botao("Enviar teste por e-mail").onClick();
    await botao("Enviar ao cliente por WhatsApp").onClick();

    expect(chamadas.map((c) => c.corpo)).toEqual([
      { canal: "email", conteudo: "fatura", teste: true, destinoTeste: "eu@avilaops.com" },
      { canal: "whatsapp", conteudo: "fatura", teste: false },
    ]);
    expect(prompts).toHaveLength(1);
  });

  it("fatura cancelada não oferece envio nenhum", () => {
    const { html } = renderizar(COBRANCA, "CANCELLED");

    expect(html).not.toContain("Enviar teste por");
    expect(html).not.toContain("Enviar ao cliente por");
    expect(botoes.filter((b) => b.rotulo.startsWith("Enviar "))).toEqual([]);
  });
});

/**
 * A resposta do envio. A mensagem pode ter saído (200) sem o servidor conseguir
 * gravar o desfecho na auditoria: aí vem `registrado: false`, e o painel não
 * pode mostrar um "enviado" limpo.
 */
describe("OperacaoPanel — o que aparece depois do envio", () => {
  const AVISO = "Não consegui gravar o resultado na auditoria: ficou só o registro de que o envio começou.";

  async function enviarAoCliente() {
    const { botao } = renderizar();
    navegador({ prompt: ["1"], confirm: true });
    await botao("Enviar ao cliente por e-mail").onClick();
    expect(chamadas).toHaveLength(1);
    return depoisDoClique();
  }

  it("enviado e registrado: mostra o destino, sem destaque de erro", async () => {
    resposta = { ok: true, destino: "cliente@exemplo.com", registrado: true };

    const html = await enviarAoCliente();

    expect(html).toContain('<div class="prov-result" role="status"><strong>Enviado por email para cliente@exemplo.com.</strong></div>');
    expect(html).not.toContain("prov-result-erro");
  });

  it("registrado: false — mostra o envio E o aviso do servidor, em destaque de erro", async () => {
    resposta = { ok: true, destino: "cliente@exemplo.com", registrado: false, aviso: AVISO };

    const html = await enviarAoCliente();

    expect(html).toContain(
      `<div class="prov-result prov-result-erro" role="status"><strong>Enviado por email para cliente@exemplo.com.</strong> ${AVISO}</div>`,
    );
    expect(html).not.toContain('<div class="prov-result" role="status">');
  });

  it("registrado: false sem texto de aviso ainda avisa, com a frase do painel", async () => {
    resposta = { ok: true, destino: "5511999990000", registrado: false };
    const { botao } = renderizar();
    navegador({ prompt: ["1", "5511999990000"] });

    await botao("Enviar teste por WhatsApp").onClick();

    expect(depoisDoClique()).toContain(
      '<div class="prov-result prov-result-erro" role="status"><strong>Enviado por whatsapp para 5511999990000 (teste).</strong> O registro na auditoria falhou.</div>',
    );
  });
});

describe("OperacaoPanel — pagamento recebido por fora", () => {
  it('"Registrar pagamento" lança a baixa da fatura com a data e o ID do comprovante', async () => {
    const { botao } = renderizar();
    navegador({ prompt: ["2026-10-01", " E00000000202610010000COMPROVANTE1 "] });

    await botao("Registrar pagamento").onClick();

    expect(chamadas).toEqual([
      {
        url: "/api/billing/faturas/fatura-1/baixa",
        method: "POST",
        corpo: { pagoEm: "2026-10-01", comprovante: "E00000000202610010000COMPROVANTE1" },
      },
    ]);
  });

  it("cancelar qualquer uma das duas perguntas não lança nada", async () => {
    const { botao } = renderizar();
    navegador({ prompt: ["2026-10-01", null] });

    await botao("Registrar pagamento").onClick();

    expect(chamadas).toEqual([]);
  });
});

import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RespostaLink, RespostaSaude } from "@/lib/avila-tv";

/**
 * A tela de Telas montada de verdade, com o agente dublado.
 *
 * O que estes testes protegem não é o HTML: é a ordem em que a página põe as
 * telas e o que ela diz quando não tem o que mostrar. Uma parede de telas que
 * lista a que caiu no meio da lista, ou que mostra "0 telas" quando na verdade
 * não conseguiu perguntar, é pior que nenhuma tela.
 */
const estado = vi.hoisted(() => ({ configurado: true, falhar: false, semSaude: false, papel: "OWNER" }));

vi.mock("@/lib/auth", () => ({
  getAdmin: async () => ({ id: "1", nome: "Nicolas Ávila", role: estado.papel, email: "nicolas@avilaops.com" }),
  ehDono: (role: string) => role === "OWNER",
}));

// Sem `await original()`: `avila-tv.ts` importa `server-only`, que só existe
// dentro do bundler do Next.
vi.mock("@/lib/avila-tv", () => {
  class AgenteIndisponivel extends Error {}
  return {
    AgenteIndisponivel,
    agenteConfigurado: () => estado.configurado,
    lerPainelDeTelas: async () => {
      if (estado.falhar) throw new AgenteIndisponivel("Não consegui falar com o agente Ávila TV: o agente demorou demais para responder.");
      return { lidoEm: "2026-09-19T12:00:00.000Z", link, saude: estado.semSaude ? null : saude };
    },
  };
});

vi.mock("next/navigation", () => ({ redirect: () => undefined, useRouter: () => ({ refresh: () => undefined }) }));

const link: RespostaLink = {
  dispositivos: 3,
  online: 2,
  aguardando_pareamento: 1,
  origens_padrao: ["https://brasa.comandeiro.com.br/tv"],
  telas: [
    {
      id: "cozinha", nome: "Tela da cozinha", tenant: "brasa", cliente: { tipo: "navegador", versao: "1.0.0" }, origens: [],
      criadoEm: "2026-08-20T12:00:00Z", tokenTrocadoEm: "2026-09-18T12:00:00Z", vistoEm: "2026-09-19T11:59:00Z",
      revogadoEm: null, conectado: true, estado: "online",
      pulso: { uptime_s: 259200, memoria_mb: 412, versao: "1.0.0", exibindo: "https://brasa.comandeiro.com.br/tv/cardapio" },
      pulsoEm: "2026-09-19T11:59:40Z",
    },
    {
      id: "salao", nome: "Salão", tenant: "brasa", cliente: { tipo: "navegador", versao: "0.9.0" }, origens: [],
      criadoEm: "2026-07-02T12:00:00Z", tokenTrocadoEm: "2026-09-18T12:00:00Z", vistoEm: "2026-09-19T10:40:00Z",
      revogadoEm: null, conectado: false, estado: "offline", pulso: null, pulsoEm: "2026-09-19T10:40:00Z",
    },
    {
      id: "agente", nome: "Agente do Brasa", tenant: "brasa", cliente: { tipo: "agente", versao: "1.0.0" }, origens: [],
      criadoEm: "2026-09-01T12:00:00Z", tokenTrocadoEm: "2026-09-18T12:00:00Z", vistoEm: "2026-09-19T11:59:00Z",
      revogadoEm: null, conectado: true, estado: "online",
      pulso: {
        uptime_s: 86400, versao: "1.0.0",
        dispositivos: [
          { id: "tv-sala", tipo: "samsung-tizen", recursos: ["tela"] },
          { id: "impressora-cozinha", tipo: "impressora-escpos", recursos: ["impressora"] },
        ],
      },
      pulsoEm: "2026-09-19T11:59:40Z",
    },
  ],
  pendentes: [
    {
      codigo: "KTPRWM", expiraEm: "2026-09-19T12:08:00Z", desde: "2026-09-19T11:58:00Z", ip: "189.4.20.11",
      cliente: { tipo: "navegador", versao: "1.0.0" }, tela: { largura: 1920, altura: 1080 }, so: "Tizen 6.0",
    },
  ],
};

const saude: RespostaSaude = {
  dias: 7, desde: "2026-09-12T12:00:00Z", amostras: 20160, amostra_s: 60,
  telas: [
    { dispositivo: "cozinha", nome: "Tela da cozinha", amostras: 10080, minutosOnline: 10074, disponibilidade: 99.9,
      quedas: 1, maiorQuedaMin: 4, ultimaQuedaEm: "2026-09-15T03:10:00Z", uptimeMaxH: 72, memoriaPicoMb: 486,
      memoriaMediaMb: 420, versao: "1.0.0", versoes: ["1.0.0"] },
    { dispositivo: "salao", nome: "Salão", amostras: 10080, minutosOnline: 9072, disponibilidade: 90,
      quedas: 8, maiorQuedaMin: 47, ultimaQuedaEm: "2026-09-19T10:41:00Z", uptimeMaxH: 11, memoriaPicoMb: 512,
      memoriaMediaMb: 460, versao: "0.9.0", versoes: ["0.9.0"] },
  ],
};

async function montar(): Promise<string> {
  const { default: TelasPage } = await import("@/app/operacao/telas/page");
  return renderToStaticMarkup(await TelasPage());
}

describe("tela de Telas (Ávila TV)", () => {
  beforeEach(() => {
    estado.configurado = true;
    estado.falhar = false;
    estado.semSaude = false;
    estado.papel = "OWNER";
  });

  it("põe quem caiu antes de quem está no ar", async () => {
    const html = await montar();
    expect(html.indexOf("Salão")).toBeLessThan(html.indexOf("Tela da cozinha"));
  });

  it("explica o que há de errado com a tela que caiu, em vez de só marcá-la de vermelho", async () => {
    const html = await montar();
    expect(html).toContain("sem pulso há 80 min");
    expect(html).toContain("caiu 8 vezes (maior parada: 47 min)");
    expect(html).toContain("versão 0.9.0, atrás da 1.0.0 que as outras rodam");
  });

  it("com a tela fora do ar, avisa que só revogar funciona", async () => {
    const html = await montar();
    expect(html).toContain("Sem pulso: só revogar funciona enquanto a tela não voltar.");
  });

  it("mostra o código esperando aprovação com o prazo dele", async () => {
    const html = await montar();
    expect(html).toContain("KTPRWM");
    expect(html).toContain("expira em 8 min");
    expect(html).toContain("Vincular");
  });

  it("resume a parede: no ar, atenção, disponibilidade e quedas", async () => {
    const html = await montar();
    // Duas telas e um agente: o agente conta, porque um agente fora do ar é
    // uma LAN inteira sem caminho.
    expect(html).toContain("2/3");
    expect(html).toContain("95,0%"); // média de 99,9 e 90,0, arredondada
    expect(html).toContain("1 esperando nome");
  });

  it("sem chave configurada, diz isso — não mostra uma parede vazia", async () => {
    estado.configurado = false;
    const html = await montar();
    expect(html).toContain("Este ambiente não fala com o agente");
    expect(html).not.toContain("Telas e agentes vinculados");
  });

  it("com o agente fora do ar, mostra o motivo em vez de um retrato velho", async () => {
    estado.falhar = true;
    const html = await montar();
    expect(html).toContain("O agente não respondeu");
    expect(html).toContain("o agente demorou demais para responder");
    expect(html).not.toContain("Telas e agentes vinculados");
  });

  it("mostra o agente como ponte, e não como tela que não exibe nada", async () => {
    const html = await montar();
    expect(html).toContain("Agente do Brasa");
    expect(html).toContain("2 aparelhos na LAN");
    // A LAN que ele alcança aparece; a allowlist de `exibir`, não — ele não
    // tem esse comando, e cobrar configuração para ela seria ruído.
    expect(html).toContain("A LAN que este agente alcança");
    expect(html).toContain("tv-sala (samsung-tizen)");
    expect(html).toContain("impressora-cozinha (impressora-escpos)");
  });

  it("não oferece ao agente os botões que só uma tela responde", async () => {
    const html = await montar();
    // "Olhar a LAN" é dele; "Recarregar"/"Avisar" continuam existindo para as
    // telas da mesma página, então a prova é a contagem.
    expect(html).toContain("Olhar a LAN");
    expect(html.match(/Recarregar/g)?.length).toBe(2);
  });

  it("para o sócio, nenhuma linha oferece revogar", async () => {
    estado.papel = "SOCIO";
    const html = await montar();
    expect(html).toContain("Recarregar");
    expect(html).not.toContain(">Revogar<");
  });

  it("para o dono, cada tela e o agente oferecem revogar", async () => {
    const html = await montar();
    expect(html.match(/>Revogar</g)?.length).toBe(3);
  });

  /**
   * Sem a leitura de saúde, "ainda sem amostra" seria mentira: a amostra pode
   * existir e só a leitura ter falhado. A lista abre assim mesmo.
   */
  it("com a saúde fora, a lista abre e os números de 7 dias dizem que não vieram", async () => {
    estado.semSaude = true;
    const html = await montar();
    expect(html).toContain("Telas e agentes vinculados");
    expect(html).toContain("o agente não devolveu a saúde");
  });
});

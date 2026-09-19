import { describe, expect, it } from "vitest";
import type { PendenteDoAgente, RespostaLink, RespostaSaude, SaudeDaTela, TelaDoAgente } from "@/lib/avila-tv";
import {
  alertasDaTela,
  compararVersoes,
  descricaoDaTela,
  formatarUptime,
  juntarTelasComSaude,
  minutosParaExpirar,
  ordenarTelas,
  resumirTelas,
  tomDaTela,
  versaoMaisNova,
  type TelaNoPainel,
} from "@/lib/telas-painel";

const AGORA = new Date("2026-09-19T12:00:00.000Z");
const ORIGENS = ["https://brasa.comandeiro.com.br/tv"];

function tela(parcial: Partial<TelaDoAgente> = {}): TelaDoAgente {
  return {
    id: "tela-cozinha",
    nome: "Tela da cozinha",
    tenant: "brasa",
    cliente: { tipo: "navegador", versao: "1.0.0" },
    origens: [],
    criadoEm: "2026-09-10T12:00:00.000Z",
    tokenTrocadoEm: "2026-09-10T12:00:00.000Z",
    vistoEm: "2026-09-19T11:59:00.000Z",
    revogadoEm: null,
    conectado: true,
    estado: "online",
    pulso: { uptime_s: 7200, memoria_mb: 410, versao: "1.0.0", exibindo: "https://brasa.comandeiro.com.br/tv/cardapio" },
    pulsoEm: "2026-09-19T11:59:30.000Z",
    ...parcial,
  };
}

function saude(parcial: Partial<SaudeDaTela> = {}): SaudeDaTela {
  return {
    dispositivo: "tela-cozinha",
    nome: "Tela da cozinha",
    amostras: 10080,
    minutosOnline: 10080,
    disponibilidade: 100,
    quedas: 0,
    maiorQuedaMin: 0,
    ultimaQuedaEm: null,
    uptimeMaxH: 71.2,
    memoriaPicoMb: 486,
    memoriaMediaMb: 420,
    versao: "1.0.0",
    versoes: ["1.0.0"],
    ...parcial,
  };
}

function montar(telas: TelaDoAgente[], telasSaude: SaudeDaTela[] = [], origensPadrao = ORIGENS): TelaNoPainel[] {
  const link: RespostaLink = {
    dispositivos: telas.length,
    online: telas.filter((t) => t.estado === "online").length,
    aguardando_pareamento: 0,
    origens_padrao: origensPadrao,
    telas,
    pendentes: [],
  };
  const resposta: RespostaSaude | null = telasSaude.length
    ? { dias: 7, desde: "2026-09-12T12:00:00.000Z", amostras: 1, amostra_s: 60, telas: telasSaude }
    : null;
  return juntarTelasComSaude(link, resposta);
}

const uma = (parcial: Partial<TelaDoAgente> = {}, s?: Partial<SaudeDaTela>) =>
  montar([tela(parcial)], s ? [saude({ dispositivo: parcial.id ?? "tela-cozinha", ...s })] : [])[0];

describe("junção com a telemetria", () => {
  it("cada tela recebe a saúde dela, e quem não tem amostra fica sem", () => {
    const telas = montar(
      [tela(), tela({ id: "salao", nome: "Salão" })],
      [saude({ dispositivo: "salao", disponibilidade: 91.2 })],
    );
    expect(telas.find((t) => t.id === "tela-cozinha")?.saude).toBeNull();
    expect(telas.find((t) => t.id === "salao")?.saude?.disponibilidade).toBe(91.2);
  });

  it("allowlist vazia herda a do agente; lista própria manda", () => {
    expect(uma().origensEfetivas).toEqual(ORIGENS);
    expect(uma({ origens: ["https://outro.com.br/tv"] }).origensEfetivas).toEqual(["https://outro.com.br/tv"]);
  });
});

describe("o que pede atenção", () => {
  it("tela no ar, com allowlist e sem histórico ruim não alerta nada", () => {
    expect(alertasDaTela(uma({}, {}), AGORA)).toEqual([]);
    expect(tomDaTela(uma({}, {}), AGORA)).toBe("azul");
  });

  it("sem pulso é erro, e o tempo fora sai em minutos ou dias", () => {
    const caiu = uma({ estado: "offline", conectado: false, pulsoEm: "2026-09-19T11:30:00.000Z" });
    expect(alertasDaTela(caiu, AGORA)[0]).toEqual({ gravidade: "erro", texto: "sem pulso há 30 min" });
    expect(tomDaTela(caiu, AGORA)).toBe("vermelho");

    const sumiu = uma({ estado: "offline", conectado: false, pulsoEm: null, vistoEm: "2026-09-16T12:00:00.000Z" });
    expect(alertasDaTela(sumiu, AGORA)[0].texto).toBe("sem pulso há 3 dias");
  });

  it("tela que nunca conectou diz isso, em vez de calcular a partir do nada", () => {
    const nova = uma({ estado: "offline", conectado: false, pulsoEm: null, vistoEm: null });
    expect(alertasDaTela(nova, AGORA)[0].texto).toBe("nunca se conectou desde que foi vinculada");
  });

  it("tela revogada não gera alerta: é decisão tomada, não problema aberto", () => {
    const fora = uma({ revogadoEm: "2026-09-18T12:00:00.000Z", estado: "offline", conectado: false, pulsoEm: null });
    expect(alertasDaTela(fora, AGORA)).toEqual([]);
    expect(tomDaTela(fora, AGORA)).toBe("cinza");
  });

  it("disponibilidade baixa e queda repetida viram aviso, não erro", () => {
    const ruim = uma({}, { disponibilidade: 94.5, quedas: 7, maiorQuedaMin: 22 });
    const textos = alertasDaTela(ruim, AGORA).map((a) => a.texto);
    expect(textos).toContain("ficou no ar 94,5% do tempo");
    expect(textos).toContain("caiu 7 vezes (maior parada: 22 min)");
    expect(alertasDaTela(ruim, AGORA).every((a) => a.gravidade === "aviso")).toBe(true);
    expect(tomDaTela(ruim, AGORA)).toBe("amarelo");
  });

  it("sem allowlist nenhuma, avisa que exibir vai recusar tudo", () => {
    const solta = montar([tela()], [], [])[0];
    expect(alertasDaTela(solta, AGORA).map((a) => a.texto)).toContain(
      "sem allowlist: o comando exibir vai recusar qualquer endereço",
    );
  });

  it("comando que falhou e erro relatado pela tela aparecem", () => {
    const comFalha = uma({
      pulso: {
        versao: "1.0.0",
        ultimo_comando: { id: "c-1", comando: "recarregar", ok: false, em: "2026-09-19T11:00:00.000Z" },
        ultimo_erro: "iframe recusou carregar",
      },
    });
    const textos = alertasDaTela(comFalha, AGORA).map((a) => a.texto);
    expect(textos).toContain("o último comando (recarregar) falhou");
    expect(textos).toContain("a tela relatou: iframe recusou carregar");
  });

  it("token velho lembra a rotação que o protocolo prevê", () => {
    const antiga = uma({ tokenTrocadoEm: "2026-07-01T12:00:00.000Z" });
    expect(alertasDaTela(antiga, AGORA).some((a) => a.texto.startsWith("token com 80 dias"))).toBe(true);
  });
});

describe("versão defasada", () => {
  it("compara por número, não por string: 1.10 é maior que 1.9", () => {
    expect(compararVersoes("1.10.0", "1.9.0")).toBeGreaterThan(0);
    expect(compararVersoes("1.0.0", "1.0.0")).toBe(0);
    expect(compararVersoes("2.0", "1.9.9")).toBeGreaterThan(0);
  });

  it("a régua é a versão mais nova que alguma tela está rodando", () => {
    const telas = montar([tela({ pulso: { versao: "1.2.0" } }), tela({ id: "salao", pulso: { versao: "1.10.0" } })]);
    expect(versaoMaisNova(telas)).toBe("1.10.0");
    expect(alertasDaTela(telas[0], AGORA, "1.10.0").map((a) => a.texto)).toContain(
      "versão 1.2.0, atrás da 1.10.0 que as outras rodam",
    );
    expect(alertasDaTela(telas[1], AGORA, "1.10.0")).toEqual([]);
  });

  it("tela revogada não puxa a régua para cima depois de aposentada", () => {
    const telas = montar([
      tela({ pulso: { versao: "1.2.0" } }),
      tela({ id: "velha", revogadoEm: "2026-09-18T12:00:00.000Z", pulso: { versao: "9.9.9" } }),
    ]);
    expect(versaoMaisNova(telas)).toBe("1.2.0");
  });
});

describe("resumo e ordem", () => {
  it("conta ativas, no ar e quem pede atenção — revogada fica fora do total", () => {
    const telas = montar(
      [
        tela(),
        tela({ id: "salao", nome: "Salão", estado: "offline", conectado: false, pulsoEm: "2026-09-19T11:00:00.000Z" }),
        tela({ id: "velha", nome: "Antiga", revogadoEm: "2026-09-01T12:00:00.000Z" }),
      ],
      [saude(), saude({ dispositivo: "salao", disponibilidade: 80, quedas: 4 })],
    );
    const pendentes: PendenteDoAgente[] = [
      { codigo: "KTPRWM", expiraEm: "2026-09-19T12:07:00.000Z", desde: AGORA.toISOString(), ip: "1.2.3.4", cliente: null, tela: null, so: null },
    ];
    const r = resumirTelas(telas, pendentes, AGORA);
    expect(r).toMatchObject({ total: 2, online: 1, offline: 1, revogadas: 1, aguardando: 1, pedindoAtencao: 1, quedas: 4 });
    expect(r.disponibilidade).toBe(90);
  });

  it("sem amostra nenhuma a disponibilidade é ausência, não zero", () => {
    expect(resumirTelas(montar([tela()]), [], AGORA).disponibilidade).toBeNull();
  });

  it("quem precisa de gente vem primeiro; revogada por último", () => {
    const telas = montar(
      [
        tela({ id: "ok", nome: "Ok" }),
        tela({ id: "velha", nome: "Antiga", revogadoEm: "2026-09-01T12:00:00.000Z" }),
        tela({ id: "caiu", nome: "Caiu", estado: "offline", conectado: false, pulsoEm: "2026-09-19T11:00:00.000Z" }),
        tela({ id: "aviso", nome: "Aviso", origens: [] }),
      ],
      [saude({ dispositivo: "aviso", disponibilidade: 90, quedas: 9 })],
    );
    expect(ordenarTelas(telas, AGORA).map((t) => t.id)).toEqual(["caiu", "aviso", "ok", "velha"]);
  });
});

describe("frases", () => {
  it("uptime vira minuto, hora ou dia — nunca 259200 segundos", () => {
    expect(formatarUptime(90)).toBe("2 min");
    expect(formatarUptime(7200)).toBe("2 h");
    expect(formatarUptime(259_200)).toBe("3 dias");
    expect(formatarUptime(null)).toBeNull();
  });

  it("a linha fechada resume estado, conteúdo, disponibilidade e versão", () => {
    expect(descricaoDaTela(uma({}, {}))).toBe(
      "no ar · https://brasa.comandeiro.com.br/tv/cardapio · 100,0% · v1.0.0",
    );
  });

  it("tela sem pulso não anuncia o que estava exibindo como se ainda estivesse", () => {
    const caiu = uma({ estado: "offline", conectado: false });
    expect(descricaoDaTela(caiu)).not.toContain("cardapio");
    expect(descricaoDaTela(caiu).startsWith("sem pulso")).toBe(true);
  });

  it("o código de pareamento mostra quanto tempo ainda vale", () => {
    const pendente: PendenteDoAgente = {
      codigo: "KTPRWM",
      expiraEm: "2026-09-19T12:07:30.000Z",
      desde: "2026-09-19T11:57:30.000Z",
      ip: "1.2.3.4",
      cliente: null,
      tela: null,
      so: null,
    };
    expect(minutosParaExpirar(pendente, AGORA)).toBe(8);
    expect(minutosParaExpirar({ ...pendente, expiraEm: "2026-09-19T11:50:00.000Z" }, AGORA)).toBe(0);
  });
});

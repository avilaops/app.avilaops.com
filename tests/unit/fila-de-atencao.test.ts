import { describe, expect, it } from "vitest";
import { agruparFilaDeAtencao, type TarefaNaFila } from "@/lib/fila-de-atencao";

const AGORA = new Date("2026-10-08T12:00:00Z");
const interno = { id: "org-interno", name: "Ávila Ops (interno)" };
const vedashow = { id: "org-vedashow", name: "Vedashow" };
const malAssombrada = { id: "proj-mal", title: "Mudança Mal-Assombrada" };

let n = 0;
const tarefa = (extra: Partial<TarefaNaFila>): TarefaNaFila => ({
  id: `t${++n}`,
  title: `Tarefa ${n}`,
  status: "TODO",
  dueAt: null,
  organization: interno,
  project: null,
  ...extra,
});

describe("fila de atenção agrupada", () => {
  it("seis tarefas do mesmo projeto viram UMA linha, com o nome do projeto e a contagem", () => {
    const seis = Array.from({ length: 6 }, (_, i) =>
      tarefa({ title: `[P0-0${i + 1}] Etapa`, project: malAssombrada }),
    );
    const outra = tarefa({ title: "Renovar certificado", organization: vedashow, dueAt: new Date("2026-10-20T00:00:00Z") });

    const fila = agruparFilaDeAtencao([...seis, outra], AGORA);

    expect(fila).toHaveLength(2);
    const projeto = fila.find((l) => l.chave === "projeto-proj-mal")!;
    expect(projeto).toMatchObject({ titulo: "Mudança Mal-Assombrada", tarefas: 6, href: "/projetos/proj-mal", projeto: null });
    // O outro cliente não some atrás do projeto grande.
    expect(fila.map((l) => l.cliente)).toContain("Vedashow");
  });

  it("grupo de uma tarefa só mostra a tarefa, e diz de que projeto ela é", () => {
    const [linha] = agruparFilaDeAtencao([tarefa({ title: "Publicar o site", project: malAssombrada })], AGORA);
    expect(linha).toMatchObject({ titulo: "Publicar o site", projeto: "Mudança Mal-Assombrada", tarefas: 1 });
  });

  it("tarefas soltas agrupam pelo cliente e levam à ficha dele", () => {
    const fila = agruparFilaDeAtencao([tarefa({ organization: vedashow }), tarefa({ organization: vedashow })], AGORA);
    expect(fila).toEqual([
      expect.objectContaining({ titulo: "Tarefas sem projeto", cliente: "Vedashow", tarefas: 2, href: "/clientes/org-vedashow" }),
    ]);
  });

  it("o grupo carrega o prazo mais próximo, o pior estado e quantas venceram", () => {
    const [linha] = agruparFilaDeAtencao(
      [
        tarefa({ project: malAssombrada, dueAt: new Date("2026-10-30T00:00:00Z") }),
        tarefa({ project: malAssombrada, dueAt: new Date("2026-10-01T00:00:00Z"), status: "IN_PROGRESS" }),
        tarefa({ project: malAssombrada, status: "BLOCKED" }),
      ],
      AGORA,
    );
    expect(linha.quando?.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(linha).toMatchObject({ status: "BLOCKED", vencidas: 1, tarefas: 3 });
  });

  it("prazo mais próximo primeiro; sem prazo no fim; e o limite corta a fila", () => {
    const projetos = Array.from({ length: 8 }, (_, i) => ({ id: `p${i}`, title: `Projeto ${i}` }));
    const fila = agruparFilaDeAtencao(
      [
        tarefa({ project: projetos[0] }),
        tarefa({ project: projetos[1], dueAt: new Date("2026-11-01T00:00:00Z") }),
        tarefa({ project: projetos[2], dueAt: new Date("2026-10-10T00:00:00Z") }),
        ...projetos.slice(3).map((project) => tarefa({ project })),
      ],
      AGORA,
    );
    expect(fila).toHaveLength(6);
    expect(fila.slice(0, 2).map((l) => l.chave)).toEqual(["projeto-p2", "projeto-p1"]);
  });
});

/**
 * A fila "Precisa de atenção" da Visão central, agrupada.
 *
 * A fila listava tarefa por tarefa, e um projeto novo com seis tarefas de alta
 * prioridade ocupava as seis linhas sozinho — o resto da carteira sumia. Quem
 * pede atenção é o projeto; as tarefas são o que se vê ao abri-lo.
 *
 * Regra: uma linha por projeto. Tarefa solta (sem projeto) agrupa pelo
 * cliente, pelo mesmo motivo. Grupo de uma tarefa só mostra a própria tarefa:
 * aí o título dela diz mais que "1 tarefa".
 */

export type TarefaNaFila = {
  id: string;
  title: string;
  status: string;
  dueAt: Date | null;
  organization: { id: string; name: string };
  project: { id: string; title: string } | null;
};

export type LinhaDeAtencao = {
  chave: string;
  titulo: string;
  /** Nome do cliente. A tela acrescenta o resto. */
  cliente: string;
  /** Nome do projeto quando a linha é uma tarefa só, dentro de um projeto. */
  projeto: string | null;
  tarefas: number;
  vencidas: number;
  /** O pior estado do grupo: bloqueada pesa mais que em andamento, que pesa mais que a fazer. */
  status: string;
  /** O prazo mais próximo do grupo. */
  quando: Date | null;
  href: string;
};

const PESO: Record<string, number> = { BLOCKED: 0, IN_PROGRESS: 1, TODO: 2 };

export function agruparFilaDeAtencao(tarefas: TarefaNaFila[], agora: Date, limite = 6): LinhaDeAtencao[] {
  const grupos = new Map<string, TarefaNaFila[]>();
  for (const tarefa of tarefas) {
    const chave = tarefa.project ? `projeto-${tarefa.project.id}` : `cliente-${tarefa.organization.id}`;
    const grupo = grupos.get(chave);
    if (grupo) grupo.push(tarefa);
    else grupos.set(chave, [tarefa]);
  }

  const linhas: LinhaDeAtencao[] = [...grupos.entries()].map(([chave, grupo]) => {
    const primeira = grupo[0];
    const prazos = grupo.map((t) => t.dueAt).filter((d): d is Date => d !== null);
    const quando = prazos.length ? new Date(Math.min(...prazos.map((d) => d.getTime()))) : null;
    const status = [...grupo].sort((a, b) => (PESO[a.status] ?? 9) - (PESO[b.status] ?? 9))[0].status;
    const href = primeira.project ? `/projetos/${primeira.project.id}` : `/clientes/${primeira.organization.id}`;
    const sozinha = grupo.length === 1;

    return {
      chave,
      titulo: sozinha ? primeira.title : (primeira.project?.title ?? "Tarefas sem projeto"),
      cliente: primeira.organization.name,
      projeto: sozinha ? (primeira.project?.title ?? null) : null,
      tarefas: grupo.length,
      vencidas: grupo.filter((t) => t.dueAt !== null && t.dueAt < agora).length,
      status,
      quando,
      href,
    };
  });

  // Prazo mais próximo primeiro; sem prazo vai para o fim, e entre os sem prazo
  // quem tem mais tarefa pendurada aparece antes.
  linhas.sort((a, b) => {
    if (a.quando && b.quando) return a.quando.getTime() - b.quando.getTime();
    if (a.quando) return -1;
    if (b.quando) return 1;
    return b.tarefas - a.tarefas;
  });

  return linhas.slice(0, limite);
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import PlanEditForm, {
  dinheiro,
  rotuloCiclo,
  rotuloStatus,
  tiposServico,
  type PlanoServico,
} from "@/components/PlanEditForm";
import { Icone } from "@/components/ui/Icones";

const classeStatus: Record<string, string> = {
  ACTIVE: "status-active",
  DRAFT: "status-pending",
  ARCHIVED: "status-archived",
};

function agrupar(planos: PlanoServico[]) {
  const grupos = planos.reduce<Record<string, PlanoServico[]>>((acc, plano) => {
    acc[plano.serviceType] = acc[plano.serviceType] ?? [];
    acc[plano.serviceType].push(plano);
    return acc;
  }, {});
  for (const lista of Object.values(grupos)) {
    lista.sort(
      (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "pt-BR"),
    );
  }
  return grupos;
}

type Edicao = { plano: PlanoServico | null; tipo: string };

/**
 * Catálogo como lista agrupada (uma seção por tipo de serviço, uma linha por
 * plano) e edição numa folha. A lista mostra só o que se lê de relance —
 * nome, ciclo, status, preço — e o formulário só abre para quem toca.
 *
 * A lista é otimista: ao salvar, a linha muda na hora com o que a API
 * devolveu, e o `router.refresh()` confirma por trás sem piscar a tela.
 */
export default function ServicePlansManager({ plans }: { plans: PlanoServico[] }) {
  const router = useRouter();
  const [lista, setLista] = useState(plans);
  const [origem, setOrigem] = useState(plans);
  const [edicao, setEdicao] = useState<Edicao | null>(null);
  const [aviso, setAviso] = useState("");
  const grupos = useMemo(() => agrupar(lista), [lista]);

  // O servidor mandou a lista de novo (refresh): ela passa a valer. Ajuste
  // durante a renderização, não em efeito — evita o quadro intermediário.
  if (origem !== plans) {
    setOrigem(plans);
    setLista(plans);
  }

  useEffect(() => {
    if (!aviso) return;
    const timer = window.setTimeout(() => setAviso(""), 2800);
    return () => window.clearTimeout(timer);
  }, [aviso]);

  function salvo(mensagem: string, plano: PlanoServico) {
    setLista((atual) => {
      const existe = atual.some((item) => item.id === plano.id);
      return existe
        ? atual.map((item) => (item.id === plano.id ? plano : item))
        : [...atual, plano];
    });
    setEdicao(null);
    setAviso(mensagem);
    router.refresh();
  }

  return (
    <div className="service-plans-manager">
      <div className="plans-toolbar">
        <p>
          {lista.length} {lista.length === 1 ? "plano" : "planos"} em{" "}
          {tiposServico.length} tipos de serviço. Toque num plano para editar.
        </p>
        <button
          type="button"
          className="primary-button"
          onClick={() => setEdicao({ plano: null, tipo: "PDF_CATALOG" })}
        >
          <Icone nome="adicionar" tamanho={18} />
          Novo plano
        </button>
      </div>

      {tiposServico.map(([tipo, rotulo]) => {
        const planos = grupos[tipo] ?? [];
        return (
          <section className="plan-section" key={tipo} aria-labelledby={`tipo-${tipo}`}>
            <div className="plan-section-head">
              <h3 id={`tipo-${tipo}`}>
                {rotulo}
                <small>{tipo}</small>
              </h3>
              <button
                type="button"
                className="text-link plan-add"
                onClick={() => setEdicao({ plano: null, tipo })}
              >
                Adicionar
              </button>
            </div>

            <div className="ios-list">
              {planos.length === 0 ? (
                <p className="plan-row-empty">Nenhum plano neste tipo ainda.</p>
              ) : (
                planos.map((plano) => (
                  <button
                    type="button"
                    className="ios-row plan-row"
                    key={plano.id}
                    onClick={() => setEdicao({ plano, tipo })}
                    aria-label={`Editar ${plano.name}`}
                  >
                    <div className="plan-row-main">
                      <strong>{plano.name}</strong>
                      <small>
                        {rotuloCiclo(plano.billingCycle)}
                        {plano.description ? ` · ${plano.description}` : ""}
                      </small>
                    </div>
                    <span
                      className={`status-pill ${classeStatus[plano.status] ?? ""}`}
                    >
                      {rotuloStatus(plano.status)}
                    </span>
                    <span
                      className={
                        plano.priceCents === null
                          ? "plan-row-price indefinido"
                          : "plan-row-price"
                      }
                    >
                      {dinheiro(plano.priceCents)}
                    </span>
                    <Icone nome="chevron" tamanho={16} className="chevron" />
                  </button>
                ))
              )}
            </div>
          </section>
        );
      })}

      {edicao ? (
        <PlanEditForm
          key={edicao.plano?.id ?? `novo-${edicao.tipo}`}
          plano={edicao.plano}
          tipoInicial={edicao.tipo}
          aoFechar={() => setEdicao(null)}
          aoSalvar={salvo}
        />
      ) : null}

      {aviso ? (
        <div className="toast" role="status">
          {aviso}
        </div>
      ) : null}
    </div>
  );
}

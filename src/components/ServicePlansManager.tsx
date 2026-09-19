"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import PlanEditForm, {
  dinheiro,
  rotuloCiclo,
  tiposServico,
  type PlanoServico,
} from "@/components/PlanEditForm";
import { Grupo, LinhaLink } from "@/components/sistema/Lista";
import Status from "@/components/sistema/Status";
import { Icone } from "@/components/ui/Icones";

type Edicao = { plano: PlanoServico | null; tipo: string };

/**
 * Catálogo de serviços.
 *
 * Reescrito em 17/09/2026 na linguagem do sistema: resumo em cima, barra com
 * busca e filtros, e uma superfície por tipo de serviço com uma linha por
 * plano. O código interno do tipo (`PDF_CATALOG`) saiu do título e virou
 * detalhe técnico no rodapé da tela — quem opera lê "Catálogo PDF".
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
  const [busca, setBusca] = useState("");
  const [tipoFiltro, setTipoFiltro] = useState("");
  const [statusFiltro, setStatusFiltro] = useState("");

  // O servidor mandou a lista de novo (refresh): ela passa a valer.
  if (origem !== plans) {
    setOrigem(plans);
    setLista(plans);
  }

  useEffect(() => {
    if (!aviso) return;
    const timer = window.setTimeout(() => setAviso(""), 2800);
    return () => window.clearTimeout(timer);
  }, [aviso]);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return lista.filter((plano) => {
      if (tipoFiltro && plano.serviceType !== tipoFiltro) return false;
      if (statusFiltro && plano.status !== statusFiltro) return false;
      if (!termo) return true;
      return (
        plano.name.toLowerCase().includes(termo) ||
        (plano.description ?? "").toLowerCase().includes(termo) ||
        plano.slug.toLowerCase().includes(termo)
      );
    });
  }, [lista, busca, tipoFiltro, statusFiltro]);

  const grupos = useMemo(() => {
    const porTipo = new Map<string, PlanoServico[]>();
    for (const plano of filtrados) {
      const atual = porTipo.get(plano.serviceType) ?? [];
      atual.push(plano);
      porTipo.set(plano.serviceType, atual);
    }
    for (const planos of porTipo.values()) {
      planos.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "pt-BR"));
    }
    return porTipo;
  }, [filtrados]);

  const ativos = lista.filter((plano) => plano.status === "ACTIVE").length;
  const semPreco = lista.filter((plano) => plano.priceCents === null).length;

  // Recebe uma lista porque um "Novo plano" com vários ciclos marcados cria um
  // plano por ciclo, e a tela precisa mostrar todos de uma vez.
  function salvo(mensagem: string, planos: PlanoServico[]) {
    setLista((atual) => {
      const porId = new Map(planos.map((plano) => [plano.id, plano]));
      const novos = planos.filter((plano) => !atual.some((item) => item.id === plano.id));
      return [...atual.map((item) => porId.get(item.id) ?? item), ...novos];
    });
    setEdicao(null);
    setAviso(mensagem);
    router.refresh();
  }

  const filtrando = Boolean(busca || tipoFiltro || statusFiltro);

  return (
    <div className="pilha">
      <section className="servicos-resumo" aria-label="Resumo do catálogo">
        <div>
          <span>Planos</span>
          <strong>{lista.length}</strong>
        </div>
        <div>
          <span>Tipos de serviço</span>
          <strong>{tiposServico.length}</strong>
        </div>
        <div>
          <span>Ativos</span>
          <strong>{ativos}</strong>
        </div>
        <div>
          <span>Sem preço</span>
          <strong>{semPreco}</strong>
        </div>
      </section>

      <div className="barra-ferramentas">
        <label className="campo-busca">
          <span className="sr-only">Buscar plano</span>
          <input
            type="search"
            value={busca}
            onChange={(evento) => setBusca(evento.target.value)}
            placeholder="Buscar por nome, descrição ou slug"
          />
        </label>
        <label>
          <span className="sr-only">Filtrar por tipo</span>
          <select value={tipoFiltro} onChange={(evento) => setTipoFiltro(evento.target.value)}>
            <option value="">Todos os tipos</option>
            {tiposServico.map(([codigo, rotulo]) => (
              <option key={codigo} value={codigo}>
                {rotulo}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="sr-only">Filtrar por status</span>
          <select value={statusFiltro} onChange={(evento) => setStatusFiltro(evento.target.value)}>
            <option value="">Todos os status</option>
            <option value="ACTIVE">Ativos</option>
            <option value="DRAFT">Rascunhos</option>
            <option value="ARCHIVED">Arquivados</option>
          </select>
        </label>
        <button type="button" className="primary-button" onClick={() => setEdicao({ plano: null, tipo: tipoFiltro || "PDF_CATALOG" })}>
          <Icone nome="adicionar" tamanho={18} />
          Novo plano
        </button>
      </div>

      {tiposServico.map(([tipo, rotulo]) => {
        const planos = grupos.get(tipo) ?? [];
        // Com filtro ativo, tipo sem resultado some em vez de ocupar a tela.
        if (filtrando && planos.length === 0) return null;
        return (
          <Grupo
            key={tipo}
            titulo={rotulo}
            acao={
              <button type="button" className="text-link" onClick={() => setEdicao({ plano: null, tipo })}>
                Adicionar
              </button>
            }
          >
            {planos.length === 0 ? (
              <button type="button" className="linha linha-vazia" onClick={() => setEdicao({ plano: null, tipo })}>
                <span className="linha-texto">
                  <strong>Nenhum plano aqui ainda</strong>
                  <small>Toque para criar o primeiro de {rotulo.toLowerCase()}.</small>
                </span>
                <Icone nome="adicionar" tamanho={16} className="chevron" />
              </button>
            ) : (
              planos.map((plano) => (
                <LinhaLink
                  key={plano.id}
                  href={`?plano=${plano.slug}`}
                  titulo={plano.name}
                  descricao={`${rotuloCiclo(plano.billingCycle)}${plano.description ? ` · ${plano.description}` : ""}`}
                  valor={
                    <span className="linha-valor-composto">
                      <Status status={plano.status} />
                      <strong className={plano.priceCents === null ? "linha-preco indefinido" : "linha-preco"}>
                        {dinheiro(plano.priceCents, plano.currency)}
                      </strong>
                    </span>
                  }
                  aoClicar={(evento) => {
                    evento.preventDefault();
                    setEdicao({ plano, tipo });
                  }}
                />
              ))
            )}
          </Grupo>
        );
      })}

      {filtrando && filtrados.length === 0 ? (
        <Grupo>
          <button type="button" className="linha linha-vazia" onClick={() => { setBusca(""); setTipoFiltro(""); setStatusFiltro(""); }}>
            <span className="linha-texto">
              <strong>Nenhum plano com esses filtros</strong>
              <small>Toque para limpar a busca e os filtros.</small>
            </span>
          </button>
        </Grupo>
      ) : null}

      <details className="detalhes-tecnicos">
        <summary>Detalhes técnicos</summary>
        <dl>
          {tiposServico.map(([codigo, rotulo]) => (
            <div key={codigo}>
              <dt>{rotulo}</dt>
              <dd className="mono">{codigo}</dd>
            </div>
          ))}
        </dl>
      </details>

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

"use client";

import { useMemo, useState } from "react";
import type { CredencialEmLista } from "@/lib/credenciais";

const ROTULO_CATEGORIA: Record<string, string> = {
  meta: "Meta / Facebook",
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  threads: "Threads",
  google: "Google",
  mercadopago: "Mercado Pago",
  mercadolivre: "Mercado Livre",
  x: "X (Twitter)",
  outros: "Outros",
};

const CORES_STATUS: Record<string, string> = {
  ATIVO: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
  PENDENTE: "bg-amber-500/10 text-amber-300 border-amber-500/30",
  APOSENTADA: "bg-gray-500/10 text-gray-400 border-gray-600/40",
};

const EXPLICACAO_STATUS: Record<string, string> = {
  ATIVO: "Tem valor guardado no cofre.",
  PENDENTE: "Alguma parte do código lê esta chave, e ela ainda não tem valor.",
  APOSENTADA: "Nenhum código lê esta chave. É anotação, não configuração.",
};

export default function CofreClient({
  credenciaisIniciais,
}: {
  credenciaisIniciais: CredencialEmLista[];
}) {
  const [credenciais, setCredenciais] = useState(credenciaisIniciais);
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState("todas");
  const [somentePendentes, setSomentePendentes] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState("");
  const [reveladas, setReveladas] = useState<Record<string, string>>({});
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const categorias = useMemo(
    () => [...new Set(credenciais.map((c) => c.categoria))].sort(),
    [credenciais],
  );

  const visiveis = useMemo(() => {
    const termo = busca.trim().toUpperCase();
    return credenciais.filter((credencial) => {
      if (categoria !== "todas" && credencial.categoria !== categoria) return false;
      if (somentePendentes && credencial.status !== "PENDENTE") return false;
      if (termo && !credencial.chave.includes(termo)) return false;
      return true;
    });
  }, [credenciais, busca, categoria, somentePendentes]);

  const porCategoria = useMemo(() => {
    const mapa = new Map<string, CredencialEmLista[]>();
    for (const credencial of visiveis) {
      if (!mapa.has(credencial.categoria)) mapa.set(credencial.categoria, []);
      mapa.get(credencial.categoria)!.push(credencial);
    }
    return [...mapa.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [visiveis]);

  const resumo = useMemo(() => {
    const total = credenciais.length;
    const ativas = credenciais.filter((c) => c.status === "ATIVO").length;
    const pendentes = credenciais.filter((c) => c.status === "PENDENTE").length;
    return { total, ativas, pendentes, aposentadas: total - ativas - pendentes };
  }, [credenciais]);

  async function revelar(chave: string) {
    setErro(null);
    setOcupado(chave);
    try {
      const resposta = await fetch(`/api/credenciais/${encodeURIComponent(chave)}/revelar`, {
        method: "POST",
      });
      const dados = await resposta.json();
      if (!resposta.ok) throw new Error(dados.error ?? "Falha ao revelar.");
      setReveladas((atual) => ({ ...atual, [chave]: dados.valor }));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao revelar.");
    } finally {
      setOcupado(null);
    }
  }

  function esconder(chave: string) {
    setReveladas((atual) => {
      const copia = { ...atual };
      delete copia[chave];
      return copia;
    });
  }

  async function salvar(chave: string) {
    setErro(null);
    setOcupado(chave);
    try {
      const resposta = await fetch("/api/credenciais", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chave, valor: rascunho }),
      });
      const dados = await resposta.json();
      if (!resposta.ok) throw new Error(dados.error ?? "Falha ao salvar.");

      setCredenciais((atual) =>
        atual.map((credencial) =>
          credencial.chave === chave
            ? {
                ...credencial,
                status: dados.status,
                preenchida: rascunho.trim().length > 0,
                mascara: mascararLocal(rascunho, credencial.segredo),
                rotacionadoEm: new Date().toISOString(),
              }
            : credencial,
        ),
      );
      esconder(chave);
      setEditando(null);
      setRascunho("");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao salvar.");
    } finally {
      setOcupado(null);
    }
  }

  return (
    <div className="space-y-5 w-full">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Indicador rotulo="Chaves no cofre" valor={resumo.total} />
        <Indicador rotulo="Com valor" valor={resumo.ativas} tom="text-emerald-300" />
        <Indicador rotulo="Pendentes" valor={resumo.pendentes} tom="text-amber-300" />
        <Indicador rotulo="Sem consumidor" valor={resumo.aposentadas} tom="text-gray-400" />
      </div>

      <div className="flex flex-wrap items-center gap-3 p-4 bg-gray-900 border border-gray-800 rounded-xl">
        <input
          type="search"
          value={busca}
          onChange={(evento) => setBusca(evento.target.value)}
          placeholder="Buscar chave (ex.: META_APP)"
          className="flex-1 min-w-[220px] bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-gray-200"
        />
        <select
          value={categoria}
          onChange={(evento) => setCategoria(evento.target.value)}
          className="bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-gray-200"
        >
          <option value="todas">Todas as categorias</option>
          {categorias.map((valor) => (
            <option key={valor} value={valor}>
              {ROTULO_CATEGORIA[valor] ?? valor}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-gray-300">
          <input
            type="checkbox"
            checked={somentePendentes}
            onChange={(evento) => setSomentePendentes(evento.target.checked)}
          />
          Só pendentes
        </label>
      </div>

      {erro ? (
        <p className="px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-300">
          {erro}
        </p>
      ) : null}

      {porCategoria.length === 0 ? (
        <p className="text-center py-12 text-gray-400">
          Nenhuma chave com esse filtro. O cofre começa vazio — rode{" "}
          <code className="text-gray-300">npx tsx scripts/importar-credenciais.ts --aplicar</code>{" "}
          para carregar o inventário.
        </p>
      ) : null}

      {porCategoria.map(([nome, itens]) => (
        <section key={nome} className="space-y-2">
          <h2 className="text-xs uppercase font-semibold text-gray-400 tracking-wider">
            {ROTULO_CATEGORIA[nome] ?? nome} · {itens.length}
          </h2>

          <div className="border border-gray-800 rounded-xl overflow-hidden divide-y divide-gray-800">
            {itens.map((credencial) => {
              const emEdicao = editando === credencial.chave;
              const revelada = reveladas[credencial.chave];
              const trabalhando = ocupado === credencial.chave;

              return (
                <div key={credencial.chave} className="p-4 bg-gray-900 space-y-2">
                  <div className="flex flex-wrap items-center gap-3">
                    <code className="text-sm text-gray-200 font-mono">{credencial.chave}</code>
                    <span
                      title={EXPLICACAO_STATUS[credencial.status]}
                      className={`text-[11px] px-2 py-0.5 rounded-full border ${
                        CORES_STATUS[credencial.status] ?? CORES_STATUS.APOSENTADA
                      }`}
                    >
                      {credencial.status}
                    </span>
                    {!credencial.segredo ? (
                      <span className="text-[11px] text-gray-500">público</span>
                    ) : null}
                    <span className="text-xs text-gray-500 ml-auto">
                      {credencial.consumidores.length === 0
                        ? "nenhum código lê"
                        : `${credencial.consumidores.length} consumidor(es)`}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <code className="text-xs text-gray-400 font-mono break-all">
                      {revelada ?? credencial.mascara ?? "— sem valor —"}
                    </code>

                    {credencial.segredo && credencial.preenchida ? (
                      <button
                        type="button"
                        disabled={trabalhando}
                        onClick={() =>
                          revelada ? esconder(credencial.chave) : revelar(credencial.chave)
                        }
                        className="text-xs px-2 py-1 border border-gray-700 rounded text-gray-300 hover:border-gray-500"
                      >
                        {revelada ? "Esconder" : "Revelar"}
                      </button>
                    ) : null}

                    <button
                      type="button"
                      onClick={() => {
                        setEditando(emEdicao ? null : credencial.chave);
                        setRascunho("");
                      }}
                      className="text-xs px-2 py-1 border border-gray-700 rounded text-gray-300 hover:border-gray-500"
                    >
                      {emEdicao ? "Cancelar" : credencial.preenchida ? "Trocar" : "Preencher"}
                    </button>
                  </div>

                  {credencial.consumidores.length > 0 ? (
                    <details className="text-xs text-gray-500">
                      <summary className="cursor-pointer hover:text-gray-400">
                        Quem quebra se esta chave girar
                      </summary>
                      <ul className="mt-1 space-y-0.5 font-mono">
                        {credencial.consumidores.map((arquivo) => (
                          <li key={arquivo}>{arquivo}</li>
                        ))}
                      </ul>
                    </details>
                  ) : null}

                  {emEdicao ? (
                    <div className="flex flex-wrap gap-2 pt-1">
                      <input
                        type={credencial.segredo ? "password" : "text"}
                        value={rascunho}
                        onChange={(evento) => setRascunho(evento.target.value)}
                        placeholder="Novo valor"
                        autoComplete="off"
                        className="flex-1 min-w-[240px] bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-gray-200 font-mono"
                      />
                      <button
                        type="button"
                        disabled={trabalhando}
                        onClick={() => salvar(credencial.chave)}
                        className="text-sm px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg text-white"
                      >
                        {trabalhando ? "Salvando…" : "Salvar"}
                      </button>
                    </div>
                  ) : null}

                  {credencial.origem ? (
                    <p className="text-[11px] text-gray-600">
                      origem: {credencial.origem}
                      {credencial.rotacionadoEm
                        ? ` · girada em ${new Date(credencial.rotacionadoEm).toLocaleDateString("pt-BR")}`
                        : ""}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function Indicador({
  rotulo,
  valor,
  tom = "text-white",
}: {
  rotulo: string;
  valor: number;
  tom?: string;
}) {
  return (
    <div className="p-4 bg-gray-900 border border-gray-800 rounded-xl">
      <p className="text-xs text-gray-400">{rotulo}</p>
      <p className={`text-2xl font-semibold ${tom}`}>{valor}</p>
    </div>
  );
}

/** Espelha `mascarar()` do servidor para a lista não precisar de refetch. */
function mascararLocal(valor: string, segredo: boolean) {
  const limpo = valor.trim();
  if (!limpo) return null;
  if (!segredo) return limpo;
  if (limpo.length <= 8) return "•".repeat(Math.max(limpo.length, 4));
  return `${limpo.slice(0, 4)}…${limpo.slice(-4)}`;
}

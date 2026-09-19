"use client";

import { useMemo, useState } from "react";
import { Grupo, LinhaDobravel, LinhaInfo } from "@/components/sistema/Lista";
import BadgeStatus from "@/components/sistema/Status";
import { LogoSocial, type MarcaSocial } from "@/components/ui/LogoSocial";
import type { CredencialEmLista } from "@/lib/credenciais";
import { contar } from "@/lib/format";

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

/*
 * Logotipo do provedor de cada categoria. Mercado Pago, Mercado Livre e
 * "Outros" ficam de fora porque não há arquivo com procedência para eles em
 * `public/marca/social/`: categoria sem marca mostra só o título, que é
 * melhor do que a marca errada.
 */
const MARCA_CATEGORIA: Record<string, MarcaSocial> = {
  meta: "facebook",
  whatsapp: "whatsapp",
  instagram: "instagram",
  threads: "threads",
  google: "google",
  x: "x",
};

const EXPLICACAO_STATUS: Record<string, string> = {
  ATIVO: "Tem valor guardado no cofre.",
  PENDENTE: "Alguma parte do código lê esta chave, e ela ainda não tem valor.",
  APOSENTADA: "Nenhum código lê esta chave. É anotação, não configuração.",
};

/**
 * Data sem `toLocaleDateString()`: o formatador do Node e o do navegador não
 * chegam sempre ao mesmo texto, e o que o servidor escreve precisa bater letra
 * a letra com o que o cliente escreve, senão a hidratação quebra a tela
 * inteira. Fuso fixo em São Paulo, que é onde a chave foi girada.
 */
const DATA_CURTA = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "America/Sao_Paulo",
});

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
    <div className="pilha">
      <div className="servicos-resumo" role="group" aria-label="Resumo do cofre">
        <div>
          <span>Chaves no cofre</span>
          <strong>{resumo.total}</strong>
        </div>
        <div>
          <span>Com valor</span>
          <strong>{resumo.ativas}</strong>
        </div>
        <div>
          <span>Pendentes</span>
          <strong>{resumo.pendentes}</strong>
        </div>
        <div>
          <span>Sem consumidor</span>
          <strong>{resumo.aposentadas}</strong>
        </div>
      </div>

      <div className="barra-ferramentas">
        <label className="campo-busca">
          <span className="sr-only">Buscar chave</span>
          <input
            type="search"
            value={busca}
            onChange={(evento) => setBusca(evento.target.value)}
            placeholder="Buscar chave (ex.: META_APP)"
          />
        </label>
        <label>
          <span className="sr-only">Categoria</span>
          <select value={categoria} onChange={(evento) => setCategoria(evento.target.value)}>
            <option value="todas">Todas as categorias</option>
            {categorias.map((valor) => (
              <option key={valor} value={valor}>
                {ROTULO_CATEGORIA[valor] ?? valor}
              </option>
            ))}
          </select>
        </label>
        {/* Interruptor, não caixa de marcar: a caixa nativa dá 13px de alvo. */}
        <button
          type="button"
          className={somentePendentes ? "chip-filtro chip-filtro-ativo" : "chip-filtro"}
          aria-pressed={somentePendentes}
          onClick={() => setSomentePendentes((atual) => !atual)}
        >
          Só pendentes
        </button>
      </div>

      {erro ? (
        <Grupo>
          <LinhaInfo titulo="Não deu" descricao={erro} icone="fechar" tom="vermelho" />
        </Grupo>
      ) : null}

      {porCategoria.length === 0 ? (
        <Grupo>
          <LinhaInfo
            titulo="Nenhuma chave com esse filtro"
            descricao="Se o cofre está vazio, rode scripts/importar-credenciais.ts --aplicar para carregar o inventário."
          />
        </Grupo>
      ) : null}

      {porCategoria.map(([nome, itens]) => (
        <Grupo
          key={nome}
          titulo={`${ROTULO_CATEGORIA[nome] ?? nome} · ${itens.length}`}
          marca={
            MARCA_CATEGORIA[nome] ? <LogoSocial marca={MARCA_CATEGORIA[nome]} tamanho={16} /> : undefined
          }
        >
          {itens.map((credencial) => {
            const emEdicao = editando === credencial.chave;
            const revelada = reveladas[credencial.chave];
            const trabalhando = ocupado === credencial.chave;

            return (
              <LinhaDobravel
                key={credencial.chave}
                titulo={credencial.chave}
                descricao={credencial.mascara ?? "sem valor"}
                valor={
                  <BadgeStatus
                    status={credencial.status}
                    titulo={EXPLICACAO_STATUS[credencial.status]}
                  />
                }
              >
                <div>
                  <span className="rotulo">Valor</span>
                  <span className="valor font-mono">
                    {revelada ?? credencial.mascara ?? "— sem valor —"}
                  </span>
                </div>
                <div>
                  <span className="rotulo">Quem lê</span>
                  <span className="valor">
                    {credencial.consumidores.length === 0
                      ? "nenhum código lê"
                      : contar(credencial.consumidores.length, "consumidor", "consumidores")}
                  </span>
                </div>
                <div>
                  <span className="rotulo">Sigilo</span>
                  <span className="valor">
                    {credencial.segredo ? "segredo, sai mascarado" : "público, sai inteiro"}
                  </span>
                </div>
                {credencial.origem ? (
                  <div>
                    <span className="rotulo">Origem</span>
                    <span className="valor">{credencial.origem}</span>
                  </div>
                ) : null}
                {credencial.rotacionadoEm ? (
                  <div>
                    <span className="rotulo">Girada em</span>
                    <span className="valor">
                      {DATA_CURTA.format(new Date(credencial.rotacionadoEm))}
                    </span>
                  </div>
                ) : null}

                <div className="dobra-largura">
                  <div className="dobra-acoes">
                    {credencial.segredo && credencial.preenchida ? (
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={trabalhando}
                        onClick={() =>
                          revelada ? esconder(credencial.chave) : revelar(credencial.chave)
                        }
                      >
                        {revelada ? "Esconder" : "Revelar"}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => {
                        setEditando(emEdicao ? null : credencial.chave);
                        setRascunho("");
                      }}
                    >
                      {emEdicao ? "Cancelar" : credencial.preenchida ? "Trocar" : "Preencher"}
                    </button>
                  </div>

                  {emEdicao ? (
                    <div className="dobra-acoes">
                      <label className="campo-busca">
                        <span className="sr-only">Novo valor de {credencial.chave}</span>
                        <input
                          type={credencial.segredo ? "password" : "text"}
                          value={rascunho}
                          onChange={(evento) => setRascunho(evento.target.value)}
                          placeholder="Cole o novo valor"
                          autoComplete="off"
                        />
                      </label>
                      <button
                        type="button"
                        className="primary-button"
                        disabled={trabalhando}
                        onClick={() => salvar(credencial.chave)}
                      >
                        {trabalhando ? "Salvando…" : "Salvar"}
                      </button>
                    </div>
                  ) : null}

                  {credencial.consumidores.length > 0 ? (
                    <details className="detalhes-tecnicos">
                      <summary>Quem quebra se esta chave girar</summary>
                      <ul>
                        {credencial.consumidores.map((arquivo) => (
                          <li key={arquivo}>{arquivo}</li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                </div>
              </LinhaDobravel>
            );
          })}
        </Grupo>
      ))}
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

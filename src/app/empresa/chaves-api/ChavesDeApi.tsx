"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Grupo, LinhaDobravel } from "@/components/sistema/Lista";

export type ChaveListada = {
  id: string;
  nome: string;
  prefixo: string;
  escopos: string[];
  ultimoUsoEm: string | null;
  expiraEm: string | null;
  revogadaEm: string | null;
  createdAt: string;
};

const VALIDADES = [
  { dias: 30, rotulo: "30 dias" },
  { dias: 90, rotulo: "90 dias" },
  { dias: 365, rotulo: "1 ano" },
  { dias: 0, rotulo: "Sem validade" },
] as const;

function data(iso: string | null) {
  return iso
    ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })
    : "nunca";
}

function situacao(chave: ChaveListada): { texto: string; ativa: boolean } {
  if (chave.revogadaEm) return { texto: "Revogada", ativa: false };
  if (chave.expiraEm && new Date(chave.expiraEm).getTime() <= Date.now()) return { texto: "Expirada", ativa: false };
  return { texto: "Ativa", ativa: true };
}

/**
 * Criar, ver e revogar chaves de API.
 *
 * O segredo aparece uma única vez, logo depois de criar, com botão de copiar.
 * Fechou a tela sem copiar, cria outra: o servidor não tem como mostrar de
 * novo, porque não guarda.
 */
export default function ChavesDeApi({
  chaves,
  escopos,
}: {
  chaves: ChaveListada[];
  escopos: Record<string, string>;
}) {
  const router = useRouter();
  const [nome, setNome] = useState("");
  const [marcados, setMarcados] = useState<string[]>(Object.keys(escopos));
  const [validade, setValidade] = useState<number>(90);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [segredo, setSegredo] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  function alternar(escopo: string) {
    setMarcados((atual) => (atual.includes(escopo) ? atual.filter((e) => e !== escopo) : [...atual, escopo]));
  }

  async function criar() {
    setOcupado(true);
    setErro(null);
    setSegredo(null);
    setCopiado(false);
    try {
      const resposta = await fetch("/api/chaves-api", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nome, escopos: marcados, validadeEmDias: validade }),
      });
      const dados = (await resposta.json().catch(() => ({}))) as { error?: string; segredo?: string };
      if (!resposta.ok || !dados.segredo) throw new Error(dados.error ?? "Não consegui criar a chave.");
      setSegredo(dados.segredo);
      setNome("");
      router.refresh();
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : "Não consegui criar a chave.");
    } finally {
      setOcupado(false);
    }
  }

  async function copiar() {
    if (!segredo) return;
    try {
      await navigator.clipboard.writeText(segredo);
      setCopiado(true);
    } catch {
      setCopiado(false);
    }
  }

  async function revogar(chave: ChaveListada) {
    if (!window.confirm(`Revogar a chave "${chave.nome}"? Quem usa para de conseguir na hora.`)) return;
    setErro(null);
    const resposta = await fetch(`/api/chaves-api/${chave.id}`, { method: "DELETE" });
    if (!resposta.ok) {
      setErro("Não consegui revogar a chave.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="pilha">
      <Grupo titulo="Nova chave">
        <div className="credenciais-form">
          <label className="credencial-campo">
            <span>Quem vai usar</span>
            <input
              value={nome}
              maxLength={80}
              placeholder="Ex.: Claude Code, Codex, n8n"
              disabled={ocupado}
              onChange={(e) => setNome(e.target.value)}
            />
          </label>

          <fieldset className="chaves-escopos">
            <legend>O que ela pode fazer</legend>
            {Object.entries(escopos).map(([escopo, descricao]) => (
              <label key={escopo} className="chaves-escopo">
                <input
                  type="checkbox"
                  checked={marcados.includes(escopo)}
                  disabled={ocupado}
                  onChange={() => alternar(escopo)}
                />
                <span>
                  <code>{escopo}</code>
                  <small>{descricao}</small>
                </span>
              </label>
            ))}
          </fieldset>

          <label className="credencial-campo">
            <span>Validade</span>
            <select
              className="chaves-validade"
              value={validade}
              disabled={ocupado}
              onChange={(e) => setValidade(Number(e.target.value))}
            >
              {VALIDADES.map((v) => (
                <option key={v.dias} value={v.dias}>
                  {v.rotulo}
                </option>
              ))}
            </select>
          </label>

          <div className="credenciais-acoes">
            <button
              type="button"
              className="primary-button"
              disabled={ocupado || nome.trim().length < 3 || marcados.length === 0}
              onClick={() => void criar()}
            >
              {ocupado ? "Criando…" : "Criar chave"}
            </button>
            <small>
              A chave age em seu nome, só nos escopos marcados. Dinheiro, cofre e acessos continuam exigindo login.
            </small>
          </div>

          {segredo ? (
            <div className="chaves-segredo" role="status">
              <p>Copie agora. Esta chave não aparece de novo.</p>
              <code>{segredo}</code>
              <button type="button" className="secondary-button" onClick={() => void copiar()}>
                {copiado ? "Copiada" : "Copiar chave"}
              </button>
            </div>
          ) : null}

          {erro ? <p className="aviso-erro">{erro}</p> : null}
        </div>
      </Grupo>

      <Grupo titulo="Chaves criadas">
        {chaves.length === 0 ? (
          <p className="identidade-dica chaves-vazio">Nenhuma chave criada ainda.</p>
        ) : (
          chaves.map((chave) => {
            const estado = situacao(chave);
            return (
              <LinhaDobravel
                key={chave.id}
                titulo={chave.nome}
                descricao={`${chave.prefixo}… · último uso: ${data(chave.ultimoUsoEm)}`}
                icone="automacoes"
                tom={estado.ativa ? "azul" : "neutro"}
                valor={estado.texto}
              >
                <dl className="certificado-ficha">
                  <div>
                    <dt>Escopos</dt>
                    <dd>{chave.escopos.join(", ")}</dd>
                  </div>
                  <div>
                    <dt>Criada em</dt>
                    <dd>{data(chave.createdAt)}</dd>
                  </div>
                  <div>
                    <dt>Expira em</dt>
                    <dd>{chave.expiraEm ? data(chave.expiraEm) : "sem validade"}</dd>
                  </div>
                  {chave.revogadaEm ? (
                    <div>
                      <dt>Revogada em</dt>
                      <dd>{data(chave.revogadaEm)}</dd>
                    </div>
                  ) : null}
                </dl>
                {estado.ativa ? (
                  <button type="button" className="text-button" onClick={() => void revogar(chave)}>
                    Revogar
                  </button>
                ) : null}
              </LinhaDobravel>
            );
          })
        )}
      </Grupo>
    </div>
  );
}

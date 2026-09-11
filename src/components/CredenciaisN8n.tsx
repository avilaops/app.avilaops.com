"use client";

import { useCallback, useEffect, useState } from "react";
import Sheet from "@/components/ui/Sheet";
import { TIPOS_EDITAVEIS, type SituacaoCredencial } from "@/lib/n8n-credenciais";

/**
 * Cofre do n8n em tela de celular.
 *
 * Lista o que os fluxos usam, com o que falta primeiro. Toque abre a folha
 * com os campos daquele tipo; "Salvar" cria no n8n e religa os fluxos. OAuth
 * (Todoist, Google Drive, X) não tem como ser colado: a folha explica e leva
 * ao n8n, que nesse caso precisa de um navegador de computador.
 */
export default function CredenciaisN8n() {
  const [lista, setLista] = useState<SituacaoCredencial[] | null>(null);
  const [erroLista, setErroLista] = useState<string | null>(null);
  const [aberta, setAberta] = useState<SituacaoCredencial | null>(null);
  const [valores, setValores] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setErroLista(null);
    try {
      const r = await fetch("/api/n8n/credenciais", { cache: "no-store" });
      const j = (await r.json()) as { credenciais?: SituacaoCredencial[]; error?: string };
      if (!r.ok || !j.credenciais) throw new Error(j.error ?? "Não consegui listar.");
      setLista(j.credenciais);
    } catch (e) {
      setErroLista(e instanceof Error ? e.message : "Não consegui listar.");
      setLista([]);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(t);
  }, [toast]);

  function abrir(c: SituacaoCredencial) {
    setAberta(c);
    setValores({});
    setErro(null);
  }

  async function salvar() {
    if (!aberta) return;
    setSalvando(true);
    setErro(null);
    try {
      const r = await fetch("/api/n8n/credenciais", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: aberta.id, nome: aberta.nome, tipo: aberta.tipo, dados: valores }),
      });
      const j = (await r.json()) as { ok?: boolean; religados?: number; fluxos?: number; error?: string };
      if (!r.ok || !j.ok) throw new Error(j.error ?? "Não consegui salvar.");
      setToast(
        aberta.existe
          ? "Valor trocado."
          : j.fluxos
            ? `Criada e religada em ${j.religados} nó(s) de ${j.fluxos} fluxo(s).`
            : "Criada.",
      );
      setAberta(null);
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não consegui salvar.");
    } finally {
      setSalvando(false);
    }
  }

  const faltando = lista?.filter((c) => !c.existe) ?? [];
  const prontas = lista?.filter((c) => c.existe) ?? [];
  const tipo = aberta ? TIPOS_EDITAVEIS[aberta.tipo] : undefined;

  return (
    <section className="cred-n8n">
      {lista === null && <p className="cred-vazio">Lendo o cofre do n8n…</p>}
      {erroLista && <p className="form-error">{erroLista}</p>}

      {lista !== null && !erroLista && (
        <>
          <h2 className="cred-titulo">
            Faltando <span className="cred-contagem">{faltando.length}</span>
          </h2>
          {faltando.length === 0 ? (
            <p className="cred-vazio">Nenhuma. Tudo que os fluxos usam existe.</p>
          ) : (
            <ul className="ios-list">
              {faltando.map((c) => (
                <li key={c.id}>
                  <button type="button" className="ios-row" onClick={() => abrir(c)}>
                    <div className="ios-row-label">
                      <strong>{c.nome}</strong>
                      <small>
                        {c.tipoRotulo} · {c.nos} nó(s) em {c.fluxos.length} fluxo(s)
                        {c.oauth ? " · precisa conectar no n8n" : ""}
                      </small>
                    </div>
                    <span className="cred-estado cred-falta">falta</span>
                    <span className="chevron" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <h2 className="cred-titulo">
            Prontas <span className="cred-contagem">{prontas.length}</span>
          </h2>
          <ul className="ios-list">
            {prontas.map((c) => (
              <li key={c.id}>
                <button type="button" className="ios-row" onClick={() => abrir(c)}>
                  <div className="ios-row-label">
                    <strong>{c.nome}</strong>
                    <small>
                      {c.tipoRotulo} · {c.nos ? `${c.nos} nó(s) em ${c.fluxos.length} fluxo(s)` : "sem uso"}
                    </small>
                  </div>
                  <span className="cred-estado cred-ok">ok</span>
                  <span className="chevron" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {aberta && (
        <Sheet
          titulo={aberta.nome}
          aoFechar={() => !salvando && setAberta(null)}
          rodape={
            tipo ? (
              <button type="button" className="primary-button" onClick={salvar} disabled={salvando}>
                {salvando ? "Salvando…" : aberta.existe ? "Trocar valor" : "Criar e religar fluxos"}
              </button>
            ) : (
              <a className="primary-button" href="https://n8n.avilaops.com/home/credentials" target="_blank" rel="noreferrer">
                Abrir no n8n
              </a>
            )
          }
        >
          <p className="cred-uso">
            {aberta.tipoRotulo}
            {aberta.fluxos.length > 0 ? ` · usada em: ${aberta.fluxos.join(", ")}` : " · nenhum fluxo usa"}
          </p>

          {tipo ? (
            tipo.campos.map((campo) => (
              <label key={campo.nome} className="field">
                <span>{campo.rotulo}</span>
                {campo.longo ? (
                  <textarea
                    rows={3}
                    value={valores[campo.nome] ?? ""}
                    onChange={(e) => setValores((v) => ({ ...v, [campo.nome]: e.target.value }))}
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                ) : (
                  <input
                    value={valores[campo.nome] ?? ""}
                    onChange={(e) => setValores((v) => ({ ...v, [campo.nome]: e.target.value }))}
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                )}
                {campo.ajuda && <small className="field-help">{campo.ajuda}</small>}
              </label>
            ))
          ) : aberta.oauth ? (
            <p className="cred-ajuda">
              Esta é uma conexão OAuth: o serviço pede login e consentimento, não uma chave para colar. Abra o n8n num
              navegador de computador, entre nesta credencial e toque em <strong>Conectar</strong>.
            </p>
          ) : (
            <p className="cred-ajuda">Este tipo ({aberta.tipo}) ainda não tem formulário aqui. Abra no n8n.</p>
          )}

          {aberta.existe && tipo && (
            <p className="cred-ajuda">Já existe. Colar um valor novo substitui o atual; os fluxos continuam ligados.</p>
          )}
          {erro && <p className="form-error">{erro}</p>}
        </Sheet>
      )}

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </section>
  );
}

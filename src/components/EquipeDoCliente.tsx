"use client";

import { useState } from "react";

type Usuario = {
  id: string;
  nome: string;
  email: string;
  telefone: string | null;
  papel: "ADMIN" | "CLIENT";
  ativo: boolean;
  senhaProvisoria: boolean;
  ultimoAcessoEm: string | null;
};

/**
 * Equipe da empresa, na mão do dono do negócio.
 *
 * A senha provisória aparece uma vez, aqui, para ele repassar como preferir
 * (WhatsApp, pessoalmente). Não é guardada nem enviada por e-mail nesta v1:
 * mandar senha por e-mail sem confirmar o endereço é pior do que ditar.
 */
export default function EquipeDoCliente({ iniciais }: { iniciais: Usuario[] }) {
  const [usuarios, setUsuarios] = useState(iniciais);
  const [aberto, setAberto] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [senhaNova, setSenhaNova] = useState<{ email: string; senha: string } | null>(null);

  async function chamar(corpo: Record<string, unknown>) {
    setOcupado(true);
    setErro(null);
    try {
      const r = await fetch("/api/portal/usuarios", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(corpo),
      });
      const dados = await r.json();
      if (!r.ok) {
        setErro(dados.error ?? "Não foi possível concluir.");
        return null;
      }
      const lista = await fetch("/api/portal/usuarios").then((x) => x.json());
      setUsuarios(lista.usuarios ?? []);
      return dados;
    } finally {
      setOcupado(false);
    }
  }

  async function criar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const f = new FormData(evento.currentTarget);
    const dados = await chamar({
      nome: String(f.get("nome") ?? ""),
      email: String(f.get("email") ?? ""),
      telefone: String(f.get("telefone") ?? ""),
      papel: String(f.get("papel") ?? "CLIENT"),
    });
    if (dados?.senha) {
      setSenhaNova({ email: dados.usuario.email, senha: dados.senha });
      setAberto(false);
      evento.currentTarget.reset();
    }
  }

  return (
    <section className="portal-card">
      <div className="portal-card-topo">
        <h2>Quem tem acesso</h2>
        <button type="button" className="secondary-button" onClick={() => setAberto((v) => !v)} disabled={ocupado}>
          {aberto ? "Cancelar" : "Dar acesso a alguém"}
        </button>
      </div>

      {erro && <p className="portal-erro">{erro}</p>}

      {senhaNova && (
        <div className="portal-senha">
          <strong>Senha de {senhaNova.email}</strong>
          <code>{senhaNova.senha}</code>
          <p>Anote e repasse agora: ela não aparece de novo. No primeiro acesso o sistema pede uma senha nova.</p>
          <button type="button" className="text-button" onClick={() => setSenhaNova(null)}>Já anotei</button>
        </div>
      )}

      {aberto && (
        <form className="portal-form" onSubmit={criar}>
          <label>Nome<input name="nome" required minLength={2} placeholder="Maria da Silva" /></label>
          <label>E-mail<input name="email" type="email" required placeholder="maria@suaempresa.com.br" /></label>
          <label>Telefone<input name="telefone" placeholder="(16) 99999-0000" /></label>
          <label>
            O que essa pessoa faz
            <select name="papel" defaultValue="CLIENT">
              <option value="CLIENT">Usa o sistema (equipe)</option>
              <option value="ADMIN">Administra junto comigo</option>
            </select>
          </label>
          <button type="submit" className="primary-button" disabled={ocupado}>Criar acesso</button>
        </form>
      )}

      {usuarios.length === 0 ? (
        <p className="portal-muted">Só você tem acesso por enquanto.</p>
      ) : (
        <ul className="portal-list">
          {usuarios.map((u) => (
            <li key={u.id}>
              <span>
                {u.nome}
                {!u.ativo && <em className="portal-tag">desligado</em>}
                {u.senhaProvisoria && u.ativo && <em className="portal-tag">senha provisória</em>}
                <small>{u.email} · {u.papel === "ADMIN" ? "administra" : "usa o sistema"}</small>
              </span>
              <span className="portal-acoes">
                <button type="button" className="text-button" disabled={ocupado} onClick={() => chamar({ acao: "senha", id: u.id }).then((d) => d?.senha && setSenhaNova({ email: u.email, senha: d.senha }))}>
                  Nova senha
                </button>
                <button type="button" className="text-button" disabled={ocupado} onClick={() => chamar({ acao: "ativo", id: u.id, ativo: !u.ativo })}>
                  {u.ativo ? "Desligar" : "Religar"}
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

"use client";

import { useState } from "react";

/**
 * Primeiro passo do autoatendimento de e-mail: a pessoa informa o domínio,
 * recebe os registros de DNS e confere quando publicar.
 *
 * A tela fala direto com as rotas públicas do `mail.avilaops.com`, sem passar
 * pelo servidor do app: elas não têm token nem efeito colateral, e o desvio só
 * acrescentaria uma peça para quebrar.
 *
 * O que esta tela NÃO faz: não cria domínio, não cria caixa e não cobra. Ela
 * termina no ponto em que o cliente sabe que o DNS está pronto — a cobrança e
 * o provisionamento são o passo seguinte do plano.
 */

const API = "https://mail.avilaops.com/api/v1/public/signup";

interface Registro {
  type: string;
  host: string;
  value: string;
  priority?: number;
  purpose: string;
}

interface Conferencia {
  pronto: boolean;
  checks: Record<string, boolean>;
  faltando: string[];
}

const NOME_DO_CHECK: Record<string, string> = {
  mx: "MX (recebe e-mail)",
  spf: "SPF (autoriza o envio)",
  dkim: "DKIM (assina as mensagens)",
  dmarc: "DMARC (protege contra falsificação)",
};

export default function EmailAutoatendimento() {
  const [dominio, setDominio] = useState("");
  const [registros, setRegistros] = useState<Registro[] | null>(null);
  const [dominioLimpo, setDominioLimpo] = useState("");
  const [conferencia, setConferencia] = useState<Conferencia | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);

  async function chamar<T>(caminho: string): Promise<T> {
    const r = await fetch(`${API}/${caminho}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain: dominio }),
    });
    const corpo = await r.json().catch(() => ({}));
    if (!r.ok) {
      throw new Error(corpo?.error?.message ?? "Não consegui falar com o servidor de e-mail.");
    }
    return corpo as T;
  }

  async function pedirRegistros(evento: React.FormEvent) {
    evento.preventDefault();
    setOcupado(true);
    setErro(null);
    setConferencia(null);
    try {
      const dados = await chamar<{ dominio: string; registros: Registro[] }>("dns");
      setDominioLimpo(dados.dominio);
      setRegistros(dados.registros);
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : "Não deu certo.");
    } finally {
      setOcupado(false);
    }
  }

  async function conferir() {
    setOcupado(true);
    setErro(null);
    try {
      setConferencia(await chamar<Conferencia>("verify"));
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : "Não deu certo.");
    } finally {
      setOcupado(false);
    }
  }

  async function copiar(valor: string, id: string) {
    try {
      await navigator.clipboard.writeText(valor);
      setCopiado(id);
      window.setTimeout(() => setCopiado(null), 1500);
    } catch {
      // Navegador sem permissão de área de transferência: o valor continua
      // selecionável na tela, então não vale interromper com um aviso.
    }
  }

  return (
    <main className="autoatendimento">
      <header>
        <h1>E-mail com o domínio da sua empresa</h1>
        <p className="autoatendimento-sub">
          R$ 10 por caixa, por mês. Comece informando o domínio: mostramos exatamente o que
          configurar no DNS e conferimos para você.
        </p>
      </header>

      <form onSubmit={pedirRegistros} className="autoatendimento-form">
        <label htmlFor="dominio">Domínio da empresa</label>
        <div className="autoatendimento-linha">
          <input
            id="dominio"
            value={dominio}
            onChange={(e) => setDominio(e.target.value)}
            placeholder="suaempresa.com.br"
            autoComplete="off"
            spellCheck={false}
            required
          />
          <button type="submit" disabled={ocupado || dominio.trim().length < 4}>
            {ocupado && !registros ? "Consultando…" : "Ver o que configurar"}
          </button>
        </div>
      </form>

      {erro && <p className="autoatendimento-erro">{erro}</p>}

      {registros && (
        <section className="autoatendimento-registros">
          <h2>Registros de DNS para {dominioLimpo}</h2>
          <p className="autoatendimento-sub">
            Publique os quatro no painel onde o domínio está registrado. Se preferir, a gente
            faz por você: é só chamar no WhatsApp.
          </p>

          <ul>
            {registros.map((r) => {
              const id = `${r.type}-${r.host}`;
              return (
                <li key={id}>
                  <div className="autoatendimento-registro-topo">
                    <span className="autoatendimento-tipo">{r.type}</span>
                    <code>{r.host}</code>
                    <button type="button" onClick={() => void copiar(r.value, id)}>
                      {copiado === id ? "copiado" : "copiar valor"}
                    </button>
                  </div>
                  <code className="autoatendimento-valor">{r.value}</code>
                  {r.priority !== undefined && (
                    <span className="autoatendimento-nota">prioridade {r.priority}</span>
                  )}
                  <p className="autoatendimento-nota">{r.purpose}</p>
                </li>
              );
            })}
          </ul>

          <button type="button" onClick={() => void conferir()} disabled={ocupado} className="autoatendimento-conferir">
            {ocupado ? "Conferindo…" : "Já configurei, conferir agora"}
          </button>

          <p className="autoatendimento-nota">
            A propagação leva de minutos a algumas horas. Pode fechar a página e voltar depois.
          </p>
        </section>
      )}

      {conferencia && (
        <section
          className={conferencia.pronto ? "autoatendimento-ok" : "autoatendimento-pendente"}
        >
          <h2>{conferencia.pronto ? "DNS pronto" : "Ainda falta configurar"}</h2>

          <ul className="autoatendimento-checks">
            {Object.entries(conferencia.checks).map(([nome, ok]) => (
              <li key={nome} className={ok ? "ok" : "falta"}>
                <span aria-hidden>{ok ? "✓" : "•"}</span>
                {NOME_DO_CHECK[nome] ?? nome}
              </li>
            ))}
          </ul>

          {conferencia.pronto ? (
            <p>
              O domínio está configurado corretamente. O próximo passo é criar as caixas — fale
              com a gente para escolher os endereços e trazer os e-mails antigos.
            </p>
          ) : (
            <p>
              Faltam <strong>{conferencia.faltando.join(", ")}</strong>. Se acabou de publicar,
              espere alguns minutos e confira de novo: o DNS demora a propagar.
            </p>
          )}

          <a
            className="autoatendimento-whatsapp"
            href={`https://wa.me/5517991053597?text=${encodeURIComponent(
              `Oi! Quero e-mail no domínio ${dominioLimpo}.`,
            )}`}
          >
            Falar no WhatsApp
          </a>
        </section>
      )}
    </main>
  );
}

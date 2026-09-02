"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Autoatendimento de e-mail, do domínio até a caixa pronta.
 *
 * Três etapas na mesma tela: a pessoa informa o domínio, publica os registros
 * de DNS e confere; com o DNS de pé, escolhe o endereço e paga; de volta do
 * Mercado Pago, a tela acompanha até o provisionamento terminar.
 *
 * Fala direto com as rotas públicas do `mail.avilaops.com`, sem passar pelo
 * servidor do app: elas não têm token, e o desvio só acrescentaria uma peça
 * para quebrar.
 *
 * Nada aqui provisiona. O botão de comprar cria a assinatura e devolve o link
 * do Mercado Pago; domínio e caixa nascem do outro lado, quando o pagamento é
 * confirmado. É o que impede caixa de e-mail de graça para quem chamar a rota.
 */

const API = "https://mail.avilaops.com/api/v1/public/signup";
const PRECO_POR_CAIXA = 10;

interface Registro {
  type: string;
  host: string;
  value: string;
  priority?: number;
  purpose: string;
}

interface Conferencia {
  dominio: string;
  pronto: boolean;
  checks: Record<string, boolean>;
  faltando: string[];
}

interface Pedido {
  domain: string;
  localPart: string;
  mailboxCount: number;
  status: string;
  initPoint: string | null;
  endereco: string | null;
  provisionedAt: string | null;
}

const NOME_DO_CHECK: Record<string, string> = {
  mx: "MX (recebe e-mail)",
  spf: "SPF (autoriza o envio)",
  dkim: "DKIM (assina as mensagens)",
  dmarc: "DMARC (protege contra falsificação)",
};

function reais(centavosPorCaixa: number, caixas: number): string {
  return (centavosPorCaixa * caixas).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function EmailAutoatendimento() {
  const [dominio, setDominio] = useState("");
  const [registros, setRegistros] = useState<Registro[] | null>(null);
  const [dominioLimpo, setDominioLimpo] = useState("");
  const [conferencia, setConferencia] = useState<Conferencia | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);

  // Compra
  const [emailContato, setEmailContato] = useState("");
  const [nomeContato, setNomeContato] = useState("");
  const [caixaDesejada, setCaixaDesejada] = useState("contato");
  const [quantidade, setQuantidade] = useState(1);

  // Pedido em andamento (volta do Mercado Pago pela URL)
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [tokenDoPedido, setTokenDoPedido] = useState<string | null>(null);

  async function chamar<T>(caminho: string, corpo: unknown): Promise<T> {
    const r = await fetch(`${API}/${caminho}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    });
    const resposta = await r.json().catch(() => ({}));
    if (!r.ok) {
      throw new Error(resposta?.error?.message ?? "Não consegui falar com o servidor de e-mail.");
    }
    return resposta as T;
  }

  const buscarPedido = useCallback(async (token: string) => {
    const r = await fetch(`${API}/pedido/${encodeURIComponent(token)}`);
    if (!r.ok) return null;
    return (await r.json()) as Pedido;
  }, []);

  /**
   * Quem volta do Mercado Pago chega com `?pedido=<token>` na URL. A tela
   * assume esse pedido e passa a acompanhá-lo: sem isto a pessoa pagaria e
   * cairia num formulário em branco, sem saber se deu certo.
   */
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("pedido");
    if (!token) return;
    setTokenDoPedido(token);
    void buscarPedido(token).then((p) => {
      if (p) setPedido(p);
    });
  }, [buscarPedido]);

  /**
   * Enquanto o pagamento não vira caixa, a tela pergunta de novo.
   *
   * O webhook do Mercado Pago pode chegar depois do cliente: ele volta para cá
   * em segundos, e a confirmação às vezes leva um minuto. Sem esta espera a
   * pessoa veria "aguardando pagamento" e concluiria que não funcionou.
   */
  useEffect(() => {
    if (!tokenDoPedido || !pedido) return;
    if (pedido.status === "provisionado" || pedido.status === "expirado") return;

    const timer = window.setInterval(() => {
      void buscarPedido(tokenDoPedido).then((p) => {
        if (p) setPedido(p);
      });
    }, 5000);
    return () => window.clearInterval(timer);
  }, [tokenDoPedido, pedido, buscarPedido]);

  async function pedirRegistros(evento: React.FormEvent) {
    evento.preventDefault();
    setOcupado(true);
    setErro(null);
    setConferencia(null);
    try {
      const dados = await chamar<{ dominio: string; registros: Registro[] }>("dns", { domain: dominio });
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
      setConferencia(await chamar<Conferencia>("verify", { domain: dominio }));
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : "Não deu certo.");
    } finally {
      setOcupado(false);
    }
  }

  async function comprar(evento: React.FormEvent) {
    evento.preventDefault();
    setOcupado(true);
    setErro(null);
    try {
      const r = await chamar<{ token: string; initPoint: string | null }>("checkout", {
        domain: dominioLimpo || dominio,
        payerEmail: emailContato,
        payerName: nomeContato || undefined,
        localPart: caixaDesejada,
        mailboxCount: quantidade,
      });
      if (!r.initPoint) throw new Error("O pagamento não pôde ser aberto. Fale com a gente.");
      // Sai daqui direto para o Mercado Pago. O token volta na URL de retorno,
      // e o `useEffect` lá em cima assume o acompanhamento.
      window.location.href = r.initPoint;
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : "Não deu certo.");
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

  // Quem voltou do pagamento vê só o andamento do pedido: repetir o formulário
  // de compra embaixo convidaria a comprar duas vezes.
  if (pedido) {
    const pronto = pedido.status === "provisionado";
    return (
      <main className="autoatendimento">
        <header>
          <h1>{pronto ? "Sua caixa está pronta" : "Confirmando o pagamento"}</h1>
        </header>

        <section className={pronto ? "autoatendimento-ok" : "autoatendimento-pendente"}>
          {pronto ? (
            <>
              <h2>{pedido.endereco}</h2>
              <p>
                Enviamos a senha provisória para <strong>o e-mail de contato do cadastro</strong>. Ela
                vale até o primeiro acesso, e no primeiro acesso você escolhe a sua.
              </p>
              <a className="autoatendimento-whatsapp" href="https://mail.avilaops.com">
                Abrir o webmail
              </a>
              <p className="autoatendimento-nota">
                Nos primeiros dias a caixa envia menos mensagens por hora. É proteção de reputação:
                servidor novo que dispara muito cai no spam de todo mundo. O limite sobe sozinho.
              </p>
            </>
          ) : (
            <>
              <p>
                Estamos confirmando o pagamento com o Mercado Pago. Assim que ele confirmar, criamos o
                domínio e a caixa <strong>{pedido.localPart}@{pedido.domain}</strong> e avisamos por
                e-mail. Costuma levar menos de um minuto.
              </p>
              <p className="autoatendimento-nota">
                Pode fechar esta página: o aviso chega por e-mail de qualquer forma.
              </p>
            </>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className="autoatendimento">
      <header>
        <h1>E-mail com o domínio da sua empresa</h1>
        <p className="autoatendimento-sub">
          R$ {PRECO_POR_CAIXA} por caixa, por mês. Comece informando o domínio: mostramos exatamente o
          que configurar no DNS e conferimos para você.
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

      {registros && !conferencia?.pronto && (
        <section className="autoatendimento-registros">
          <h2>Registros de DNS para {dominioLimpo}</h2>
          <p className="autoatendimento-sub">
            Publique os quatro no painel onde o domínio está registrado. Se preferir, a gente faz por
            você: é só chamar no WhatsApp.
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

          <button
            type="button"
            onClick={() => void conferir()}
            disabled={ocupado}
            className="autoatendimento-conferir"
          >
            {ocupado ? "Conferindo…" : "Já configurei, conferir agora"}
          </button>

          <p className="autoatendimento-nota">
            A propagação leva de minutos a algumas horas. Pode fechar a página e voltar depois.
          </p>
        </section>
      )}

      {conferencia && !conferencia.pronto && (
        <section className="autoatendimento-pendente">
          <h2>Ainda falta configurar</h2>
          <ul className="autoatendimento-checks">
            {Object.entries(conferencia.checks).map(([nome, ok]) => (
              <li key={nome} className={ok ? "ok" : "falta"}>
                <span aria-hidden>{ok ? "✓" : "•"}</span>
                {NOME_DO_CHECK[nome] ?? nome}
              </li>
            ))}
          </ul>
          <p>
            Faltam <strong>{conferencia.faltando.join(", ")}</strong>. Se acabou de publicar, espere
            alguns minutos e confira de novo: o DNS demora a propagar.
          </p>
        </section>
      )}

      {conferencia?.pronto && (
        <section className="autoatendimento-ok">
          <h2>DNS pronto. Agora é escolher o endereço.</h2>
          <ul className="autoatendimento-checks">
            {Object.entries(conferencia.checks).map(([nome, ok]) => (
              <li key={nome} className={ok ? "ok" : "falta"}>
                <span aria-hidden>{ok ? "✓" : "•"}</span>
                {NOME_DO_CHECK[nome] ?? nome}
              </li>
            ))}
          </ul>

          <form onSubmit={comprar} className="autoatendimento-form">
            <label htmlFor="caixa">Primeiro endereço</label>
            <div className="autoatendimento-linha autoatendimento-endereco">
              <input
                id="caixa"
                value={caixaDesejada}
                onChange={(e) => setCaixaDesejada(e.target.value)}
                placeholder="contato"
                autoComplete="off"
                spellCheck={false}
                required
              />
              <span className="autoatendimento-arroba">@{conferencia.dominio}</span>
            </div>

            <label htmlFor="quantidade">Quantas caixas</label>
            <select
              id="quantidade"
              value={quantidade}
              onChange={(e) => setQuantidade(Number(e.target.value))}
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n} caixa{n > 1 ? "s" : ""} — {reais(PRECO_POR_CAIXA, n)} por mês
                </option>
              ))}
            </select>
            <p className="autoatendimento-nota">
              Criamos a primeira agora. As demais entram já pagas, e você escolhe os endereços com a
              gente. Acima de cinco, fale conosco.
            </p>

            <label htmlFor="contato">Seu e-mail (para receber a senha)</label>
            <input
              id="contato"
              type="email"
              value={emailContato}
              onChange={(e) => setEmailContato(e.target.value)}
              placeholder="voce@outroprovedor.com"
              autoComplete="email"
              required
            />
            <p className="autoatendimento-nota">
              Precisa ser um endereço que você já lê hoje: a senha da caixa nova vai para ele.
            </p>

            <label htmlFor="nome">Seu nome</label>
            <input
              id="nome"
              value={nomeContato}
              onChange={(e) => setNomeContato(e.target.value)}
              autoComplete="name"
            />

            <button type="submit" disabled={ocupado || !emailContato || !caixaDesejada}>
              {ocupado ? "Abrindo o pagamento…" : `Assinar por ${reais(PRECO_POR_CAIXA, quantidade)} por mês`}
            </button>
            <p className="autoatendimento-nota">
              Você vai para o Mercado Pago cadastrar o cartão. A caixa é criada quando o pagamento é
              confirmado, e não antes.
            </p>
          </form>
        </section>
      )}

      {conferencia && (
        <a
          className="autoatendimento-whatsapp"
          href={`https://wa.me/5517991053597?text=${encodeURIComponent(
            `Oi! Quero e-mail no domínio ${dominioLimpo}.`,
          )}`}
        >
          Prefiro falar no WhatsApp
        </a>
      )}
    </main>
  );
}

"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import Sheet from "@/components/ui/Sheet";
import { CODIGO_CONFIRMACAO_NECESSARIA } from "@/lib/confirmacao-codigo";

/**
 * Pede a senha de novo quando a rota exige, e repete o pedido original.
 *
 * Quem chama não precisa saber se a confirmação ainda vale: embrulha o `fetch`
 * em `executar` e recebe a resposta final. Se a rota respondeu "confirme a
 * senha", a folha abre, a senha é conferida e o mesmo pedido sai outra vez.
 * Quem fecha a folha sem confirmar recebe a recusa original, com o recado
 * pronto para a tela mostrar.
 *
 *   const { executar, folha } = useConfirmacaoDeSenha();
 *   const resposta = await executar(() => fetch("/api/…", { method: "POST" }));
 *   return <>{…}{folha}</>;
 */
export function useConfirmacaoDeSenha() {
  const [aberta, setAberta] = useState(false);
  const resolver = useRef<((confirmou: boolean) => void) | null>(null);

  // Estáveis de propósito: a `Sheet` refaz o foco quando `aoFechar` muda, e
  // uma função nova a cada tecla tiraria o cursor do campo de senha.
  const encerrar = useCallback((confirmou: boolean) => {
    resolver.current?.(confirmou);
    resolver.current = null;
    setAberta(false);
  }, []);
  const cancelar = useCallback(() => encerrar(false), [encerrar]);
  const confirmar = useCallback(() => encerrar(true), [encerrar]);

  const executar = useCallback(async (pedido: () => Promise<Response>): Promise<Response> => {
    const resposta = await pedido();
    if (resposta.status !== 403) return resposta;

    const dados = (await resposta.clone().json().catch(() => null)) as { codigo?: string } | null;
    if (dados?.codigo !== CODIGO_CONFIRMACAO_NECESSARIA) return resposta;

    const confirmou = await new Promise<boolean>((resolve) => {
      resolver.current = resolve;
      setAberta(true);
    });
    return confirmou ? pedido() : resposta;
  }, []);

  const folha = aberta ? <FolhaDeSenha aoConfirmar={confirmar} aoCancelar={cancelar} /> : null;
  return { executar, folha };
}

function FolhaDeSenha({
  aoConfirmar,
  aoCancelar,
}: {
  aoConfirmar: () => void;
  aoCancelar: () => void;
}) {
  const formularioId = useId();
  const [senha, setSenha] = useState("");
  const [conferindo, setConferindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const campo = useRef<HTMLInputElement>(null);

  // A `Sheet` leva o foco para o painel ao montar. O efeito do pai roda depois
  // do efeito do filho, então este devolve o cursor ao campo — `autoFocus`
  // perderia a corrida.
  useEffect(() => {
    campo.current?.focus();
  }, []);

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (!senha || conferindo) return;
    setConferindo(true);
    setErro(null);
    try {
      const resposta = await fetch("/api/empresa/confirmar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ senha }),
      });
      const dados = (await resposta.json().catch(() => ({}))) as { erro?: string };
      if (!resposta.ok) throw new Error(dados.erro ?? "Não consegui conferir a senha.");
      aoConfirmar();
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : "Não consegui conferir a senha.");
      setConferindo(false);
    }
  }

  return (
    <Sheet
      titulo="Confirme sua senha"
      aoFechar={aoCancelar}
      rodape={
        <>
          <button type="submit" form={formularioId} className="primary-button" disabled={conferindo || !senha}>
            {conferindo ? "Conferindo…" : "Confirmar"}
          </button>
          <button type="button" className="secondary-button" onClick={aoCancelar} disabled={conferindo}>
            Cancelar
          </button>
        </>
      }
    >
      <form id={formularioId} className="confirmacao" onSubmit={enviar}>
        <p>Isto mexe em segredo da empresa. Digite a senha deste painel para continuar.</p>
        <label className="credencial-campo">
          <span>Senha</span>
          <input
            type="password"
            autoComplete="current-password"
            ref={campo}
            value={senha}
            disabled={conferindo}
            onChange={(evento) => setSenha(evento.target.value)}
          />
          <small>
            Vale por 5 minutos. É a senha do login por CPF ou e-mail;{" "}
            <Link href="/esqueci-senha">esqueci a senha</Link>.
          </small>
        </label>
        {erro ? <p className="aviso-erro">{erro}</p> : null}
      </form>
    </Sheet>
  );
}

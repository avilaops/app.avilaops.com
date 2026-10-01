"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Icone } from "@/components/ui/Icones";

/**
 * Busca e filtros da lista de clientes. Tudo mora na URL (`?q=&status=&ordem=`):
 * o link da busca pode ser mandado para alguém, o voltar do navegador
 * funciona, e a página continua sendo renderizada no servidor.
 *
 * Funciona sem JavaScript também: é um `<form method="get">` comum. Com
 * JavaScript, a busca roda enquanto se digita, com uma pausa curta para não
 * disparar uma consulta por tecla.
 */
export default function FiltroClientes({
  q,
  status,
  ordem,
}: {
  q: string;
  status: string;
  ordem: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [texto, setTexto] = useState(q);
  const [pendente, iniciar] = useTransition();
  const primeiro = useRef(true);

  function navegar(mudancas: Record<string, string>) {
    const proximo = new URLSearchParams(params.toString());
    for (const [chave, valor] of Object.entries(mudancas)) {
      if (valor) proximo.set(chave, valor);
      else proximo.delete(chave);
    }
    // Filtro novo sempre volta para a primeira página: ficar na página 40 de
    // uma busca que agora tem 3 resultados mostra uma tela vazia.
    proximo.delete("pagina");
    const query = proximo.toString();
    iniciar(() => router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false }));
  }

  useEffect(() => {
    if (primeiro.current) {
      primeiro.current = false;
      return;
    }
    const espera = setTimeout(() => {
      if (texto.trim() !== q) navegar({ q: texto.trim() });
    }, 280);
    return () => clearTimeout(espera);
    // `navegar` e `q` mudam a cada navegação; só o texto digitado dispara.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto]);

  return (
    <form
      className="filtro-clientes"
      method="get"
      role="search"
      onSubmit={(evento) => {
        evento.preventDefault();
        navegar({ q: texto.trim() });
      }}
    >
      <label className="filtro-clientes-busca">
        <Icone nome="busca" tamanho={16} />
        <span className="sr-only">Buscar cliente</span>
        <input
          type="search"
          name="q"
          value={texto}
          onChange={(evento) => setTexto(evento.target.value)}
          placeholder="Nome, razão social, CNPJ, nº, contato, e-mail ou telefone"
          autoComplete="off"
          enterKeyHint="search"
        />
        {pendente ? <span className="filtro-clientes-carregando" aria-hidden="true" /> : null}
      </label>
      <label>
        <span className="sr-only">Situação</span>
        <select name="status" value={status} onChange={(evento) => navegar({ status: evento.target.value === "abertos" ? "" : evento.target.value })}>
          <option value="abertos">Em aberto</option>
          <option value="ACTIVE">Ativos</option>
          <option value="ONBOARDING">Em implantação</option>
          <option value="PAUSED">Pausados</option>
          <option value="ARCHIVED">Arquivados</option>
          <option value="todos">Todos</option>
        </select>
      </label>
      <label>
        <span className="sr-only">Ordem</span>
        <select name="ordem" value={ordem} onChange={(evento) => navegar({ ordem: evento.target.value === "nome" ? "" : evento.target.value })}>
          <option value="nome">A–Z</option>
          <option value="recentes">Mais recentes</option>
          <option value="numero">Nº do cliente</option>
        </select>
      </label>
      <noscript>
        <button type="submit" className="secondary-button">Buscar</button>
      </noscript>
    </form>
  );
}

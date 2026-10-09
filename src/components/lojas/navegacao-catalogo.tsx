"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useSyncExternalStore, useTransition, type ComponentProps, type ReactNode } from "react";

/**
 * A navegação do catálogo, com o "carregando" que a tela precisa.
 *
 * Filtro, ordenação e página mudam o endereço, e quem refaz a lista é o
 * servidor. Entre o clique e a resposta a lista antiga continua na tela — e sem
 * aviso ela pareceria ser o resultado do filtro novo. Este módulo guarda
 * "há uma navegação do catálogo em curso" num lugar só, para o controle que foi
 * clicado e a lista (que são componentes separados) concordarem.
 */
let pendentes = 0;
const ouvintes = new Set<() => void>();
const avisar = () => ouvintes.forEach((o) => o());
const assinar = (ouvinte: () => void) => {
  ouvintes.add(ouvinte);
  return () => ouvintes.delete(ouvinte);
};

function usePendente() {
  return useSyncExternalStore(assinar, () => pendentes > 0, () => false);
}

/** Navega para um endereço do catálogo marcando a lista como "carregando" até a resposta chegar. */
export function useNavegarCatalogo() {
  const router = useRouter();
  // A transição do React fica pendente até o servidor devolver a página nova:
  // é ela que sabe quando a navegação acabou.
  const [pendente, iniciar] = useTransition();

  useEffect(() => {
    if (!pendente) return;
    pendentes += 1;
    avisar();
    return () => {
      pendentes -= 1;
      avisar();
    };
  }, [pendente]);

  return useCallback(
    // `scroll: false`: trocar filtro não joga a pessoa para o topo da página.
    (href: string) => iniciar(() => router.push(href, { scroll: false })),
    [router],
  );
}

/** Um link do catálogo: `<a>` de verdade (abre em nova aba, funciona sem script), com o carregando. */
export function LinkCatalogo({ href, onClick, ...resto }: ComponentProps<typeof Link> & { href: string }) {
  const navegar = useNavegarCatalogo();
  return (
    <Link
      href={href}
      scroll={false}
      {...resto}
      onClick={(evento) => {
        onClick?.(evento);
        if (evento.defaultPrevented || evento.metaKey || evento.ctrlKey || evento.shiftKey || evento.button !== 0) return;
        evento.preventDefault();
        navegar(href);
      }}
    />
  );
}

/**
 * A moldura do resultado. Enquanto a consulta nova não chega, diz que está
 * carregando (para leitor de tela e para o olho) em vez de deixar a lista
 * antiga passar por resposta do filtro novo.
 */
export function ResultadoDoCatalogo({ children }: { children: ReactNode }) {
  const pendente = usePendente();

  // Voltando da ficha de um produto, o endereço traz `#p-<id>`. A linha existe
  // duas vezes (tabela no desktop, lista no celular) e só uma está visível:
  // rola até a que aparece, e no celular já abre o item.
  useEffect(() => {
    const id = window.location.hash.startsWith("#p-") ? window.location.hash.slice(3) : "";
    if (!id) return;
    const alvo = [document.getElementById(`p-${id}`), document.getElementById(`m-${id}`)].find(
      (el) => el && el.offsetParent !== null,
    );
    if (!alvo) return;
    const detalhes = alvo.querySelector("details");
    if (detalhes) detalhes.open = true;
    alvo.scrollIntoView({ block: "center" });
    alvo.setAttribute("data-voltou", "sim");
  }, []);
  return (
    <div className="catalogo-resultado" aria-busy={pendente} data-pendente={pendente ? "sim" : undefined}>
      <p className="catalogo-carregando" role="status" aria-live="polite">
        {pendente ? "Atualizando a lista…" : ""}
      </p>
      {children}
    </div>
  );
}

"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useSyncExternalStore, type ComponentProps, type ReactNode } from "react";

/**
 * A navegação do catálogo, com o "carregando" que a tela precisa.
 *
 * Filtro, ordenação e página mudam o endereço, e quem refaz a lista é o
 * servidor. Entre o clique e a resposta a lista antiga continua na tela — e sem
 * aviso ela pareceria ser o resultado do filtro novo. Este módulo guarda
 * "há uma navegação do catálogo em curso" num lugar só, para o controle que foi
 * clicado e a lista (que são componentes separados) concordarem.
 */

/**
 * Por que há um vigia aqui (09/10/2026): com o Next 16.2.11, a troca dentro da
 * mesma rota com a lista cheia às vezes não conclui — a resposta chega inteira
 * do servidor, sem erro, e a tela não troca (medido sobre a imagem de produção:
 * ~1 em cada 5 trocas, também com `router.push` puro e com `<Link>` comum, e
 * nunca nas outras páginas). Repetir a navegação resolve em ~250 ms. Então a
 * navegação do catálogo confere se chegou: sem troca de endereço em 1,5 s,
 * tenta de novo; na terceira vez, carrega a página inteira, que não falha.
 * O "carregando" segue o endereço, não a transição do React, que fica presa
 * junto. Quando uma versão do Next resolver isso, o vigia vira peso morto
 * inofensivo e pode sair.
 */
const ESPERA_MS = 1500;
const TENTATIVAS = 2;

let alvo: string | null = null;
let relogio: ReturnType<typeof setTimeout> | null = null;
const ouvintes = new Set<() => void>();
const avisar = () => ouvintes.forEach((o) => o());
const assinar = (ouvinte: () => void) => {
  ouvintes.add(ouvinte);
  return () => ouvintes.delete(ouvinte);
};

/** Caminho e consulta, sem a âncora: é o que diz se a navegação chegou. */
const semAncora = (href: string) => {
  const u = new URL(href, window.location.origin);
  return u.pathname + u.search;
};
const aqui = () => window.location.pathname + window.location.search;

function chegou() {
  if (relogio) clearTimeout(relogio);
  relogio = null;
  if (alvo === null) return;
  alvo = null;
  avisar();
}

function usePendente() {
  return useSyncExternalStore(assinar, () => alvo !== null, () => false);
}

/** Navega para um endereço do catálogo marcando a lista como "carregando" até o endereço trocar. */
export function useNavegarCatalogo() {
  const router = useRouter();
  const caminho = usePathname();
  const consulta = useSearchParams();

  // O endereço trocou (por aqui, pelo voltar do navegador ou por outro link): acabou a espera.
  useEffect(chegou, [caminho, consulta]);

  return useCallback(
    (href: string) => {
      const destino = semAncora(href);
      if (relogio) clearTimeout(relogio);
      alvo = destino;
      avisar();
      let tentativa = 0;
      const ir = () => {
        // `scroll: false`: trocar filtro não joga a pessoa para o topo da página.
        router.push(href, { scroll: false });
        relogio = setTimeout(() => {
          if (alvo !== destino) return;
          if (aqui() === destino) return chegou();
          tentativa += 1;
          if (tentativa > TENTATIVAS) return window.location.assign(href);
          ir();
        }, ESPERA_MS);
      };
      // Já está no endereço pedido (clicar duas vezes no mesmo filtro): nada a esperar.
      if (aqui() === destino) return chegou();
      ir();
    },
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
      // Sem pré-carregamento: a lista é sempre lida na hora (nada a aproveitar), e
      // cada link visível custaria um pedido ao servidor a cada tela desenhada.
      prefetch={false}
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

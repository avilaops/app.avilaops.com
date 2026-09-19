"use client";

import Link from "next/link";
import { hrefConsulta, hrefRegistrar } from "@/components/dominios/dados";

/**
 * As duas ações do topo, lado a lado. No celular elas dividem uma linha em vez
 * de virarem dois blocos de largura inteira: são ação de atalho, não o assunto
 * da tela, e empilhadas empurravam a carteira para baixo da dobra.
 *
 * "Registrar domínio" continua visível mesmo sem habilitação, porque escondê-la
 * esconderia que a função existe. Ela leva ao assistente, que termina dizendo o
 * que falta, em vez de um clique que finge ter registrado.
 */
export default function AcoesDominios({ podeRegistrar }: { podeRegistrar: boolean }) {
  return (
    <div className="flex w-full gap-2">
      <Link href={hrefConsulta} className="secondary-button flex-1 min-[821px]:flex-none">
        Consultar domínio
      </Link>
      <Link
        href={hrefRegistrar}
        className="primary-button flex-1 min-[821px]:flex-none"
        aria-describedby={podeRegistrar ? undefined : "registro-indisponivel"}
      >
        Registrar domínio
      </Link>
      {podeRegistrar ? null : (
        <span id="registro-indisponivel" className="sr-only">
          O registro ainda não está habilitado nesta conta; o assistente vai até a revisão.
        </span>
      )}
    </div>
  );
}

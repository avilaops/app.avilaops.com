import type { DiferencaZona } from "@/lib/dominios/dns/versoes";

/**
 * O que muda numa zona, em três blocos: o que sai, o que entra e o que só
 * muda de TTL ou proxy. Usado ao restaurar versão e ao importar arquivo BIND,
 * para a pessoa ver a mesma coisa antes de qualquer um dos dois.
 */

export function linhaTexto(l: { tipo: string; nome: string; conteudo: string; prioridade: number | null }) {
  return `${l.tipo} ${l.nome} → ${l.prioridade !== null ? `${l.prioridade} ` : ""}${l.conteudo}`;
}

export function BlocoDiferenca({ titulo, linhas }: { titulo: string; linhas: string[] }) {
  if (linhas.length === 0) return null;
  return (
    <div>
      <p className="text-[13px] font-semibold text-foreground">
        {titulo} · {linhas.length}
      </p>
      <ul className="mt-1 list-none space-y-0.5 p-0">
        {linhas.map((linha, i) => (
          <li key={`${i}-${linha}`} className="font-mono text-[13px] text-muted-foreground [overflow-wrap:anywhere]">
            {linha}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function textoDoAjuste(a: DiferencaZona["ajustar"][number]) {
  return `${linhaTexto(a.alvo)} (TTL ${a.atual.ttl} → ${a.alvo.ttl}${a.atual.proxy !== a.alvo.proxy ? `, proxy ${a.alvo.proxy ? "ligado" : "desligado"}` : ""})`;
}

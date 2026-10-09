"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";

export const COLUNAS_OPCIONAIS = [
  { chave: "foto", rotulo: "Foto" },
  { chave: "sku", rotulo: "SKU" },
  { chave: "categoria", rotulo: "Categoria" },
  { chave: "estoque", rotulo: "Estoque" },
] as const;

type Preferencias = { ocultas: string[]; densidade: "confortavel" | "compacta" };
const PADRAO: Preferencias = { ocultas: [], densidade: "confortavel" };

function interpretar(bruto: string): Preferencias {
  if (!bruto) return PADRAO;
  try {
    const p = JSON.parse(bruto) as Partial<Preferencias>;
    return {
      ocultas: Array.isArray(p.ocultas) ? p.ocultas.filter((c) => typeof c === "string") : [],
      densidade: p.densidade === "compacta" ? "compacta" : "confortavel",
    };
  } catch {
    // Preferência ilegível não impede a tabela: vale o padrão.
    return PADRAO;
  }
}

// O `storage` do navegador só avisa as OUTRAS abas; quem grava nesta avisa por aqui.
const ouvintes = new Set<() => void>();
function assinar(ouvinte: () => void) {
  ouvintes.add(ouvinte);
  window.addEventListener("storage", ouvinte);
  return () => {
    ouvintes.delete(ouvinte);
    window.removeEventListener("storage", ouvinte);
  };
}

function ler(guardado: string): string {
  try {
    return window.localStorage.getItem(guardado) ?? "";
  } catch {
    return "";
  }
}

/**
 * Colunas e densidade da tabela de produtos.
 *
 * Guardado no navegador, por pessoa E por loja: quem esconde o estoque na
 * Brilhax (que não controla estoque) não quer perder a coluna na Vedashow, e a
 * escolha de um usuário não vaza para outro no mesmo computador.
 *
 * Nome, situação, preço e ações não entram na lista: são o que a tabela existe
 * para mostrar. A preferência só muda atributos no contêiner — as colunas
 * somem por CSS, sem redesenhar nem buscar nada.
 */
export default function PreferenciasDaTabela({ alvo, chave, semEstoque }: { alvo: string; chave: string; semEstoque: boolean }) {
  const guardado = `avila:catalogo:${chave}`;
  const bruto = useSyncExternalStore(assinar, () => ler(guardado), () => "");
  const prefs = useMemo(() => interpretar(bruto), [bruto]);

  useEffect(() => {
    const tabela = document.getElementById(alvo);
    if (!tabela) return;
    tabela.dataset.ocultas = prefs.ocultas.join(" ");
    tabela.dataset.densidade = prefs.densidade;
  }, [alvo, prefs]);

  function gravar(novas: Preferencias) {
    try {
      window.localStorage.setItem(guardado, JSON.stringify(novas));
    } catch {
      // Navegador sem armazenamento: não há onde guardar, e a tabela segue no padrão.
    }
    ouvintes.forEach((o) => o());
  }

  const alternar = (coluna: string) =>
    gravar({
      ...prefs,
      ocultas: prefs.ocultas.includes(coluna) ? prefs.ocultas.filter((c) => c !== coluna) : [...prefs.ocultas, coluna],
    });

  return (
    <details className="catalogo-preferencias">
      <summary className="secondary-button">Colunas</summary>
      <div className="catalogo-preferencias-painel">
        <fieldset>
          <legend>Mostrar</legend>
          {COLUNAS_OPCIONAIS.filter((c) => !(semEstoque && c.chave === "estoque")).map((c) => (
            <label key={c.chave}>
              <input type="checkbox" checked={!prefs.ocultas.includes(c.chave)} onChange={() => alternar(c.chave)} />
              {c.rotulo}
            </label>
          ))}
        </fieldset>
        <fieldset>
          <legend>Densidade</legend>
          {(["confortavel", "compacta"] as const).map((d) => (
            <label key={d}>
              <input type="radio" name={`densidade-${alvo}`} checked={prefs.densidade === d} onChange={() => gravar({ ...prefs, densidade: d })} />
              {d === "confortavel" ? "Confortável" : "Compacta"}
            </label>
          ))}
        </fieldset>
      </div>
    </details>
  );
}

"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { LinkCatalogo, useNavegarCatalogo } from "@/components/lojas/navegacao-catalogo";
import Sheet from "@/components/ui/Sheet";
import {
  AGRUPAMENTOS,
  ESTOQUES,
  ORDENS,
  PENDENCIAS,
  enderecoDaConsulta,
  filtrosAtivos,
  lerConsulta,
  type Consulta,
  type Faceta,
} from "@/lib/lojas-catalogo";

type Props = {
  base: string;
  consulta: Consulta;
  categorias: Faceta[];
  marcas: Faceta[];
  /** Sem item que controle estoque, o filtro de estoque não diz nada desta loja. */
  temEstoque: boolean;
};

/** Lê o formulário e devolve o endereço da consulta — a mesma regra do servidor. */
function enderecoDoFormulario(base: string, atual: Consulta, formulario: HTMLFormElement): string {
  const dados = new FormData(formulario);
  const bruto: Record<string, string | string[]> = {};
  for (const chave of new Set(dados.keys())) {
    const valores = dados.getAll(chave).map(String);
    bruto[chave] = chave === "pend" ? valores : valores[0];
  }
  // Ordem, grupo e tamanho da página não estão neste formulário: valem os atuais.
  const lida = lerConsulta({ ordem: atual.ordem, grupo: atual.grupo, por: String(atual.por), ...bruto });
  return enderecoDaConsulta(base, { ...lida, pagina: 1 });
}

/**
 * Busca, filtros, ordenação e agrupamento do catálogo.
 *
 * No desktop os filtros ficam à vista e cada escolha vale na hora. No celular
 * vão para uma folha, com "Aplicar" e "Limpar": no toque, aplicar a cada
 * seletor fecharia o teclado e redesenharia a lista no meio da escolha.
 *
 * Busca espera 350 ms depois da última tecla; seletor não espera nada.
 */
export default function FiltrosDoCatalogo({ base, consulta, categorias, marcas, temEstoque }: Props) {
  const navegar = useNavegarCatalogo();
  const [folhaAberta, setFolhaAberta] = useState(false);
  const formDesktop = useRef<HTMLFormElement>(null);
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ativos = filtrosAtivos(consulta);

  useEffect(() => () => void (espera.current && clearTimeout(espera.current)), []);

  const aplicar = (formulario: HTMLFormElement) => navegar(enderecoDoFormulario(base, consulta, formulario));

  function aoMudar(evento: FormEvent<HTMLFormElement>) {
    const alvo = evento.target as HTMLElement;
    const formulario = evento.currentTarget;
    if (espera.current) clearTimeout(espera.current);
    // Texto e número esperam a pessoa parar de digitar; o resto vale já.
    const digitando = alvo instanceof HTMLInputElement && ["search", "text"].includes(alvo.type);
    if (digitando) espera.current = setTimeout(() => aplicar(formulario), 350);
    else aplicar(formulario);
  }

  const campos = (prefixo: string) => (
    <>
      <label className="catalogo-campo">
        <span>Categoria</span>
        <select name="categoria" defaultValue={consulta.categoria} id={`${prefixo}-categoria`}>
          <option value="">Todas</option>
          {categorias.map((c) => (
            <option key={c.valor} value={c.valor}>
              {c.rotulo} ({c.total})
            </option>
          ))}
        </select>
      </label>
      <label className="catalogo-campo">
        <span>Marca</span>
        <select name="marca" defaultValue={consulta.marca} id={`${prefixo}-marca`}>
          <option value="">Todas</option>
          {marcas.map((m) => (
            <option key={m.valor} value={m.valor}>
              {m.rotulo} ({m.total})
            </option>
          ))}
        </select>
      </label>
      <label className="catalogo-campo">
        <span>Situação</span>
        <select name="situacao" defaultValue={consulta.situacao}>
          <option value="">Ativos e inativos</option>
          <option value="ativos">Ativos</option>
          <option value="inativos">Inativos</option>
        </select>
      </label>
      {temEstoque ? (
        <label className="catalogo-campo">
          <span>Estoque</span>
          <select name="estoque" defaultValue={consulta.estoque}>
            <option value="">Qualquer</option>
            {ESTOQUES.map((e) => (
              <option key={e.valor} value={e.valor}>
                {e.rotulo}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <fieldset className="catalogo-campo catalogo-faixa">
        <legend>Preço (R$)</legend>
        <input
          type="text"
          inputMode="decimal"
          name="min"
          placeholder="de"
          aria-label="Preço mínimo em reais"
          defaultValue={consulta.precoMin === null ? "" : (consulta.precoMin / 100).toFixed(2).replace(".", ",")}
        />
        <input
          type="text"
          inputMode="decimal"
          name="max"
          placeholder="até"
          aria-label="Preço máximo em reais"
          defaultValue={consulta.precoMax === null ? "" : (consulta.precoMax / 100).toFixed(2).replace(".", ",")}
        />
      </fieldset>
      <fieldset className="catalogo-campo catalogo-pendencias">
        <legend>Pendências</legend>
        {PENDENCIAS.filter((p) => temEstoque || p.valor !== "anuncia-sem-saldo").map((p) => (
          <label key={p.valor}>
            <input type="checkbox" name="pend" value={p.valor} defaultChecked={consulta.pendencias.includes(p.valor)} />
            {p.rotulo}
          </label>
        ))}
      </fieldset>
    </>
  );

  const busca = (
    <label className="campo-busca catalogo-busca">
      <span className="sr-only">Buscar por nome, SKU ou marca</span>
      <input type="search" name="q" defaultValue={consulta.q} placeholder="Buscar por nome, SKU ou marca" autoComplete="off" />
    </label>
  );

  return (
    <div className="catalogo-controles">
      {/*
        `key`: quando a consulta muda por fora (indicador, "limpar"), o
        formulário renasce com os valores novos — campo não controlado não
        acompanha `defaultValue` sozinho.
      */}
      <form
        key={enderecoDaConsulta(base, consulta)}
        ref={formDesktop}
        className="catalogo-filtros"
        action={base}
        role="search"
        aria-label="Buscar e filtrar o catálogo"
        onChange={aoMudar}
        onSubmit={(evento) => {
          evento.preventDefault();
          if (espera.current) clearTimeout(espera.current);
          aplicar(evento.currentTarget);
        }}
      >
        {busca}
        <div className="catalogo-filtros-desktop">{campos("d")}</div>
        <button type="submit" className="sr-only">
          Aplicar filtros
        </button>
      </form>

      <div className="catalogo-acoes">
        <button type="button" className="secondary-button catalogo-abrir-filtros" onClick={() => setFolhaAberta(true)}>
          Filtros{ativos > 0 ? ` (${ativos})` : ""}
        </button>
        <label className="catalogo-campo catalogo-compacto">
          <span>Ordenar</span>
          <select
            value={consulta.ordem}
            onChange={(e) => navegar(enderecoDaConsulta(base, consulta, { ordem: e.target.value as Consulta["ordem"] }))}
          >
            {ORDENS.filter((o) => temEstoque || !o.valor.startsWith("estoque")).map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.rotulo}
              </option>
            ))}
          </select>
        </label>
        <label className="catalogo-campo catalogo-compacto">
          <span>Agrupar</span>
          <select
            value={consulta.grupo}
            onChange={(e) => navegar(enderecoDaConsulta(base, consulta, { grupo: e.target.value as Consulta["grupo"] }))}
          >
            <option value="">Sem agrupar</option>
            {AGRUPAMENTOS.map((g) => (
              <option key={g.valor} value={g.valor}>
                {g.rotulo}
              </option>
            ))}
          </select>
        </label>
        {ativos > 0 ? (
          <LinkCatalogo className="text-button" href={enderecoDaConsulta(base, { ...consulta, ...LIMPA })}>
            Limpar filtros
          </LinkCatalogo>
        ) : null}
      </div>

      {folhaAberta ? (
        <Sheet
          titulo="Filtros"
          aoFechar={() => setFolhaAberta(false)}
          rodape={
            <>
              <button type="submit" form="catalogo-filtros-folha" className="primary-button">
                Aplicar
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setFolhaAberta(false);
                  navegar(enderecoDaConsulta(base, { ...consulta, ...LIMPA }));
                }}
              >
                Limpar
              </button>
            </>
          }
        >
          <form
            id="catalogo-filtros-folha"
            className="catalogo-filtros-folha"
            action={base}
            onSubmit={(evento) => {
              evento.preventDefault();
              setFolhaAberta(false);
              aplicar(evento.currentTarget);
            }}
          >
            <input type="hidden" name="q" value={consulta.q} />
            {campos("f")}
          </form>
        </Sheet>
      ) : null}
    </div>
  );
}

/** Tira os filtros e a busca; ordenação, agrupamento e tamanho da página ficam. */
const LIMPA: Partial<Consulta> = {
  q: "",
  categoria: "",
  marca: "",
  situacao: "",
  pendencias: [],
  estoque: "",
  precoMin: null,
  precoMax: null,
  pagina: 1,
};

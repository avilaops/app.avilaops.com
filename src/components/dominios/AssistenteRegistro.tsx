"use client";

import { useState } from "react";
import Link from "next/link";
import CabecalhoPagina from "@/components/hub-social/CabecalhoPagina";
import ListaChaveValor from "@/components/hub-social/ListaChaveValor";
import ConsultaDominio from "@/components/dominios/ConsultaDominio";
import { BOTAO, CAMPO, CartaoLista, MensagemErro } from "@/components/hub-social/comum";
import { Input } from "@/components/shadcn/input";
import { Label } from "@/components/shadcn/label";
import { BASE } from "@/components/dominios/dados";
import { cn } from "@/lib/utils";

/**
 * Assistente de registro: domínio, titular, DNS e revisão.
 *
 * A revisão é a última tela antes de qualquer escrita, e é de propósito que
 * ela não tenha botão que "só tenta". Enquanto a operação de registro não
 * estiver habilitada nesta conta, o assistente vai até aqui e diz isso, em vez
 * de mandar um pedido que vai falhar ou, pior, fingir que deu certo.
 */

type Titular = { organizationId: string; nome: string };

const ETAPAS = ["Domínio", "Titular", "DNS", "Revisão"] as const;

export default function AssistenteRegistro({
  clientes,
  podeRegistrar,
  dominioInicial,
}: {
  clientes: Titular[];
  podeRegistrar: boolean;
  dominioInicial: string;
}) {
  const [etapa, setEtapa] = useState(dominioInicial ? 1 : 0);
  const [dominio, setDominio] = useState(dominioInicial);
  const [cliente, setCliente] = useState("");
  const [periodo, setPeriodo] = useState("1");
  const [nameservers, setNameservers] = useState("");
  const [erro, setErro] = useState("");

  const nomeCliente = clientes.find((c) => c.organizationId === cliente)?.nome ?? null;
  const listaNs = nameservers
    .split(/[\s,]+/)
    .map((ns) => ns.trim())
    .filter(Boolean);

  function avancar() {
    setErro("");
    if (etapa === 0 && !dominio.trim()) return setErro("Informe o domínio.");
    if (etapa === 1 && !cliente) return setErro("Escolha de quem será o domínio.");
    setEtapa((atual) => Math.min(atual + 1, ETAPAS.length - 1));
  }

  return (
    <div className="space-y-6">
      <CabecalhoPagina
        eyebrow="Domínios"
        titulo="Registrar domínio"
        subtitulo={ETAPAS[etapa]}
        voltar={{ href: BASE, label: "Domínios" }}
        meta={`Etapa ${etapa + 1} de ${ETAPAS.length}`}
      />

      <ol className="m-0 flex list-none gap-2 p-0" aria-label="Etapas do registro">
        {ETAPAS.map((nome, indice) => (
          <li key={nome} className="min-w-0 flex-1">
            <span
              aria-current={indice === etapa ? "step" : undefined}
              className={cn(
                "block truncate rounded-full px-2 py-1 text-center text-[12px] font-medium",
                indice === etapa
                  ? "bg-primary text-primary-foreground"
                  : indice < etapa
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground",
              )}
            >
              {nome}
            </span>
          </li>
        ))}
      </ol>

      {erro ? <MensagemErro>{erro}</MensagemErro> : null}

      {etapa === 0 ? (
        <>
          <ConsultaDominio hrefRegistrar={null} valorInicial={dominio} />
          <CartaoLista titulo="Domínio a registrar">
            <div className="px-4 py-4">
              <Label htmlFor="registro-dominio" className="text-[13px] text-muted-foreground">
                Domínio
              </Label>
              <Input
                id="registro-dominio"
                value={dominio}
                onChange={(e) => setDominio(e.target.value)}
                placeholder="minhaempresa.com.br"
                autoComplete="off"
                spellCheck={false}
                className={cn("mt-1 font-mono", CAMPO)}
              />
            </div>
          </CartaoLista>
        </>
      ) : null}

      {etapa === 1 ? (
        <CartaoLista titulo="Titular" descricao="De quem será o domínio.">
          <div className="px-4 py-4">
            <Label htmlFor="registro-cliente" className="text-[13px] text-muted-foreground">
              Cliente
            </Label>
            <select
              id="registro-cliente"
              value={cliente}
              onChange={(e) => setCliente(e.target.value)}
              className={cn("mt-1 w-full rounded-md border border-input bg-transparent px-3 text-foreground", CAMPO)}
            >
              <option value="">Escolha o cliente</option>
              {clientes.map((item) => (
                <option key={item.organizationId} value={item.organizationId}>
                  {item.nome}
                </option>
              ))}
            </select>
            <p className="mt-2 text-[13px] leading-5 text-muted-foreground">
              Os dados do titular e os contatos vêm da ficha do cliente. Confira lá antes de seguir.
            </p>
          </div>
        </CartaoLista>
      ) : null}

      {etapa === 2 ? (
        <CartaoLista titulo="DNS" descricao="Para onde o domínio vai apontar.">
          <div className="space-y-3 px-4 py-4">
            <div>
              <Label htmlFor="registro-ns" className="text-[13px] text-muted-foreground">
                Servidores de nome (um por linha)
              </Label>
              <textarea
                id="registro-ns"
                value={nameservers}
                onChange={(e) => setNameservers(e.target.value)}
                rows={3}
                placeholder={"ns1.exemplo.com\nns2.exemplo.com"}
                spellCheck={false}
                className="mt-1 w-full rounded-md border border-input bg-transparent p-3 font-mono text-[16px] text-foreground min-[821px]:text-sm"
              />
            </div>
            <div>
              <Label htmlFor="registro-periodo" className="text-[13px] text-muted-foreground">
                Período
              </Label>
              <select
                id="registro-periodo"
                value={periodo}
                onChange={(e) => setPeriodo(e.target.value)}
                className={cn("mt-1 w-full rounded-md border border-input bg-transparent px-3 text-foreground", CAMPO)}
              >
                <option value="1">1 ano</option>
                <option value="2">2 anos</option>
                <option value="3">3 anos</option>
              </select>
            </div>
          </div>
        </CartaoLista>
      ) : null}

      {etapa === 3 ? (
        <>
          <ListaChaveValor
            titulo="Revisão"
            descricao="Confira antes de qualquer operação. Nada foi enviado ainda."
            itens={[
              { rotulo: "Domínio", valor: dominio, mono: true },
              { rotulo: "Titular", valor: nomeCliente, vazio: "não escolhido" },
              { rotulo: "Período", valor: `${periodo} ${periodo === "1" ? "ano" : "anos"}` },
              {
                rotulo: "Servidores de nome",
                valor: listaNs.length > 0 ? listaNs.join(", ") : null,
                mono: true,
                vazio: "não informados",
              },
            ]}
          />

          <CartaoLista titulo="Confirmação">
            <div className="px-4 py-4">
              {podeRegistrar ? (
                <>
                  <p className="text-[13px] leading-5 text-muted-foreground">
                    Registrar é uma operação cobrada e não tem desfazer. Confira o domínio e o titular acima.
                  </p>
                  <button type="button" className={cn("primary-button mt-3", BOTAO)} disabled>
                    Confirmar registro
                  </button>
                </>
              ) : (
                <>
                  <p className="text-[15px] font-semibold text-foreground">
                    O registro por aqui ainda não está habilitado nesta conta.
                  </p>
                  <p className="mt-1 text-[13px] leading-5 text-muted-foreground">
                    Nada foi enviado e nada foi cobrado. O resumo acima serve para registrar o domínio pelo caminho
                    de sempre; quando a operação for habilitada, este é o botão que vai executá-la.
                  </p>
                  <Link href={BASE} className={cn("secondary-button mt-3", BOTAO)}>
                    Voltar para Domínios
                  </Link>
                </>
              )}
            </div>
          </CartaoLista>
        </>
      ) : null}

      <div className="flex flex-col gap-2 min-[821px]:flex-row">
        {etapa > 0 ? (
          <button
            type="button"
            className={cn("secondary-button", BOTAO)}
            onClick={() => setEtapa((atual) => Math.max(atual - 1, 0))}
          >
            Voltar
          </button>
        ) : null}
        {etapa < ETAPAS.length - 1 ? (
          <button type="button" className={cn("primary-button", BOTAO)} onClick={avancar}>
            Continuar
          </button>
        ) : null}
      </div>
    </div>
  );
}

"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Confirmacao from "@/components/sistema/Confirmacao";
import EstadoVazio from "@/components/hub-social/EstadoVazio";
import { BOTAO, CAMPO, CartaoLista, LINHA_ITEM, MensagemErro, MensagemStatus } from "@/components/hub-social/comum";
import { Input } from "@/components/shadcn/input";
import { Label } from "@/components/shadcn/label";
import { TIPOS_DNS, type RegistroDns } from "@/lib/dominios/dns";
import { cn } from "@/lib/utils";

/**
 * Os registros de DNS de um domínio, com criar, editar e apagar.
 *
 * Toda escrita é confirmada antes de sair daqui e vira evento de auditoria do
 * outro lado. Apagar registro de DNS derruba site e e-mail em minutos: a
 * confirmação diz exatamente qual registro vai embora, e não existe caminho
 * que apague sem passar por ela.
 */

type Rascunho = {
  id: string | null;
  tipo: string;
  nome: string;
  conteudo: string;
  ttl: string;
  prioridade: string;
};

const VAZIO: Rascunho = { id: null, tipo: "A", nome: "", conteudo: "", ttl: "1", prioridade: "" };

const PRECISA_PRIORIDADE = new Set(["MX", "SRV"]);

export default function PainelDns({
  fqdn,
  temZona,
  registros,
  erro,
  podeEditar,
}: {
  fqdn: string;
  temZona: boolean;
  registros: RegistroDns[];
  erro: string | null;
  podeEditar: boolean;
}) {
  const router = useRouter();
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);
  const [aRemover, setARemover] = useState<RegistroDns | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [falha, setFalha] = useState("");
  const [aviso, setAviso] = useState("");

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    if (!rascunho || salvando) return;

    setSalvando(true);
    setFalha("");

    try {
      const resposta = await fetch(`/api/dominios/${encodeURIComponent(fqdn)}/dns`, {
        method: rascunho.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          registroId: rascunho.id,
          tipo: rascunho.tipo,
          nome: rascunho.nome.trim(),
          conteudo: rascunho.conteudo.trim(),
          ttl: Number(rascunho.ttl) || 1,
          prioridade: rascunho.prioridade ? Number(rascunho.prioridade) : undefined,
        }),
      });
      const dados = await resposta.json();

      if (!resposta.ok || !dados.ok) {
        setFalha(dados.error ?? "Não foi possível salvar o registro.");
        return;
      }

      setAviso(rascunho.id ? "Registro atualizado." : "Registro criado.");
      setRascunho(null);
      router.refresh();
    } catch (e) {
      setFalha(e instanceof Error ? e.message : "Não foi possível salvar o registro.");
    } finally {
      setSalvando(false);
    }
  }

  async function remover() {
    if (!aRemover) return;
    setSalvando(true);
    setFalha("");

    try {
      const resposta = await fetch(`/api/dominios/${encodeURIComponent(fqdn)}/dns`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registroId: aRemover.id }),
      });
      const dados = await resposta.json();

      if (!resposta.ok || !dados.ok) {
        setFalha(dados.error ?? "Não foi possível apagar o registro.");
        return;
      }

      setAviso(`Registro ${aRemover.tipo} ${aRemover.nome} apagado.`);
      setARemover(null);
      router.refresh();
    } catch (e) {
      setFalha(e instanceof Error ? e.message : "Não foi possível apagar o registro.");
    } finally {
      setSalvando(false);
    }
  }

  if (!temZona) {
    return (
      <CartaoLista titulo="DNS">
        <div className="p-4">
          <EstadoVazio
            compacto
            titulo="O DNS deste domínio não é servido por aqui"
            descricao="A central acompanha o registro e o vencimento normalmente. Para editar zona por aqui, aponte o domínio para a plataforma."
          />
        </div>
      </CartaoLista>
    );
  }

  return (
    <>
      <CartaoLista
        titulo="DNS"
        descricao={
          erro
            ? "Não foi possível ler os registros agora."
            : `${registros.length} ${registros.length === 1 ? "registro" : "registros"} nesta zona.`
        }
        acao={
          podeEditar ? (
            <button
              type="button"
              className="secondary-button"
              onClick={() => setRascunho({ ...VAZIO, nome: fqdn })}
            >
              Novo registro
            </button>
          ) : null
        }
      >
        {erro ? (
          <div className="px-4 py-3">
            <MensagemErro>{erro}</MensagemErro>
          </div>
        ) : null}
        {aviso ? (
          <div className="px-4 py-3">
            <MensagemStatus>{aviso}</MensagemStatus>
          </div>
        ) : null}
        {falha ? (
          <div className="px-4 py-3">
            <MensagemErro>{falha}</MensagemErro>
          </div>
        ) : null}

        {rascunho ? (
          <form onSubmit={enviar} className="flex flex-col gap-3 border-b border-border px-4 py-4">
            <div className="grid gap-3 min-[821px]:grid-cols-[120px_1fr]">
              <div>
                <Label htmlFor="dns-tipo" className="text-[13px] text-muted-foreground">
                  Tipo
                </Label>
                <select
                  id="dns-tipo"
                  value={rascunho.tipo}
                  onChange={(e) => setRascunho({ ...rascunho, tipo: e.target.value })}
                  className={cn(
                    "mt-1 w-full rounded-md border border-input bg-transparent px-3 text-foreground",
                    CAMPO,
                  )}
                >
                  {TIPOS_DNS.map((tipo) => (
                    <option key={tipo} value={tipo}>
                      {tipo}
                    </option>
                  ))}
                </select>
              </div>
              <div className="min-w-0">
                <Label htmlFor="dns-nome" className="text-[13px] text-muted-foreground">
                  Nome
                </Label>
                <Input
                  id="dns-nome"
                  value={rascunho.nome}
                  onChange={(e) => setRascunho({ ...rascunho, nome: e.target.value })}
                  autoComplete="off"
                  spellCheck={false}
                  className={cn("mt-1 font-mono", CAMPO)}
                />
              </div>
            </div>

            <div className="min-w-0">
              <Label htmlFor="dns-conteudo" className="text-[13px] text-muted-foreground">
                Conteúdo
              </Label>
              <Input
                id="dns-conteudo"
                value={rascunho.conteudo}
                onChange={(e) => setRascunho({ ...rascunho, conteudo: e.target.value })}
                autoComplete="off"
                spellCheck={false}
                className={cn("mt-1 font-mono", CAMPO)}
              />
            </div>

            <div className="grid gap-3 min-[821px]:grid-cols-2">
              <div>
                <Label htmlFor="dns-ttl" className="text-[13px] text-muted-foreground">
                  TTL (1 = automático)
                </Label>
                <Input
                  id="dns-ttl"
                  inputMode="numeric"
                  value={rascunho.ttl}
                  onChange={(e) => setRascunho({ ...rascunho, ttl: e.target.value })}
                  className={cn("mt-1", CAMPO)}
                />
              </div>
              {PRECISA_PRIORIDADE.has(rascunho.tipo) ? (
                <div>
                  <Label htmlFor="dns-prioridade" className="text-[13px] text-muted-foreground">
                    Prioridade
                  </Label>
                  <Input
                    id="dns-prioridade"
                    inputMode="numeric"
                    value={rascunho.prioridade}
                    onChange={(e) => setRascunho({ ...rascunho, prioridade: e.target.value })}
                    className={cn("mt-1", CAMPO)}
                  />
                </div>
              ) : null}
            </div>

            <div className="flex flex-col gap-2 min-[821px]:flex-row">
              <button type="submit" disabled={salvando} className={cn("primary-button", BOTAO)}>
                {salvando ? "Salvando…" : rascunho.id ? "Salvar alteração" : "Criar registro"}
              </button>
              <button
                type="button"
                className={cn("secondary-button", BOTAO)}
                onClick={() => setRascunho(null)}
                disabled={salvando}
              >
                Cancelar
              </button>
            </div>
          </form>
        ) : null}

        {registros.length === 0 ? (
          erro ? null : (
            <div className="p-4">
              <EstadoVazio compacto titulo="Nenhum registro nesta zona" />
            </div>
          )
        ) : (
          <ul className="m-0 list-none p-0">
            {registros.map((registro) => (
              <li key={registro.id} className={cn(LINHA_ITEM, "flex items-center gap-3 px-4 py-3")}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-[14px] font-semibold text-foreground">
                    {registro.tipo} {registro.nome}
                  </span>
                  <span className="mt-0.5 block truncate font-mono text-[13px] text-muted-foreground">
                    {registro.conteudo}
                    {registro.prioridade !== null ? ` · prioridade ${registro.prioridade}` : ""}
                    {registro.proxy ? " · pela rede da plataforma" : ""}
                  </span>
                </span>
                {podeEditar ? (
                  <span className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      className="row-action"
                      onClick={() =>
                        setRascunho({
                          id: registro.id,
                          tipo: registro.tipo,
                          nome: registro.nome,
                          conteudo: registro.conteudo,
                          ttl: String(registro.ttl),
                          prioridade: registro.prioridade === null ? "" : String(registro.prioridade),
                        })
                      }
                    >
                      Editar
                    </button>
                    <button type="button" className="row-action" onClick={() => setARemover(registro)}>
                      Apagar
                    </button>
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CartaoLista>

      {aRemover ? (
        <Confirmacao
          titulo="Apagar este registro de DNS?"
          alvo={`${aRemover.tipo} ${aRemover.nome} → ${aRemover.conteudo}`}
          descricao="Apagar um registro pode derrubar o site ou o e-mail deste domínio em poucos minutos."
          rotuloConfirmar="Apagar registro"
          confirmando={salvando}
          aoConfirmar={remover}
          aoCancelar={() => setARemover(null)}
        />
      ) : null}
    </>
  );
}

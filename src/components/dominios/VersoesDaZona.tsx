"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Confirmacao from "@/components/sistema/Confirmacao";
import EstadoVazio from "@/components/hub-social/EstadoVazio";
import { CartaoLista, LINHA_ITEM, MensagemErro, MensagemStatus, formatarDataHora } from "@/components/hub-social/comum";
import type { RegistroDns } from "@/lib/dominios/dns/tipos";
import { diferencaParaVersao, zonaIgual, type LinhaVersao } from "@/lib/dominios/dns/versoes";
import { cn } from "@/lib/utils";

/**
 * As versões guardadas da zona, com o que mudaria ao voltar a cada uma.
 *
 * A diferença é calculada aqui, contra a zona que a página acabou de ler, pela
 * mesma função que o servidor usa para restaurar: o que a tela promete é o
 * que vai ser aplicado. Restaurar também vira versão, então dá para voltar
 * atrás da própria restauração.
 */

export type VersaoNaTela = {
  id: string;
  criadaEm: string;
  quem: string;
  motivo: string;
  linhas: LinhaVersao[];
};

function linhaTexto(l: { tipo: string; nome: string; conteudo: string; prioridade: number | null }) {
  return `${l.tipo} ${l.nome} → ${l.prioridade !== null ? `${l.prioridade} ` : ""}${l.conteudo}`;
}

export default function VersoesDaZona({
  versoes,
  atual,
  zonaLida,
  podeRestaurar,
  base,
  zona,
  dnsAqui = true,
}: {
  versoes: VersaoNaTela[];
  /** A zona agora, lida do servidor. */
  atual: RegistroDns[];
  /** Falso quando a leitura falhou: sem zona atual não há diferença honesta para mostrar. */
  zonaLida: boolean;
  podeRestaurar: boolean;
  /** Rota de DNS do domínio, sem barra no fim: `/api/portal/dominios/x.com.br/dns`. */
  base: string;
  /** O domínio dono da zona: SOA e NS dele são do servidor e ficam fora da diferença. */
  zona: string;
  /**
   * Falso quando o DNS saiu daqui. As versões continuam: são a saída do
   * cliente. Some só o que depende da zona viva (baixar a atual, restaurar).
   */
  dnsAqui?: boolean;
}) {
  const router = useRouter();
  const [aberta, setAberta] = useState<string | null>(null);
  const [aRestaurar, setARestaurar] = useState<VersaoNaTela | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [falha, setFalha] = useState("");
  const [aviso, setAviso] = useState("");

  const diferencas = useMemo(
    () => new Map(versoes.map((v) => [v.id, diferencaParaVersao(atual, v.linhas, zona)])),
    [versoes, atual, zona],
  );

  async function restaurar() {
    if (!aRestaurar) return;
    setEnviando(true);
    setFalha("");
    try {
      const resposta = await fetch(`${base}/restaurar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versaoId: aRestaurar.id }),
      });
      const dados = await resposta.json().catch(() => ({}));
      if (!resposta.ok || !dados.ok) {
        setFalha(dados.error ?? "Não foi possível restaurar a zona.");
        return;
      }
      setAviso(`Zona restaurada à versão de ${formatarDataHora(aRestaurar.criadaEm)}.`);
      setARestaurar(null);
      setAberta(null);
      router.refresh();
    } catch (e) {
      setFalha(e instanceof Error ? e.message : "Não foi possível restaurar a zona.");
    } finally {
      setEnviando(false);
    }
  }

  const resumo = aRestaurar ? diferencas.get(aRestaurar.id) : null;

  return (
    <>
      <CartaoLista
        titulo="Versões da zona"
        descricao={
          dnsAqui
            ? "Uma versão a cada alteração. Dá para baixar qualquer uma em formato BIND ou voltar a ela."
            : "O DNS deste domínio não é mais servido por aqui. As versões guardadas continuam disponíveis para baixar em BIND."
        }
        acao={
          dnsAqui ? (
            <a href={`${base}/exportar`} className="secondary-button shrink-0" download>
              Baixar zona
            </a>
          ) : null
        }
      >
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

        {versoes.length === 0 ? (
          <div className="p-4">
            <EstadoVazio
              compacto
              titulo="Nenhuma versão guardada ainda"
              descricao="A primeira alteração pelo painel guarda a zona como estava antes dela e a zona depois."
            />
          </div>
        ) : (
          <ul className="m-0 list-none p-0">
            {versoes.map((versao, indice) => {
              const dif = diferencas.get(versao.id)!;
              const igual = zonaLida && zonaIgual(dif);
              const expandida = aberta === versao.id;
              return (
                <li key={versao.id} className={cn(LINHA_ITEM, "px-4 py-3")}>
                  <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
                    <span className="min-w-0 flex-1 basis-full min-[821px]:basis-0">
                      <span className="block text-[15px] font-medium text-foreground">
                        {versao.motivo}
                        {indice === 0 && igual ? (
                          <span className="ml-2 text-[12px] font-normal text-muted-foreground">· é a zona atual</span>
                        ) : null}
                      </span>
                      <span className="mt-0.5 block text-[13px] text-muted-foreground">
                        {formatarDataHora(versao.criadaEm)} · {versao.quem} · {versao.linhas.length}{" "}
                        {versao.linhas.length === 1 ? "registro" : "registros"}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-wrap gap-1">
                      {zonaLida && !igual ? (
                        <button
                          type="button"
                          className="row-action"
                          aria-expanded={expandida}
                          onClick={() => setAberta(expandida ? null : versao.id)}
                        >
                          {expandida ? "Fechar" : "O que muda"}
                        </button>
                      ) : null}
                      <a className="row-action" href={`${base}/exportar?versao=${encodeURIComponent(versao.id)}`} download>
                        BIND
                      </a>
                    </span>
                  </div>

                  {expandida ? (
                    <div className="mt-3 space-y-3 rounded-lg border border-border p-3">
                      <BlocoDiferenca titulo="Sai da zona" linhas={dif.sair.map(linhaTexto)} />
                      <BlocoDiferenca titulo="Volta para a zona" linhas={dif.entrar.map(linhaTexto)} />
                      <BlocoDiferenca
                        titulo="Muda TTL ou proxy"
                        linhas={dif.ajustar.map(
                          (a) => `${linhaTexto(a.alvo)} (TTL ${a.atual.ttl} → ${a.alvo.ttl}${a.atual.proxy !== a.alvo.proxy ? `, proxy ${a.alvo.proxy ? "ligado" : "desligado"}` : ""})`,
                        )}
                      />
                      {podeRestaurar ? (
                        <button type="button" className="primary-button" onClick={() => setARestaurar(versao)}>
                          Voltar a esta versão
                        </button>
                      ) : (
                        <p className="text-[13px] text-muted-foreground">Só o responsável pela empresa restaura a zona.</p>
                      )}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </CartaoLista>

      {aRestaurar && resumo ? (
        <Confirmacao
          titulo="Voltar a zona para esta versão?"
          alvo={`${aRestaurar.motivo} · ${formatarDataHora(aRestaurar.criadaEm)}`}
          descricao={`${resumo.sair.length} ${resumo.sair.length === 1 ? "registro sai" : "registros saem"}, ${resumo.entrar.length} ${resumo.entrar.length === 1 ? "volta" : "voltam"} e ${resumo.ajustar.length} ${resumo.ajustar.length === 1 ? "muda" : "mudam"} de TTL ou proxy. Durante a troca, alguns nomes podem ficar sem resposta por alguns minutos.`}
          reversivel
          rotuloConfirmar="Restaurar versão"
          confirmando={enviando}
          aoConfirmar={restaurar}
          aoCancelar={() => setARestaurar(null)}
        />
      ) : null}
    </>
  );
}

function BlocoDiferenca({ titulo, linhas }: { titulo: string; linhas: string[] }) {
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

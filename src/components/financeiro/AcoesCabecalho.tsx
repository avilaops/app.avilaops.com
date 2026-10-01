"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { ArrowLeftRight, Ellipsis, FileUp, Plus, RefreshCw, Receipt, SearchCheck } from "lucide-react";
import { FolhaNovoLancamento } from "@/components/NewLedgerEntryButton";
import { Button } from "@/components/shadcn/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/shadcn/dropdown-menu";
import { contar } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AcaoCabecalho } from "@/components/financeiro/acoes";

export type { AcaoCabecalho };

type Resultado = { error?: string; receivedCount?: number; sentCount?: number };

async function postar<T>(rota: string, corpo?: unknown): Promise<T> {
  const resposta = await fetch(rota, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const dados = (await resposta.json().catch(() => ({}))) as T & { error?: string; erro?: string };
  if (!resposta.ok) throw new Error(dados.error ?? dados.erro ?? "A operação falhou.");
  return dados;
}

const ROTULOS: Record<Exclude<AcaoCabecalho["tipo"], "link">, string> = {
  sincronizar: "Sincronizar tudo",
  "novo-lancamento": "Novo lançamento",
  conciliar: "Conciliar automaticamente",
  "varredura-cobranca": "Conferir cobranças",
};

function rotuloDe(acao: AcaoCabecalho) {
  return acao.tipo === "link" ? acao.rotulo : ROTULOS[acao.tipo];
}

function IconeDe({ acao, girando }: { acao: AcaoCabecalho; girando?: boolean }) {
  switch (acao.tipo) {
    case "sincronizar":
      return <RefreshCw aria-hidden="true" className={cn(girando && "animate-spin")} />;
    case "novo-lancamento":
      return <Plus aria-hidden="true" />;
    case "conciliar":
      return <ArrowLeftRight aria-hidden="true" />;
    case "varredura-cobranca":
      return <SearchCheck aria-hidden="true" />;
    case "link":
      if (acao.icone === "revisar") return <SearchCheck aria-hidden="true" />;
      return acao.icone === "cobranca" ? <Receipt aria-hidden="true" /> : <FileUp aria-hidden="true" />;
  }
}

function Botao({
  acao,
  principal,
  ocupada,
  executar,
}: {
  acao: AcaoCabecalho;
  principal: boolean;
  ocupada: AcaoCabecalho["tipo"] | null;
  executar: (acao: AcaoCabecalho) => void;
}) {
  const variante = principal ? "default" : "outline";
  if (acao.tipo === "link") {
    return (
      <Button asChild variant={variante} className="min-h-10">
        <Link href={acao.href}>
          <IconeDe acao={acao} />
          {acao.rotulo}
        </Link>
      </Button>
    );
  }
  const girando = ocupada === acao.tipo;
  return (
    <Button
      type="button"
      variant={variante}
      className="min-h-10"
      disabled={ocupada !== null}
      aria-busy={girando}
      onClick={() => executar(acao)}
    >
      <IconeDe acao={acao} girando={girando && acao.tipo === "sincronizar"} />
      {girando && acao.tipo === "sincronizar" ? "Sincronizando" : rotuloDe(acao)}
    </Button>
  );
}

/**
 * Ações do cabeçalho do Financeiro.
 *
 * Desktop: todas em linha, a última como primária. Celular: só a primária
 * aparece, e as outras vão para o menu "Mais ações". O retorno de cada ação
 * sai num aviso temporário (toast), não dentro do layout: a frase "0
 * movimentações conciliadas…" empurrava os botões vizinhos para fora do
 * alinhamento.
 */
export default function AcoesCabecalho({
  acoes,
  discreta = false,
}: {
  acoes: AcaoCabecalho[];
  /** Ação de seção, não de página: a principal sai contornada, não cheia. */
  discreta?: boolean;
}) {
  const router = useRouter();
  const [ocupada, setOcupada] = useState<AcaoCabecalho["tipo"] | null>(null);
  const [lancando, setLancando] = useState(false);
  const fecharLancamento = useCallback(() => setLancando(false), []);

  const primaria = acoes.at(-1);
  const secundarias = acoes.slice(0, -1);

  async function sincronizar() {
    setOcupada("sincronizar");
    // As contas são independentes: o Mercado Pago fora do ar não pode impedir
    // o extrato do Éfi de atualizar, nem o contrário. Por isso allSettled, e o
    // aviso diz qual falhou.
    const [efi, mp] = await Promise.allSettled([
      postar<Resultado>("/api/integrations/efi/sync", { days: 90 }),
      postar<Resultado>("/api/integrations/mercadopago/sync", { days: 90 }),
    ]);
    setOcupada(null);
    const somar = (campo: "receivedCount" | "sentCount") =>
      [efi, mp].reduce((total, r) => total + (r.status === "fulfilled" ? (r.value[campo] ?? 0) : 0), 0);
    const falhas = [
      efi.status === "rejected" ? `Éfi: ${(efi.reason as Error).message}` : null,
      mp.status === "rejected" ? `Mercado Pago: ${(mp.reason as Error).message}` : null,
    ].filter(Boolean) as string[];

    if (falhas.length === 2) {
      toast.error("Nenhuma conta sincronizou.", { description: falhas.join(" ") });
      return;
    }
    const resumo = `${somar("receivedCount")} entradas e ${somar("sentCount")} saídas verificadas.`;
    if (falhas.length) toast.warning(resumo, { description: falhas[0] });
    else toast.success("Contas sincronizadas.", { description: resumo });
    router.refresh();
  }

  async function conciliar(aplicar: boolean) {
    setOcupada("conciliar");
    try {
      const r = await postar<{ analyzed: number; matched: number; suggested: number }>(
        "/api/reconciliations/auto",
        { days: 365, dryRun: !aplicar },
      );
      if (aplicar) {
        toast.success(`${contar(r.matched, "movimentação conciliada", "movimentações conciliadas")}.`, {
          description: `${contar(r.suggested, "enviada", "enviadas")} para revisão.`,
        });
        router.refresh();
        return;
      }
      if (r.matched + r.suggested === 0) {
        toast.info("Nenhum vínculo encontrado.", { description: `${contar(r.analyzed, "movimentação analisada", "movimentações analisadas")}.` });
        return;
      }
      // O primeiro clique é sempre simulação: rodar o casamento sobre um
      // histórico inteiro e só depois descobrir o que ele decidiu é o tipo de
      // coisa que ninguém quer desfazer à mão.
      toast(`${contar(r.matched, "vínculo automático", "vínculos automáticos")} e ${contar(r.suggested, "sugestão", "sugestões")}.`, {
        description: `Em ${contar(r.analyzed, "movimentação", "movimentações")}. Nada foi gravado ainda.`,
        duration: 15000,
        action: { label: "Aplicar", onClick: () => void conciliar(true) },
      });
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível conciliar.");
    } finally {
      setOcupada(null);
    }
  }

  async function varredura() {
    setOcupada("varredura-cobranca");
    try {
      const d = await postar<{ sincronizadas: number; faturasNovas: number; suspensas?: unknown[] }>(
        "/api/mercadopago/varredura",
      );
      toast.success("Cobranças conferidas.", {
        description:
          `${d.sincronizadas} assinaturas conferidas, ${d.faturasNovas} faturas novas` +
          (d.suspensas?.length ? `, ${d.suspensas.length} lojas suspensas.` : "."),
      });
      router.refresh();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "A varredura falhou.");
    } finally {
      setOcupada(null);
    }
  }

  function executar(acao: AcaoCabecalho) {
    if (acao.tipo === "sincronizar") void sincronizar();
    else if (acao.tipo === "conciliar") void conciliar(false);
    else if (acao.tipo === "varredura-cobranca") void varredura();
    else if (acao.tipo === "novo-lancamento") setLancando(true);
  }

  if (!primaria) return null;

  return (
    <>
      <div className="flex items-center gap-2">
        {/* Desktop: tudo em linha. */}
        {secundarias.map((acao) => (
          <span key={rotuloDe(acao)} className="max-[820px]:hidden">
            <Botao acao={acao} principal={false} ocupada={ocupada} executar={executar} />
          </span>
        ))}
        <span className="max-[820px]:flex-1 max-[820px]:[&>*]:w-full">
          <Botao acao={primaria} principal={!discreta} ocupada={ocupada} executar={executar} />
        </span>

        {/* Celular: o resto num menu. */}
        {secundarias.length > 0 ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="icon" className="size-11 min-[821px]:hidden" aria-label="Mais ações">
                <Ellipsis aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-56">
              {secundarias.map((acao) =>
                acao.tipo === "link" ? (
                  <DropdownMenuItem key={acao.rotulo} asChild className="min-h-11">
                    <Link href={acao.href}>
                      <IconeDe acao={acao} />
                      {acao.rotulo}
                    </Link>
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    key={acao.tipo}
                    className="min-h-11"
                    disabled={ocupada !== null}
                    onSelect={() => executar(acao)}
                  >
                    <IconeDe acao={acao} />
                    {rotuloDe(acao)}
                  </DropdownMenuItem>
                ),
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
      {lancando ? <FolhaNovoLancamento aoFechar={fecharLancamento} /> : null}
    </>
  );
}

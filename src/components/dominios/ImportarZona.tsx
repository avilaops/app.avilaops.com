"use client";

import { useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import Confirmacao from "@/components/sistema/Confirmacao";
import { BlocoDiferenca, linhaTexto, textoDoAjuste } from "@/components/dominios/DiferencaDeZona";
import { BOTAO, CartaoLista, MensagemErro, MensagemStatus } from "@/components/hub-social/comum";
import { Label } from "@/components/shadcn/label";
import type { DiferencaZona } from "@/lib/dominios/dns/versoes";
import { cn } from "@/lib/utils";

/**
 * Importar um arquivo de zona BIND: o caminho de quem traz o domínio de outro
 * provedor, sem redigitar registro por registro.
 *
 * Dois passos, sempre. Primeiro a prévia, que não muda nada: o que sai, o que
 * entra, o que fica de fora do arquivo e por quê, e qualquer problema que
 * impeça a importação. Depois a confirmação, que só aplica a mesma diferença
 * mostrada — se a zona mudou nesse meio-tempo, o servidor recusa e pede outra
 * prévia.
 */

type Previa = {
  ignoradas: { linha: number; texto: string; motivo: string }[];
  problemas: string[];
  diferenca: DiferencaZona;
  assinatura: string;
};

const LIMITE_BYTES = 256 * 1024;

export default function ImportarZona({ base }: { base: string }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState("");
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [falha, setFalha] = useState("");
  const [aviso, setAviso] = useState("");

  function trocarTexto(novo: string) {
    setTexto(novo);
    // A prévia é do texto que a gerou: texto novo pede prévia nova.
    setPrevia(null);
    setFalha("");
  }

  async function lerArquivo(evento: ChangeEvent<HTMLInputElement>) {
    const arquivo = evento.target.files?.[0];
    if (!arquivo) return;
    if (arquivo.size > LIMITE_BYTES) {
      setFalha(`O arquivo passa de ${LIMITE_BYTES / 1024} KB.`);
      return;
    }
    trocarTexto(await arquivo.text());
  }

  async function enviar(assinatura?: string) {
    setEnviando(true);
    setFalha("");
    try {
      const resposta = await fetch(`${base}/importar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto, ...(assinatura ? { assinatura } : {}) }),
      });
      const dados = await resposta.json().catch(() => ({}));
      if (!resposta.ok || !dados.ok) {
        setFalha(dados.error ?? "Não foi possível importar a zona.");
        if (assinatura) {
          // Parte pode ter sido aplicada: a tela relê a zona e pede prévia nova.
          setPrevia(null);
          router.refresh();
        }
        return;
      }
      if (!assinatura) {
        setPrevia(dados.previa);
        return;
      }
      setAviso("Zona importada. A zona de antes ficou guardada como versão, e dá para voltar a ela.");
      setPrevia(null);
      setTexto("");
      setAberto(false);
      router.refresh();
    } catch (e) {
      setFalha(e instanceof Error ? e.message : "Não foi possível importar a zona.");
    } finally {
      setEnviando(false);
      setConfirmar(false);
    }
  }

  const dif = previa?.diferenca;
  const nada = dif && dif.sair.length + dif.entrar.length + dif.ajustar.length === 0;
  const podeImportar = previa && previa.problemas.length === 0 && !nada;

  return (
    <CartaoLista
      titulo="Importar zona"
      descricao="Traga a zona de outro provedor a partir do arquivo BIND exportado lá. A zona passa a ser o que está no arquivo; antes, você vê o que muda."
      acao={
        aberto ? null : (
          <button type="button" className="secondary-button shrink-0" onClick={() => setAberto(true)}>
            Importar arquivo
          </button>
        )
      }
    >
      {aviso ? (
        <div className="px-4 py-3">
          <MensagemStatus>{aviso}</MensagemStatus>
        </div>
      ) : null}

      {aberto ? (
        <div className="flex flex-col gap-3 px-4 py-4">
          <div>
            <Label htmlFor="zona-arquivo" className="text-[13px] text-muted-foreground">
              Arquivo de zona (.zone, .txt, .db)
            </Label>
            <input
              id="zona-arquivo"
              type="file"
              accept=".zone,.txt,.db,.bind,text/plain"
              onChange={lerArquivo}
              className="mt-1 block w-full min-w-0 text-[15px] file:mr-3 file:rounded-md file:border file:border-input file:bg-transparent file:px-3 file:py-2 file:text-foreground"
            />
          </div>
          <div>
            <Label htmlFor="zona-texto" className="text-[13px] text-muted-foreground">
              Ou cole o conteúdo
            </Label>
            <textarea
              id="zona-texto"
              value={texto}
              onChange={(e) => trocarTexto(e.target.value)}
              rows={8}
              spellCheck={false}
              // Uma linha do arquivo é um registro: quebrar a linha na tela engana.
              wrap="off"
              placeholder={"$ORIGIN exemplo.com.br.\nwww  3600  IN  CNAME  exemplo.com.br.\n@    3600  IN  MX     10 mx1.provedor.com."}
              className="mt-1 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-2 font-mono! text-[16px] text-foreground min-[821px]:text-[13px]"
            />
          </div>

          {falha ? <MensagemErro>{falha}</MensagemErro> : null}

          {previa ? (
            <div className="space-y-3 rounded-lg border border-border p-3">
              {previa.problemas.length ? (
                <div>
                  <p className="text-[13px] font-semibold text-[color:var(--red)]">
                    Nada será importado enquanto o arquivo tiver {previa.problemas.length === 1 ? "este problema" : "estes problemas"}:
                  </p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[13px] text-foreground [overflow-wrap:anywhere]">
                    {previa.problemas.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                </div>
              ) : nada ? (
                <p className="text-[15px] text-muted-foreground">A zona já está igual ao arquivo. Nada a importar.</p>
              ) : null}

              {dif ? (
                <>
                  <BlocoDiferenca titulo="Sai da zona" linhas={dif.sair.map(linhaTexto)} />
                  <BlocoDiferenca titulo="Entra na zona" linhas={dif.entrar.map(linhaTexto)} />
                  <BlocoDiferenca titulo="Muda TTL ou proxy" linhas={dif.ajustar.map(textoDoAjuste)} />
                </>
              ) : null}
              <BlocoDiferenca
                titulo="Fica de fora do arquivo"
                linhas={previa.ignoradas.map((i) => `linha ${i.linha}: ${i.motivo} (${i.texto})`)}
              />
            </div>
          ) : null}

          <div className="flex flex-col gap-2 min-[821px]:flex-row min-[821px]:justify-end">
            <button
              type="button"
              className={cn("secondary-button", BOTAO)}
              onClick={() => {
                trocarTexto("");
                setAberto(false);
              }}
            >
              Cancelar
            </button>
            {podeImportar ? (
              <button type="button" className={cn("primary-button", BOTAO)} disabled={enviando} onClick={() => setConfirmar(true)}>
                Importar
              </button>
            ) : (
              <button
                type="button"
                className={cn("primary-button", BOTAO)}
                disabled={enviando || !texto.trim()}
                onClick={() => enviar()}
              >
                {enviando ? "Lendo…" : "Ver o que muda"}
              </button>
            )}
          </div>
        </div>
      ) : null}

      {confirmar && dif && previa ? (
        <Confirmacao
          titulo="Importar o arquivo para a zona?"
          descricao={`${dif.sair.length} ${dif.sair.length === 1 ? "registro sai" : "registros saem"}, ${dif.entrar.length} ${dif.entrar.length === 1 ? "entra" : "entram"} e ${dif.ajustar.length} ${dif.ajustar.length === 1 ? "muda" : "mudam"} de TTL ou proxy. Durante a troca, alguns nomes podem ficar sem resposta por alguns minutos. A zona de antes fica guardada como versão.`}
          reversivel
          rotuloConfirmar="Importar zona"
          confirmando={enviando}
          aoConfirmar={() => enviar(previa.assinatura)}
          aoCancelar={() => setConfirmar(false)}
        />
      ) : null}
    </CartaoLista>
  );
}

"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Confirmacao from "@/components/sistema/Confirmacao";
import { BOTAO, CAMPO, CartaoLista, MensagemErro, MensagemStatus } from "@/components/hub-social/comum";
import { Input } from "@/components/shadcn/input";
import { Label } from "@/components/shadcn/label";
import { cn } from "@/lib/utils";

/**
 * Registrar uma versão nova de um parâmetro. Só aparece para o dono.
 *
 * Não edita a versão em vigor: grava outra, com data de vigência de hoje em
 * diante. Confirmar um valor proposto é isso — a mesma linha pendente, de
 * novo, como vigente. A confirmação diz o que muda e desde quando.
 */

const CAMPO_SELECT = "mt-1 w-full rounded-md border border-input bg-transparent px-3 text-foreground";

export type DadosIniciais = {
  chave: string;
  valor: string;
  unidade: string;
  dica: string;
  estado: string;
  fontes: string;
  dono: string;
  hoje: string;
  /** Rótulo do valor em vigor agora, para a confirmação dizer de onde sai. */
  atual: string | null;
};

export default function NovaVersaoParametro({ inicial }: { inicial: DadosIniciais }) {
  const router = useRouter();
  const [valor, setValor] = useState(inicial.valor);
  const [estado, setEstado] = useState(inicial.estado === "PENDENTE_DE_CONFIRMACAO" ? "VIGENTE" : inicial.estado);
  const [escopo, setEscopo] = useState("global");
  const [vigenteDesde, setVigenteDesde] = useState(inicial.hoje);
  const [revisarEm, setRevisarEm] = useState("");
  const [fontes, setFontes] = useState(inicial.fontes);
  const [dono, setDono] = useState(inicial.dono);
  const [nota, setNota] = useState("");
  const [confirmar, setConfirmar] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [falha, setFalha] = useState("");
  const [aviso, setAviso] = useState("");

  function pedirConfirmacao(evento: FormEvent) {
    evento.preventDefault();
    setFalha("");
    setAviso("");
    setConfirmar(true);
  }

  async function enviar() {
    setEnviando(true);
    try {
      const resposta = await fetch("/api/parametros", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chave: inicial.chave, valor, estado, escopo, vigenteDesde, revisarEm, fontes, dono, nota }),
      });
      const dados = await resposta.json().catch(() => ({}));
      if (!resposta.ok || !dados.ok) {
        setFalha(dados.error ?? "Não foi possível registrar a versão.");
        return;
      }
      setAviso("Versão registrada. A anterior continua no histórico.");
      setNota("");
      router.refresh();
    } catch (e) {
      setFalha(e instanceof Error ? e.message : "Não foi possível registrar a versão.");
    } finally {
      setEnviando(false);
      setConfirmar(false);
    }
  }

  const desde = vigenteDesde.split("-").reverse().join("/");

  return (
    <CartaoLista
      titulo="Registrar nova versão"
      descricao="A versão em vigor não é alterada: esta passa a valer a partir da data escolhida, e eventos anteriores continuam com a regra da época."
    >
      {falha ? (
        <div className="px-4 pt-3">
          <MensagemErro>{falha}</MensagemErro>
        </div>
      ) : null}
      {aviso ? (
        <div className="px-4 pt-3">
          <MensagemStatus>{aviso}</MensagemStatus>
        </div>
      ) : null}

      <form onSubmit={pedirConfirmacao} className="flex flex-col gap-3 px-4 py-4">
        <div className="grid gap-3 min-[821px]:grid-cols-2">
          <div>
            <Label htmlFor="par-valor" className="text-[13px] text-muted-foreground">
              Valor ({inicial.unidade})
            </Label>
            <Input
              id="par-valor"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              aria-describedby="par-valor-dica"
              className={cn("mt-1 font-mono", CAMPO)}
              required
            />
            <p id="par-valor-dica" className="mt-1 text-[13px] text-muted-foreground">
              {inicial.dica}
            </p>
          </div>
          <div>
            <Label htmlFor="par-estado" className="text-[13px] text-muted-foreground">
              Estado
            </Label>
            <select
              id="par-estado"
              value={estado}
              onChange={(e) => setEstado(e.target.value)}
              aria-describedby="par-estado-dica"
              className={cn(CAMPO_SELECT, CAMPO)}
            >
              <option value="VIGENTE">Vigente</option>
              <option value="PENDENTE_DE_CONFIRMACAO">Pendente de confirmação</option>
              <option value="MONITORADA">Monitorada</option>
            </select>
            <p id="par-estado-dica" className="mt-1 text-[13px] text-muted-foreground">
              {estado === "VIGENTE"
                ? "O sistema decide com este valor."
                : estado === "MONITORADA"
                  ? "O sistema não lê: serve de lembrete de revisão."
                  : "Não decide nada: o caso vai para a operação."}
            </p>
          </div>
          <div>
            <Label htmlFor="par-desde" className="text-[13px] text-muted-foreground">
              Vigente desde
            </Label>
            <Input
              id="par-desde"
              type="date"
              min={inicial.hoje}
              value={vigenteDesde}
              onChange={(e) => setVigenteDesde(e.target.value)}
              className={cn("mt-1", CAMPO)}
              required
            />
          </div>
          <div>
            <Label htmlFor="par-revisar" className="text-[13px] text-muted-foreground">
              Revisar em (opcional)
            </Label>
            <Input
              id="par-revisar"
              type="date"
              value={revisarEm}
              onChange={(e) => setRevisarEm(e.target.value)}
              className={cn("mt-1", CAMPO)}
            />
          </div>
          <div>
            <Label htmlFor="par-escopo" className="text-[13px] text-muted-foreground">
              Escopo
            </Label>
            <Input
              id="par-escopo"
              value={escopo}
              onChange={(e) => setEscopo(e.target.value)}
              aria-describedby="par-escopo-dica"
              className={cn("mt-1 font-mono", CAMPO)}
              required
            />
            <p id="par-escopo-dica" className="mt-1 text-[13px] text-muted-foreground">
              global, uma extensão (.br) ou registrador:nome. O mais específico vence.
            </p>
          </div>
          <div>
            <Label htmlFor="par-fontes" className="text-[13px] text-muted-foreground">
              Fonte ou decisão
            </Label>
            <Input
              id="par-fontes"
              value={fontes}
              onChange={(e) => setFontes(e.target.value)}
              aria-describedby="par-fontes-dica"
              className={cn("mt-1", CAMPO)}
              required
            />
            <p id="par-fontes-dica" className="mt-1 text-[13px] text-muted-foreground">
              IDs de FONTES (F1, F2) ou o documento da decisão, separados por vírgula.
            </p>
          </div>
          <div>
            <Label htmlFor="par-dono" className="text-[13px] text-muted-foreground">
              Dono
            </Label>
            <Input id="par-dono" value={dono} onChange={(e) => setDono(e.target.value)} className={cn("mt-1", CAMPO)} required />
          </div>
          <div>
            <Label htmlFor="par-nota" className="text-[13px] text-muted-foreground">
              Nota (opcional)
            </Label>
            <Input id="par-nota" value={nota} onChange={(e) => setNota(e.target.value)} className={cn("mt-1", CAMPO)} />
          </div>
        </div>
        <div className="flex flex-col gap-2 min-[821px]:flex-row min-[821px]:justify-end">
          <button type="submit" disabled={enviando} className={cn("primary-button", BOTAO)}>
            Registrar versão
          </button>
        </div>
      </form>

      {confirmar ? (
        <Confirmacao
          titulo="Registrar esta versão?"
          descricao={`${inicial.chave} passa a ser ${valor} (${inicial.unidade}), ${estado === "VIGENTE" ? "vigente" : estado === "MONITORADA" ? "monitorada" : "pendente de confirmação"}, no escopo ${escopo}, a partir de ${desde}.${inicial.atual ? ` Hoje vale ${inicial.atual}.` : ""} A versão anterior fica no histórico e continua valendo para o que aconteceu antes.`}
          alvo={inicial.chave}
          rotuloConfirmar="Registrar"
          confirmando={enviando}
          aoConfirmar={enviar}
          aoCancelar={() => setConfirmar(false)}
        />
      ) : null}
    </CartaoLista>
  );
}

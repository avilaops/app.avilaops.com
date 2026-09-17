"use client";

import { useRef, type FormEvent, type RefObject } from "react";
import EstadoVazio from "@/components/hub-social/EstadoVazio";
import { Badge } from "@/components/shadcn/badge";
import { Button } from "@/components/shadcn/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/shadcn/card";
import { Checkbox } from "@/components/shadcn/checkbox";
import { Input } from "@/components/shadcn/input";
import { Label } from "@/components/shadcn/label";
import { RadioGroup, RadioGroupItem } from "@/components/shadcn/radio-group";
import { Textarea } from "@/components/shadcn/textarea";
import { AJUDA, AREA_TEXTO, BOTAO_CELULAR, CAMPO, ROTULO } from "@/components/newsletter/estilos";
import { cn } from "@/lib/utils";

/**
 * Aba Contatos, parte de cima: o formulário de importação e as etiquetas
 * disponíveis. O submit continua lendo FormData do <form>: RadioGroup e
 * Checkbox do shadcn (Radix) emitem input escondido com `name` quando estão
 * dentro de um formulário, então "mode", "raw", "tags" e
 * "keepMachineAddresses" chegam iguais ao que a API já recebia.
 */

const MODOS: { valor: string; rotulo: string }[] = [
  { valor: "paste", rotulo: "Colar lista" },
  { valor: "clientes", rotulo: "Puxar dos clientes do painel" },
];

export default function ImportarContatos({
  aoEnviar,
  ocupado,
  inscritos,
  tags,
  refEmails,
}: {
  aoEnviar: (event: FormEvent<HTMLFormElement>) => void;
  ocupado: boolean;
  inscritos: number;
  tags: { tag: string; count: number }[];
  refEmails: RefObject<HTMLTextAreaElement | null>;
}) {
  const refEtiquetas = useRef<HTMLInputElement>(null);

  return (
    <>
      <Card className="gap-4 py-4 min-[821px]:gap-5 min-[821px]:py-5">
        <CardHeader className="px-4 min-[821px]:px-6">
          <CardTitle className="text-[17px] min-[821px]:text-[15px]">Importar contatos</CardTitle>
          <CardDescription>Um por linha, vírgula ou o formato “Nome &lt;e-mail&gt;”. Duplicados são unificados.</CardDescription>
          <CardAction className="text-[13px] text-muted-foreground">{inscritos} inscritos</CardAction>
        </CardHeader>

        <CardContent className="px-4 min-[821px]:px-6">
          <form className="flex flex-col gap-4" onSubmit={aoEnviar}>
            <RadioGroup name="mode" defaultValue="paste" aria-label="Origem dos contatos" className="grid gap-2 min-[560px]:grid-cols-2">
              {MODOS.map((modo) => (
                <Label
                  key={modo.valor}
                  htmlFor={`newsletter-modo-${modo.valor}`}
                  className={cn(
                    "flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-border px-4 transition-colors has-data-[state=checked]:border-primary has-data-[state=checked]:bg-accent",
                    ROTULO,
                  )}
                >
                  <RadioGroupItem id={`newsletter-modo-${modo.valor}`} value={modo.valor} />
                  {modo.rotulo}
                </Label>
              ))}
            </RadioGroup>

            <div className="flex flex-col gap-2">
              <Label htmlFor="newsletter-raw" className={ROTULO}>
                E-mails
              </Label>
              <Textarea
                id="newsletter-raw"
                name="raw"
                rows={6}
                ref={refEmails}
                className={AREA_TEXTO}
                placeholder={"um@cliente.com.br\nNome do Cliente <outro@cliente.com.br>\nterceiro@cliente.com.br"}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="newsletter-tags" className={ROTULO}>
                Etiquetas
              </Label>
              <Input
                id="newsletter-tags"
                name="tags"
                ref={refEtiquetas}
                className={CAMPO}
                placeholder="clientes, saudepet, prospeccao"
              />
              <p className={AJUDA}>Separe por vírgula. Etiquetas viram públicos na hora de enviar.</p>
            </div>

            <div className="flex min-h-12 items-center gap-3">
              <Checkbox id="newsletter-keep" name="keepMachineAddresses" className="size-5" />
              <Label htmlFor="newsletter-keep" className={cn("cursor-pointer leading-5", ROTULO)}>
                Manter caixas automáticas (no-reply, notificações)
              </Label>
            </div>

            <div className="flex min-[821px]:justify-end">
              <Button type="submit" disabled={ocupado} className={BOTAO_CELULAR}>
                {ocupado ? "Importando…" : "Importar"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="gap-4 py-4 min-[821px]:gap-5 min-[821px]:py-5">
        <CardHeader className="px-4 min-[821px]:px-6">
          <CardTitle className="text-[17px] min-[821px]:text-[15px]">Públicos disponíveis</CardTitle>
          <CardDescription>Etiquetas dos inscritos ativos; cada uma vira um público na campanha.</CardDescription>
          <CardAction className="text-[13px] text-muted-foreground">{tags.length} etiquetas</CardAction>
        </CardHeader>
        <CardContent className="px-4 min-[821px]:px-6">
          {tags.length === 0 ? (
            <EstadoVazio
              compacto
              titulo="Nenhuma etiqueta ainda."
              descricao="Importe contatos com etiqueta para segmentar."
              acao={
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => refEtiquetas.current?.focus()}
                  className="min-h-11 w-full px-5 text-[15px] min-[821px]:min-h-10 min-[821px]:text-sm"
                >
                  Etiquetar na importação
                </Button>
              }
            />
          ) : (
            <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
              {tags.map((item) => (
                <li key={item.tag}>
                  <Badge variant="outline" className="h-8 px-3 text-[13px] font-medium">
                    {item.tag} · {item.count}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}

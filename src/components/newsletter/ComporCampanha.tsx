"use client";

import { Button } from "@/components/shadcn/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/shadcn/card";
import { Input } from "@/components/shadcn/input";
import { Label } from "@/components/shadcn/label";
import { Textarea } from "@/components/shadcn/textarea";
import { AJUDA, AREA_TEXTO, BOTAO_CELULAR, CAMPO, CHIP, CHIP_ATIVO, CHIP_INATIVO, ROTULO } from "@/components/newsletter/estilos";
import { FORMAT_LABEL, type Draft, type Previa, type Readiness } from "@/components/newsletter/tipos";
import { cn } from "@/lib/utils";

const FORMATOS = ["HTML", "TEXT", "IMAGE"] as const;

function Campo({ id, rotulo, ajuda, children }: { id: string; rotulo: string; ajuda?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id} className={ROTULO}>
        {rotulo}
      </Label>
      {children}
      {ajuda ? <p className={AJUDA}>{ajuda}</p> : null}
    </div>
  );
}

export default function ComporCampanha({
  draft,
  setDraft,
  preview,
  audienceLabel,
  tags,
  testTo,
  setTestTo,
  readiness,
  ocupadoEm,
  aoEnviarImagem,
  aoToggleTag,
  aoSalvar,
  aoTestar,
  aoPedirEnvio,
}: {
  draft: Draft;
  setDraft: (draft: Draft) => void;
  preview: Previa;
  audienceLabel: string;
  tags: { tag: string; count: number }[];
  testTo: string;
  setTestTo: (valor: string) => void;
  readiness: Readiness;
  ocupadoEm: string;
  aoEnviarImagem: (file: File) => void;
  aoToggleTag: (tag: string) => void;
  aoSalvar: () => void;
  aoTestar: () => void;
  aoPedirEnvio: () => void;
}) {
  return (
    <Card className="gap-4 py-4 min-[821px]:gap-5 min-[821px]:py-5">
      <CardHeader className="px-4 min-[821px]:px-6">
        <CardTitle className="text-[17px] min-[821px]:text-[15px]">{draft.id ? "Editando rascunho" : "Nova campanha"}</CardTitle>
        <CardDescription>
          {preview.recipients} destinatários · {audienceLabel}
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-5 px-4 min-[821px]:px-6">
        <div className="grid gap-4 min-[821px]:grid-cols-2">
          <Campo id="campanha-nome" rotulo="Nome interno">
            <Input
              id="campanha-nome"
              className={CAMPO}
              value={draft.name}
              maxLength={160}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              placeholder="Ex.: Quem cuida do seu site - agosto"
            />
          </Campo>
          <Campo id="campanha-assunto" rotulo="Assunto do e-mail">
            <Input
              id="campanha-assunto"
              className={CAMPO}
              value={draft.subject}
              maxLength={200}
              onChange={(event) => setDraft({ ...draft, subject: event.target.value })}
              placeholder="Você ainda sabe quem cuida do seu site?"
            />
          </Campo>
        </div>

        <Campo id="campanha-previa" rotulo="Texto de prévia">
          <Input
            id="campanha-previa"
            className={CAMPO}
            value={draft.previewText}
            maxLength={300}
            onChange={(event) => setDraft({ ...draft, previewText: event.target.value })}
            placeholder="Linha curta que aparece depois do assunto na caixa de entrada"
          />
        </Campo>

        <div className="flex flex-col gap-2">
          <span className={ROTULO} id="campanha-formato">
            Formato
          </span>
          <div role="radiogroup" aria-labelledby="campanha-formato" className="flex gap-2 overflow-x-auto [scrollbar-width:none]">
            {FORMATOS.map((format) => {
              const ativo = draft.format === format;
              return (
                <button
                  key={format}
                  type="button"
                  role="radio"
                  aria-checked={ativo}
                  onClick={() => setDraft({ ...draft, format })}
                  className={cn(CHIP, ativo ? CHIP_ATIVO : CHIP_INATIVO)}
                >
                  {FORMAT_LABEL[format]}
                </button>
              );
            })}
          </div>
        </div>

        {draft.format === "HTML" ? (
          <Campo
            id="campanha-html"
            rotulo="HTML da campanha"
            ajuda={
              <>
                Use <code className="font-mono">{"{{unsubscribe}}"}</code> onde quiser o link de descadastro. Sem o marcador, um rodapé é
                acrescentado automaticamente.
              </>
            }
          >
            <Textarea
              id="campanha-html"
              rows={14}
              className={cn(AREA_TEXTO, "font-mono")}
              value={draft.html}
              onChange={(event) => setDraft({ ...draft, html: event.target.value })}
              placeholder="<!doctype html> … cole aqui o e-mail pronto"
            />
          </Campo>
        ) : null}

        {draft.format === "TEXT" ? (
          <Campo id="campanha-texto" rotulo="Mensagem">
            <Textarea
              id="campanha-texto"
              rows={12}
              className={AREA_TEXTO}
              value={draft.text}
              onChange={(event) => setDraft({ ...draft, text: event.target.value })}
              placeholder="Escreva como escreveria um e-mail. Linhas em branco viram parágrafos."
            />
          </Campo>
        ) : null}

        {draft.format === "IMAGE" ? (
          <div className="flex flex-col gap-4">
            <Campo id="campanha-imagem" rotulo="Imagem" ajuda="PNG, JPG, WEBP ou GIF até 8 MB. A imagem fica em endereço público fixo.">
              <Input
                id="campanha-imagem"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                disabled={ocupadoEm === "upload"}
                className={CAMPO}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) aoEnviarImagem(file);
                }}
              />
            </Campo>
            {draft.imageUrl ? (
              // A imagem é a mesma URL pública que vai no e-mail: precisa ser
              // exibida crua, sem o otimizador do next/image no meio.
              // eslint-disable-next-line @next/next/no-img-element
              <img className="max-h-80 w-auto self-start rounded-xl border border-border" src={draft.imageUrl} alt="Prévia da imagem da campanha" />
            ) : null}
            <div className="grid gap-4 min-[821px]:grid-cols-2">
              <Campo id="campanha-alt" rotulo="Texto alternativo">
                <Input
                  id="campanha-alt"
                  className={CAMPO}
                  value={draft.imageAlt}
                  onChange={(event) => setDraft({ ...draft, imageAlt: event.target.value })}
                  placeholder="Descreva a imagem para quem bloqueia imagens"
                />
              </Campo>
              <Campo id="campanha-link" rotulo="Link ao clicar">
                <Input
                  id="campanha-link"
                  className={CAMPO}
                  value={draft.imageLinkUrl}
                  onChange={(event) => setDraft({ ...draft, imageLinkUrl: event.target.value })}
                  placeholder="https://avilaops.com/…"
                />
              </Campo>
            </div>
          </div>
        ) : null}

        <div className="flex flex-col gap-2">
          <span className={ROTULO} id="campanha-publico">
            Público
          </span>
          <div role="group" aria-labelledby="campanha-publico" className="flex flex-wrap gap-2">
            <button
              type="button"
              aria-pressed={draft.audienceTags.length === 0}
              onClick={() => setDraft({ ...draft, audienceTags: [] })}
              className={cn(CHIP, draft.audienceTags.length === 0 ? CHIP_ATIVO : CHIP_INATIVO)}
            >
              Todos os inscritos
            </button>
            {tags.map((item) => {
              const ativo = draft.audienceTags.includes(item.tag);
              return (
                <button
                  key={item.tag}
                  type="button"
                  aria-pressed={ativo}
                  onClick={() => aoToggleTag(item.tag)}
                  className={cn(CHIP, ativo ? CHIP_ATIVO : CHIP_INATIVO)}
                >
                  {item.tag} · {item.count}
                </button>
              );
            })}
          </div>
        </div>

        <Card className="gap-3 overflow-hidden py-3">
          <CardHeader className="px-4">
            <CardTitle className="text-[15px]">Prévia</CardTitle>
            <CardDescription>Renderizada pelo mesmo código que envia.</CardDescription>
            <CardAction className="text-[13px] text-muted-foreground">{preview.recipients} destinatários</CardAction>
          </CardHeader>
          <CardContent className="px-0">
            <iframe title="Prévia da campanha" srcDoc={preview.html} sandbox="" className="h-[520px] w-full border-0 border-t border-border bg-white" />
          </CardContent>
        </Card>

        <div className="flex flex-col gap-3 min-[821px]:flex-row min-[821px]:items-end">
          <div className="flex flex-1 flex-col gap-2">
            <Label htmlFor="campanha-teste" className={ROTULO}>
              Enviar teste para
            </Label>
            <Input id="campanha-teste" type="email" className={CAMPO} value={testTo} onChange={(event) => setTestTo(event.target.value)} />
          </div>
          <Button type="button" variant="outline" onClick={aoSalvar} disabled={ocupadoEm === "save"} className={BOTAO_CELULAR}>
            {ocupadoEm === "save" ? "Salvando…" : "Salvar rascunho"}
          </Button>
          <Button type="button" variant="outline" onClick={aoTestar} disabled={ocupadoEm === "test" || !readiness.ready} className={BOTAO_CELULAR}>
            {ocupadoEm === "test" ? "Enviando…" : "Enviar teste"}
          </Button>
          <Button
            type="button"
            onClick={aoPedirEnvio}
            disabled={ocupadoEm === "send" || !readiness.ready || preview.recipients === 0}
            className={BOTAO_CELULAR}
          >
            {ocupadoEm === "send" ? "Enviando…" : `Enviar para ${preview.recipients}`}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

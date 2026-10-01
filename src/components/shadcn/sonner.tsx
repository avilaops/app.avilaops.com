"use client"

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { Toaster as Sonner, type ToasterProps } from "sonner"

/**
 * Aviso temporário da casa. O modelo do shadcn lê o tema do `next-themes`,
 * que o Ávila OS não usa: aqui o tema é `data-theme` no <html>, e as cores
 * saem direto dos tokens, que já trocam sozinhos com ele.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      position="top-center"
      icons={{
        success: <CircleCheckIcon className="size-4 text-[color:var(--green)]" />,
        info: <InfoIcon className="size-4 text-[color:var(--blue)]" />,
        warning: <TriangleAlertIcon className="size-4 text-[color:var(--amber)]" />,
        error: <OctagonXIcon className="size-4 text-[color:var(--red)]" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      toastOptions={{
        classNames: {
          description: "!text-[color:var(--muted)]",
          actionButton: "!bg-[color:var(--accent)] !text-white",
        },
      }}
      style={
        {
          "--normal-bg": "var(--surface-raised)",
          "--normal-text": "var(--text)",
          "--normal-border": "var(--line)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }

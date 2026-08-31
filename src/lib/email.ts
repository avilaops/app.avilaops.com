import { chamarN8n, n8nConfigurado } from "@/lib/n8n";

/**
 * Porta única de saída de e-mail do painel.
 *
 * Existia antes espalhada: `auth.ts` chamava o Resend para a recuperação de
 * senha, `deliverables.ts` para a confirmação de pagamento, e o Worker de
 * captura de lead também. Em 31/08/2026 descobri que a chave do Resend em
 * produção responde "API key is invalid", ou seja, **nada disso chegava a
 * ninguém desde algum ponto de agosto** — e falhava calado, porque a rota de
 * recuperação responde a mesma mensagem genérica com ou sem envio.
 *
 * Agora sai pelo servidor da casa (`mail.avilaops.com`), pelo fluxo
 * "Ávila Ops - Envio de E-mail Transacional (SMTP)" do n8n, remetente
 * `n8n@avilaops.com` e resposta para `nicolas@avilaops.com`. É o mesmo caminho
 * que o auth já usa, e mantém a regra da casa: credencial de terceiro fica no
 * cofre do n8n, não neste projeto.
 *
 * Vender e-mail e mandar o nosso pelo provedor de outro nunca fez sentido.
 */

export type EmailSaida = {
  to: string;
  subject: string;
  html: string;
  /** Versão em texto puro. Sem ela, filtro de spam pontua pior. */
  text?: string;
};

export class EmailIndisponivel extends Error {}

/** A tela pode perguntar antes de prometer envio ao operador. */
export function emailConfigurado() {
  return n8nConfigurado();
}

/**
 * Envia e devolve só quando o n8n confirma. Lança se não deu: quem chama
 * decide se isso derruba a operação (recuperação de senha) ou se é aviso
 * secundário (lead novo).
 */
export async function enviarEmail(email: EmailSaida): Promise<void> {
  if (!email.to.includes("@")) {
    throw new EmailIndisponivel("Destinatário inválido.");
  }
  if (!n8nConfigurado()) {
    throw new EmailIndisponivel("N8N_AVILA_OS_TOKEN não configurado: o painel não consegue enviar e-mail.");
  }

  await chamarN8n(
    "avila-ops-send-email",
    {
      to: email.to,
      subject: email.subject,
      html: email.html,
      text: email.text ?? semTags(email.html),
    },
    { timeoutMs: 20_000 },
  );
}

/**
 * Aviso que não pode derrubar a ação que acabou de dar certo.
 *
 * O lead já está gravado quando o e-mail sai; se o n8n estiver fora do ar, o
 * lead não pode ser perdido por causa do aviso. Registra no log do servidor,
 * que é onde a rodada diária olha.
 */
export async function avisarPorEmail(email: EmailSaida): Promise<boolean> {
  try {
    await enviarEmail(email);
    return true;
  } catch (erro) {
    console.error(`[email] não avisou ${email.to} sobre "${email.subject}"`, erro);
    return false;
  }
}

/** Texto puro a partir do HTML, para o corpo alternativo. */
function semTags(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

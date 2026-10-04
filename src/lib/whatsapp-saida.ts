import { chamarN8n, n8nConfigurado } from "@/lib/n8n";

/**
 * Porta única de saída de WhatsApp do painel.
 *
 * Mesma ideia do `email.ts`: o envio sai por um workflow do n8n
 * ("Ávila OS — Envio de WhatsApp"), que guarda a credencial do provedor
 * (Meta WhatsApp Business/Twilio) no cofre do n8n — nunca neste projeto.
 *
 * Importante: envio iniciado pela empresa no WhatsApp Business exige template
 * aprovado pela Meta. Este app só entrega o texto ao n8n; qual número e qual
 * template são usados é decisão da infra, fora do código.
 */

export type WhatsappSaida = {
  /** Número do destinatário, com DDI/DDD. O n8n normaliza o formato final. */
  to: string;
  text: string;
};

export class WhatsappIndisponivel extends Error {}

/** A tela pode perguntar antes de prometer envio ao operador. */
export function whatsappConfigurado() {
  return n8nConfigurado();
}

/** Só dígitos: serve para validar e para o n8n receber um número limpo. */
function somenteDigitos(numero: string): string {
  return numero.replace(/\D/g, "");
}

/**
 * Envia e devolve só quando o n8n confirma. Lança se não deu — quem chama
 * decide se isso derruba a operação ou é aviso secundário.
 */
export async function enviarWhatsapp(mensagem: WhatsappSaida): Promise<void> {
  const numero = somenteDigitos(mensagem.to);
  if (numero.length < 10) {
    throw new WhatsappIndisponivel("Número de WhatsApp inválido.");
  }
  if (!n8nConfigurado()) {
    throw new WhatsappIndisponivel("N8N_AVILA_OS_TOKEN não configurado: o painel não consegue enviar WhatsApp.");
  }

  await chamarN8n(
    "avila-ops-send-whatsapp",
    { to: numero, text: mensagem.text },
    { timeoutMs: 20_000 },
  );
}

/**
 * Aviso que não pode derrubar a ação que acabou de dar certo. Registra no log
 * do servidor quando falha, como o `avisarPorEmail`.
 */
export async function avisarPorWhatsapp(mensagem: WhatsappSaida): Promise<boolean> {
  try {
    await enviarWhatsapp(mensagem);
    return true;
  } catch (erro) {
    console.error(`[whatsapp] não avisou ${mensagem.to}`, erro);
    return false;
  }
}

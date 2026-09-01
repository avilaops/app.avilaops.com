import type { Metadata } from "next";
import EmailAutoatendimento from "@/components/EmailAutoatendimento";

export const metadata: Metadata = {
  title: "E-mail com o domínio da sua empresa | Ávila Ops",
  description:
    "Veja o que configurar no DNS do seu domínio e confira na hora. R$ 10 por caixa, por mês.",
};

/**
 * Página pública: é a porta de quem ainda não é cliente. Fica fora do /portal,
 * que exige sessão.
 */
export default function EmailPage() {
  return <EmailAutoatendimento />;
}

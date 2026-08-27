import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import NewsletterStudio from "@/components/NewsletterStudio";
import { getAdmin } from "@/lib/auth";
import { getNewsletterOverview } from "@/lib/newsletter";
import { deliveryReadiness } from "@/lib/newsletter-mailer";

export const dynamic = "force-dynamic";

export default async function NewsletterPage() {
  const admin = await getAdmin();
  if (!admin) redirect("/login");

  const overview = await getNewsletterOverview();
  const readiness = deliveryReadiness();

  return (
    <AppShell adminName={admin.nome} section="newsletter">
      <header className="page-header">
        <div>
          <span className="eyebrow">Operação · Newsletter</span>
          <h1>Uma base, um envio, um responsável.</h1>
          <p>
            Contatos de todos os projetos em um lugar só. Componha em HTML,
            mensagem simples ou imagem, veja a prévia exata do que sai e envie
            — com descadastro em todo e-mail e registro de quem recebeu.
          </p>
        </div>
      </header>

      <NewsletterStudio overview={overview} readiness={readiness} adminEmail={admin.email} />
    </AppShell>
  );
}

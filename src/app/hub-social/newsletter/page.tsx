import { redirect } from "next/navigation";
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
    <>
      <header className="page-header">
        <div>
          <h1>Newsletter</h1>
          <p>Contatos, composição, prévia e envio - com descadastro em todo e-mail.</p>
        </div>
      </header>

      <NewsletterStudio overview={overview} readiness={readiness} adminEmail={admin.email} />
    </>
  );
}

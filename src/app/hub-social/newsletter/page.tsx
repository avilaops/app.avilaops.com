import { redirect } from "next/navigation";
import CabecalhoPagina from "@/components/hub-social/CabecalhoPagina";
import NewsletterStudio from "@/components/NewsletterStudio";
import { getAdmin } from "@/lib/auth";
import { getNewsletterOverview } from "@/lib/newsletter";
import { deliveryReadiness } from "@/lib/newsletter-mailer";

export const dynamic = "force-dynamic";

export default async function NewsletterPage() {
  const admin = await getAdmin();
  if (!admin) redirect("/login");

  const lidoEm = new Date().toISOString();
  const overview = await getNewsletterOverview();
  const readiness = deliveryReadiness();

  return (
    <>
      <CabecalhoPagina
        titulo="Newsletter"
        subtitulo="Contatos, composição, prévia e envio — com descadastro em todo e-mail."
        meta={`motor: ${readiness.driver}`}
      />
      <NewsletterStudio overview={overview} readiness={readiness} adminEmail={admin.email} lidoEm={lidoEm} />
    </>
  );
}

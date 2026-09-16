import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdmin } from "@/lib/auth";
import { listBusinessLocations, type BusinessTone } from "@/lib/google-mybusiness";
import { getGa4OverviewMetrics } from "@/lib/google-analytics";
import GoogleCommandCenterClient from "./GoogleCommandCenterClient";

export default async function GoogleCommandCenterPage() {
  const admin = await getAdmin();
  if (!admin) redirect("/login");

  const locations = await listBusinessLocations();
  const ga4Metrics = await getGa4OverviewMetrics();

  const totalReviews = locations.reduce((acc, loc) => acc + loc.reviewCount, 0);
  const pendingReviewsTotal = locations.reduce((acc, loc) => acc + loc.pendingReviews, 0);
  const averageRating = (
    locations.reduce((acc, loc) => acc + loc.rating, 0) / locations.length
  ).toFixed(2);

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Google</h1>
          <p>Google Meu Negócio das empresas do grupo e tráfego do GA4.</p>
        </div>
        <div className="page-actions">
          <Link href="/hub-social/seo" className="secondary-button">
            SEO & Cloudflare
          </Link>
          <Link href="/operacao" className="secondary-button">
            Voltar à Operação
          </Link>
        </div>
      </header>

      <GoogleCommandCenterClient
        initialLocations={locations}
        initialGa4={ga4Metrics}
        stats={{
          totalLocations: locations.length,
          totalReviews,
          pendingReviewsTotal,
          averageRating: parseFloat(averageRating),
        }}
      />
    </>
  );
}

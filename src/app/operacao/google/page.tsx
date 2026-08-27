import Link from "next/link";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
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
    <AppShell adminName={admin.nome} section="google-suite">
      <header className="page-header">
        <div>
          <span className="eyebrow">Operação · Google Command Center</span>
          <h1>Central de Presença & Analytics</h1>
          <p>
            Gestão unificada do Google Meu Negócio para as 10 empresas do ecossistema e métricas de tráfego GA4 em tempo real.
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.75rem" }}>
          <Link href="/operacao/seo" className="secondary-button">
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
    </AppShell>
  );
}

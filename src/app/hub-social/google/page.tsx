import Link from "next/link";
import { redirect } from "next/navigation";
import GoogleHub from "@/components/google/GoogleHub";
import CabecalhoPagina from "@/components/hub-social/CabecalhoPagina";
import { Button } from "@/components/shadcn/button";
import { getAdmin } from "@/lib/auth";
import { getGa4OverviewMetrics } from "@/lib/google-analytics";
import { listBusinessLocations } from "@/lib/google-mybusiness";

export default async function GooglePage() {
  const admin = await getAdmin();
  if (!admin) redirect("/login");

  const lidoEm = new Date().toISOString();
  const [locations, ga4] = await Promise.all([listBusinessLocations(), getGa4OverviewMetrics()]);

  return (
    <div className="space-y-6">
      <CabecalhoPagina
        titulo="Google"
        subtitulo="Google Meu Negócio das empresas do grupo e tráfego do GA4."
        acoes={
          <Button asChild variant="outline" className="min-h-11 px-5 text-[15px] min-[821px]:min-h-9 min-[821px]:text-sm">
            <Link href="/hub-social/seo">SEO e Search Console</Link>
          </Button>
        }
      />

      <GoogleHub locations={locations} ga4={ga4} lidoEm={lidoEm} />
    </div>
  );
}

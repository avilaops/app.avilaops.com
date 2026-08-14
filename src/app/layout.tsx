import type { Metadata } from "next";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://app.avilaops.com";
const description =
  "Clientes, entregas, oportunidades, domínios, automações e financeiro em uma única operação.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Ávila OS — operação digital",
  description,
  // `noindex` tira da busca, mas não tira o card do WhatsApp: o link da
  // plataforma é justamente o que a gente manda para o cliente entrar.
  robots: { index: false, follow: false },
  openGraph: {
    title: "Ávila OS — operação digital",
    description,
    url: siteUrl,
    siteName: "Ávila OS",
    locale: "pt_BR",
    type: "website",
    images: [
      { url: "/og-default.png", width: 1200, height: 630, alt: "Ávila OS" },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Ávila OS — operação digital",
    description,
    images: ["/og-default.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const themeScript = `
    (() => {
      try {
        const theme = window.localStorage.getItem("avila-ops-theme-v2") || "light";
        document.documentElement.dataset.theme = theme === "dark" ? "dark" : "light";
        document.documentElement.style.colorScheme = theme === "dark" ? "dark" : "light";
      } catch {
        document.documentElement.dataset.theme = "light";
        document.documentElement.style.colorScheme = "light";
      }
    })();
  `;

  return (
    <html lang="pt-BR" data-theme="light" style={{ colorScheme: "light" }}>
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        {children}
      </body>
    </html>
  );
}

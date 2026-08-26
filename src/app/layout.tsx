import type { Metadata } from "next";
import { scriptInicial } from "@/lib/tema-noturno";
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
  return (
    <html lang="pt-BR" data-theme="light" style={{ colorScheme: "light" }}>
      <head>
        {/*
          Modo noturno da casa: 18h escurece, 6h clareia. Precisa rodar antes do
          CSS, senão a tela pinta clara e escurece depois — o flash branco às
          22h é pior do que não ter tema escuro.
        */}
        <script dangerouslySetInnerHTML={{ __html: scriptInicial() }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

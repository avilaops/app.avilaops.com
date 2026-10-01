import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "@/components/shadcn/sonner";
import { scriptInicial } from "@/lib/tema-noturno";
import "./globals.css";

/*
 * Inter: a fonte padrão de produto de software — neutra, feita para tela e com
 * algarismos tabulares quando o número precisa alinhar. Até 01/10/2026 era a Manrope, de cara mais
 * "estúdio de design" do que de software house. `variable` deixa o CSS
 * decidir onde aplica.
 */
const inter = Inter({ subsets: ["latin"], display: "swap", variable: "--font-inter" });

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://app.avilaops.com";
const description =
  "Clientes, entregas, oportunidades, domínios, automações e financeiro em uma única operação.";

/*
 * `viewportFit: cover` é o que libera o `env(safe-area-inset-*)` no iPhone:
 * sem ele a barra de abas fica atrás do indicador de início e o topo cola no
 * recorte da câmera. `themeColor` pinta a barra de status da mesma cor do
 * fundo, por tema.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f8fa" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0d10" },
  ],
};

export const metadata: Metadata = {
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Avila Ops",
  },
  metadataBase: new URL(siteUrl),
  title: "Avila Ops - operação digital",
  description,
  // `noindex` tira da busca, mas não tira o card do WhatsApp: o link da
  // plataforma é justamente o que a gente manda para o cliente entrar.
  robots: { index: false, follow: false },
  // Sem estas duas entradas os arquivos existem em /public mas nada os
  // referencia — o navegador cai no /favicon.ico implícito e a instalação
  // como app não encontra ícone nenhum.
  manifest: "/site.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-96x96.png", sizes: "96x96", type: "image/png" },
      { url: "/favicon.ico" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  openGraph: {
    title: "Avila Ops - operação digital",
    description,
    url: siteUrl,
    siteName: "Avila Ops",
    locale: "pt_BR",
    type: "website",
    images: [
      { url: "/og-default.png", width: 1200, height: 630, alt: "Avila Ops" },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Avila Ops - operação digital",
    description,
    images: ["/og-default.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning data-theme="light" className={inter.variable} style={{ colorScheme: "light" }}>
      <head>
        {/*
          Modo noturno da casa: 18h escurece, 6h clareia. Precisa rodar antes do
          CSS, senão a tela pinta clara e escurece depois - o flash branco às
          22h é pior do que não ter tema escuro.
        */}
        <script dangerouslySetInnerHTML={{ __html: scriptInicial() }} />
      </head>
      <body>
        {children}
        {/* Retorno de ação (sincronizar, conciliar, importar) sai aqui, por
            cima, e some sozinho: dentro do layout ele desalinhava os botões. */}
        <Toaster />
      </body>
    </html>
  );
}

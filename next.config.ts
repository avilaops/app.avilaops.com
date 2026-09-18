import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  output: "standalone",
  // sharp é binário nativo (.node): empacotar quebra a geração de ícones da
  // marca no runtime standalone, que carrega o módulo do node_modules.
  serverExternalPackages: ["sharp"],
  turbopack: {
    root: process.cwd(),
  },
  async redirects() {
    return [
      {
        // Os sete canais saíram de Operação em 16/09/2026. O link do painel é
        // mandado a clientes por WhatsApp e vive em favoritos: os antigos
        // precisam continuar chegando, com query string e tudo.
        source: "/operacao/:canal(seo|dominios|google|meta|whatsapp|newsletter|estudio)/:path*",
        destination: "/hub-social/:canal/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;

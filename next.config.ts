import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  output: "standalone",
  // sharp é binário nativo (.node): empacotar quebra a geração de ícones da
  // marca no runtime standalone, que carrega o módulo do node_modules.
  serverExternalPackages: ["sharp"],
  // ...só que o rastreamento não leva tudo o que esse módulo precisa. Ele segue
  // `require`, e o addon do sharp abre a libvips por `process.dlopen` com um
  // caminho montado em tempo de execução — invisível para análise estática. O
  // bundle ficava com a pasta de `@img/sharp-libvips-linux-x64` e um `index.js`
  // de 28 bytes, sem o `libvips-cpp.so` de 18 MB, e a primeira tela que usa
  // sharp morria com ERR_DLOPEN_FAILED. Como a imagem de produção copia só o
  // `.next/standalone`, isso valia para produção e não apenas para o CI.
  //
  // `@img/**` é exatamente o conjunto de binários nativos do sharp: o npm só
  // instala os pacotes opcionais da plataforma em uso, então num builder Linux
  // isto são os pacotes Linux e nada mais.
  outputFileTracingIncludes: {
    "/**": ["./node_modules/@img/**"],
  },
  // Artefatos de auditoria, bancos descartáveis e testes não pertencem ao runtime.
  outputFileTracingExcludes: {
    "/**": ["./output/**/*", "./tests/**/*", "./.git/**/*", "./.playwright-cli/**/*", "./.deploy-*/**/*"],
  },
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
      {
        // A lista das financeiras virou a aba Credenciais de /empresa em
        // 01/10/2026. As fichas de cada uma continuam no mesmo endereço.
        source: "/empresa/credenciais/financeiro",
        destination: "/empresa/credenciais",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;

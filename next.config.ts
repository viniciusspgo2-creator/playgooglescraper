import type { NextConfig } from "next";

/**
 * Configuração de produção — Vercel + Neon.
 * - `output: "standalone"`: necessário para `bun run start` local (server enxuto).
 * - `outputFileTracingIncludes`: garante que a pasta `extension/` seja embutida
 *   no bundle serverless da rota de download do zip (ela é lida em runtime).
 * - Headers de segurança (HSTS, CSP, anti-clickjacking) + redirects 301 canônicos.
 */
const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: false,
  compress: true,
  poweredByHeader: false,

  // Imagens: tudo local (public/). Otimização AVIF→WebP pela pipeline do Next.
  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 2678400, // 31 dias
  },

  // A rota de download lê os arquivos da extensão em runtime (fs.readFile).
  // Sem esta linha, o Vercel não incluiria a pasta no bundle serverless.
  outputFileTracingIncludes: {
    "/api/extension/download": ["./extension/**"],
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          { key: "X-DNS-Prefetch-Control", value: "on" },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              // 'unsafe-inline': Next injeta scripts/styles inline (RSC, JSON-LD);
              // googletagmanager/google-analytics: GA4 + GTM (carregam só com env).
              "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://www.google-analytics.com",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https://www.google-analytics.com https://www.googletagmanager.com https://googleads.g.doubleclick.net",
              "font-src 'self' data:",
              "connect-src 'self' https://www.google-analytics.com https://analytics.google.com https://www.googletagmanager.com",
              "frame-src 'self' https://www.googletagmanager.com",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'none'",
            ].join("; "),
          },
        ],
      },
      // CORS da API da extensão (Bearer token, sem cookies → "*" é seguro)
      {
        source: "/api/v1/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET,POST,PUT,PATCH,DELETE,OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Authorization, Content-Type, Idempotency-Key" },
          { key: "Access-Control-Max-Age", value: "86400" },
        ],
      },
      // Arquivos estáticos imutáveis (build assets e imagens de conteúdo)
      {
        source: "/_next/static/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        source: "/images/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=2678400, stale-while-revalidate=86400" }],
      },
      // Recursos para LLMs nunca devem ser indexados, apenas lidos
      {
        source: "/llms.txt",
        headers: [{ key: "X-Robots-Tag", value: "noindex" }],
      },
      {
        source: "/llms-full.txt",
        headers: [{ key: "X-Robots-Tag", value: "noindex" }],
      },
    ];
  },

  async redirects() {
    return [
      // 301 canônicos — legados/typos apontando para a rota real
      { source: "/home", destination: "/", permanent: true },
      { source: "/index", destination: "/", permanent: true },
      { source: "/index.html", destination: "/", permanent: true },
      { source: "/index.php", destination: "/", permanent: true },
      // Âncoras da landing em URLs dedicadas (compartilhamento limpo)
      { source: "/recursos", destination: "/#recursos", permanent: true },
      { source: "/como-funciona", destination: "/#como-funciona", permanent: true },
      { source: "/precos", destination: "/#precos", permanent: true },
      { source: "/faq", destination: "/#faq", permanent: true },
      { source: "/planos", destination: "/#precos", permanent: true },
      { source: "/preco", destination: "/#precos", permanent: true },
      // Conteúdo (GEO/SEO) — aliases usados em materiais de divulgação
      { source: "/artigos", destination: "/blog", permanent: true },
      { source: "/glossary", destination: "/glossario", permanent: true },
      { source: "/equipe", destination: "/sobre", permanent: true },
      { source: "/quem-somos", destination: "/sobre", permanent: true },
    ];
  },
};

export default nextConfig;

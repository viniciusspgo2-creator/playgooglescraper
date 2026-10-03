import type { MetadataRoute } from "next";

import { getPostMetas } from "@/content/blog";
import { SITE } from "@/lib/site";

/**
 * sitemap.xml Enterprise — páginas públicas + artigos do blog + imagens
 * (sitemap de imagens embutido, pronto para Google Search Console).
 *
 * Seguro por construção: o conteúdo é estático em código (nenhuma consulta
 * a banco/IO), então o build não pode quebrar mesmo no primeiro deploy
 * com banco vazio.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = SITE.url;
  const now = new Date();

  const entries: MetadataRoute.Sitemap = [
    {
      url: base,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1,
      images: [`${base}${SITE.ogImage.url}`],
    },
    {
      url: `${base}/blog`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${base}/glossario`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${base}/sobre`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.6,
    },
  ];

  const postEntries: MetadataRoute.Sitemap = getPostMetas().map((post) => ({
    url: `${base}/blog/${post.slug}`,
    lastModified: new Date(post.modified),
    changeFrequency: "monthly",
    priority: 0.75,
    images: [`${base}${post.image}`],
  }));

  return [...entries, ...postEntries];
}

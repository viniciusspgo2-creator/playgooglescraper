import type { Metadata } from "next";

import { BLOG_POSTS } from "@/content/blog";
import { BlogIndexView } from "@/components/marketing/blog-index-view";
import { getServerMessages } from "@/i18n/server";
import { JsonLd, breadcrumbJsonLd, buildMetadata } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  try {
    const { messages, locale } = await getServerMessages();
    return buildMetadata({
      title: messages.content.blogTitle,
      description: messages.content.blogSubtitle,
      path: "/blog",
      keywords: [
        "blog google maps scraper",
        "guias prospecção",
        "extração de leads",
        "quadtree",
        "heat score",
      ],
      locale,
    });
  } catch {
    // Build à prova de falhas: metadata básica mesmo sem contexto de request.
    return buildMetadata({
      title: "Blog",
      description: "Guias de prospecção no Google Maps.",
      path: "/blog",
    });
  }
}

export default function BlogPage() {
  const breadcrumb = breadcrumbJsonLd([
    { name: "Início", path: "/" },
    { name: "Blog", path: "/blog" },
  ]);

  const blogJsonLd = {
    "@context": "https://schema.org",
    "@type": "Blog",
    "@id": "/blog",
    name: "Blog — Play Google Scraper",
    description:
      "Guias definitivos de prospecção no Google Maps: extração, quadtree, heat score, LGPD, anti-bot e WhatsApp.",
    inLanguage: "pt-BR",
    blogPost: BLOG_POSTS.map((post) => ({
      "@type": "BlogPosting",
      headline: post.title,
      url: `/blog/${post.slug}`,
      datePublished: post.published,
      dateModified: post.modified,
    })),
  };

  return (
    <>
      <JsonLd data={[breadcrumb, blogJsonLd]} />
      <BlogIndexView posts={BLOG_POSTS} />
    </>
  );
}

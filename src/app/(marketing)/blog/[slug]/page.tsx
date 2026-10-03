import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getPost, getPostSlugs, countPostWords } from "@/content/blog";
import { GLOSSARY_TERMS } from "@/content/glossario";
import { ArticleView } from "@/components/marketing/article-view";
import {
  JsonLd,
  articleJsonLd,
  breadcrumbJsonLd,
  buildMetadata,
  faqJsonLd,
} from "@/lib/seo";

type Params = Promise<{ slug: string }>;

/** Pré-renderização estática de todos os artigos (dados em código — build à prova de banco). */
export function generateStaticParams(): { slug: string }[] {
  try {
    return getPostSlugs().map((slug) => ({ slug }));
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  try {
    const { slug } = await params;
    const post = getPost(slug);
    if (!post) {
      return buildMetadata({
        title: "Artigo não encontrado",
        description: "Este artigo não existe.",
        path: "/blog",
        noindex: true,
      });
    }
    return buildMetadata({
      title: post.title,
      description: post.description,
      path: `/blog/${post.slug}`,
      keywords: post.keywords,
      image: { url: post.image, width: 1344, height: 768, alt: post.imageAlt },
      type: "article",
      publishedTime: post.published,
      modifiedTime: post.modified,
      locale: post.locale,
    });
  } catch {
    return buildMetadata({
      title: "Blog",
      description: "Guias de prospecção no Google Maps.",
      path: "/blog",
    });
  }
}

export default async function ArticlePage({ params }: { params: Params }) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();

  const breadcrumb = breadcrumbJsonLd([
    { name: "Início", path: "/" },
    { name: "Blog", path: "/blog" },
    { name: post.title, path: `/blog/${post.slug}` },
  ]);

  const article = articleJsonLd({
    slug: post.slug,
    title: post.title,
    description: post.description,
    image: post.image,
    imageAlt: post.imageAlt,
    published: post.published,
    modified: post.modified,
    locale: post.locale,
    keywords: post.keywords,
    wordCount: countPostWords(post),
    section: post.section,
    articleType: post.articleType,
    definedTerms: post.definedTerms,
  });

  const articleFaqs = post.sections.flatMap((section) => section.faq ?? []);

  const terms = post.definedTerms
    .map((id) => GLOSSARY_TERMS.find((term) => term.id === id))
    .filter((term): term is (typeof GLOSSARY_TERMS)[number] => Boolean(term))
    .map((term) => ({ id: term.id, name: term.name }));

  return (
    <>
      <JsonLd
        data={
          articleFaqs.length > 0
            ? [breadcrumb, article, faqJsonLd(articleFaqs, post.locale)]
            : [breadcrumb, article]
        }
      />
      <ArticleView post={post} terms={terms} />
    </>
  );
}

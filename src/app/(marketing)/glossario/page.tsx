import type { Metadata } from "next";

import { GLOSSARY_TERMS } from "@/content/glossario";
import { BLOG_POSTS } from "@/content/blog";
import { GlossaryView } from "@/components/marketing/glossary-view";
import { getServerMessages } from "@/i18n/server";
import { JsonLd, breadcrumbJsonLd, buildMetadata, definedTermSetJsonLd } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  try {
    const { messages, locale } = await getServerMessages();
    return buildMetadata({
      title: messages.content.glossaryTitle,
      description: messages.content.glossaryBluf,
      path: "/glossario",
      keywords: [
        "glossário google maps",
        "o que é heat score",
        "o que é place id",
        "quadtree o que é",
        "dicionário de prospecção",
      ],
      locale,
    });
  } catch {
    return buildMetadata({
      title: "Glossário",
      description: "Termos técnicos de prospecção no Google Maps.",
      path: "/glossario",
    });
  }
}

export default function GlossaryPage() {
  const breadcrumb = breadcrumbJsonLd([
    { name: "Início", path: "/" },
    { name: "Glossário", path: "/glossario" },
  ]);

  const termSet = definedTermSetJsonLd(
    GLOSSARY_TERMS.map((term) => ({
      id: term.id,
      name: term.name,
      description: term.definition,
    })),
  );

  return (
    <>
      <JsonLd data={[breadcrumb, termSet]} />
      <GlossaryView
        terms={GLOSSARY_TERMS}
        posts={BLOG_POSTS.map((post) => ({ slug: post.slug, title: post.title }))}
      />
    </>
  );
}

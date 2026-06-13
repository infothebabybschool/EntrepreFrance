import { notFound } from "next/navigation";
import { Metadata } from "next";
import { createServerClient } from "@/lib/supabase/server";
import ArticleGrid from "@/components/articles/ArticleGrid";
import { CATEGORY_SLUGS, SLUG_TO_CATEGORY, capitalizeCategory } from "@/lib/utils";
import { SITE_NAME } from "@/lib/brand";
import { Article } from "@/types";

export const revalidate = 60; // 1 minute

interface Props {
  params: { category: string };
}

export function generateStaticParams() {
  return CATEGORY_SLUGS.map((category) => ({ category }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const dbCategory = SLUG_TO_CATEGORY[params.category];
  if (!dbCategory) return {};
  const label = capitalizeCategory(dbCategory);
  return {
    title: label,
    description: `Toute l'actualité ${SITE_NAME} dans la catégorie ${label}.`,
  };
}

export default async function CategoryPage({ params }: Props) {
  const dbCategory = SLUG_TO_CATEGORY[params.category];
  if (!dbCategory) notFound();

  const supabase = createServerClient();

  const { data: articles, error } = await supabase
    .from("articles")
    .select("*")
    .eq("status", "published")
    .eq("category", dbCategory)
    .lte("published_at", new Date().toISOString())
    .is("deleted_at", null)
    .order("published_at", { ascending: false })
    .limit(30);

  if (error) {
    console.error("Failed to load category articles:", error.message);
  }

  const label = capitalizeCategory(dbCategory);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-8 pb-4 border-b-2 border-navy">
        <h1 className="font-serif text-3xl font-bold text-navy">{label}</h1>
      </div>
      <ArticleGrid articles={(articles as Article[]) ?? []} />
    </div>
  );
}

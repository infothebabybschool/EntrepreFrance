import { Metadata } from "next";
import { createServerClient } from "@/lib/supabase/server";
import SearchResults from "@/components/search/SearchResults";

export const metadata: Metadata = {
  title: "Rechercher",
  description: "Rechercher des articles sur BEpaper",
};

export const revalidate = 300; // 5 minutes

export default async function RecherchePage() {
  const supabase = createServerClient();

  const { data: raw } = await supabase
    .from("articles")
    .select("id, title, slug, chapo, category, published_at")
    .eq("status", "published")
    .lte("published_at", new Date().toISOString())
    .is("deleted_at", null)
    .order("published_at", { ascending: false })
    .limit(200);

  const articles = raw ?? [];

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <h1 className="font-serif text-3xl font-bold text-gray-900 mb-8">
        Rechercher
      </h1>
      <SearchResults articles={articles} />
    </div>
  );
}

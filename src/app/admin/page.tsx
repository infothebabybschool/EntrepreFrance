import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import ArticleTable from "@/components/admin/ArticleTable";
import { Article } from "@/types";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const supabase = createServerClient();

  const { data: articles, error } = await supabase
    .from("articles")
    .select("*")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to load articles:", error.message);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-serif text-2xl font-bold text-gray-900">Articles</h1>
        <Link
          href="/admin/articles/new"
          className="bg-accent hover:bg-accent-hover text-white text-sm font-medium
                     py-2 px-4 rounded transition-colors"
        >
          + Nouvel article
        </Link>
      </div>
      <ArticleTable articles={(articles as Article[]) ?? []} />
    </div>
  );
}

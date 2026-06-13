import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

interface Props {
  category: string;
  excludeSlug: string;
}

export default async function RelatedArticles({ category, excludeSlug }: Props) {
  const supabase = createServerClient();

  const { data: articles } = await supabase
    .from("articles")
    .select("id, title, slug, published_at")
    .eq("status", "published")
    .eq("category", category)
    .neq("slug", excludeSlug)
    .lte("published_at", new Date().toISOString())
    .is("deleted_at", null)
    .order("published_at", { ascending: false })
    .limit(3);

  if (!articles || articles.length === 0) return null;

  return (
    <section className="mt-10 pt-8 border-t border-gray-200">
      <h2 className="font-serif text-xl font-bold text-gray-900 mb-5 flex items-center gap-2">
        <span className="w-1 h-5 bg-accent inline-block" />
        À lire aussi
      </h2>
      <ul className="space-y-4">
        {articles.map((article) => (
          <li key={article.id} className="flex items-start gap-3">
            <span className="mt-1 w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
            <div>
              <Link
                href={`/article/${article.slug}`}
                className="font-serif font-semibold text-gray-900 hover:text-navy
                           transition-colors leading-snug"
              >
                {article.title}
              </Link>
              {article.published_at && (
                <p className="text-xs text-gray-400 font-sans mt-0.5">
                  {formatDate(article.published_at)}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

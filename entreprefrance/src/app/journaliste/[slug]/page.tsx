import { notFound } from "next/navigation";
import Image from "next/image";
import { Metadata } from "next";
import { createServerClient } from "@/lib/supabase/server";
import ArticleCard from "@/components/articles/ArticleCard";
import { capitalizeCategory } from "@/lib/utils";
import { Article } from "@/types";

export const dynamic = "force-dynamic";

interface Props { params: { slug: string } }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from("journalists")
    .select("name, bio")
    .eq("slug", params.slug)
    .single();

  if (!data) return {};
  return {
    title: data.name,
    description: data.bio ?? undefined,
  };
}

export default async function JournalistePage({ params }: Props) {
  const supabase = createServerClient();

  const { data: journalist, error } = await supabase
    .from("journalists")
    .select("*")
    .eq("slug", params.slug)
    .single();

  if (error || !journalist) notFound();

  const { data: articles } = await supabase
    .from("articles")
    .select("id, title, slug, chapo, category, featured_image_url, image_credit, published_at, tags, journalist_id, journalists(id, name, slug, photo_url)")
    .eq("journalist_id", journalist.id)
    .eq("status", "published")
    .lte("published_at", new Date().toISOString())
    .is("deleted_at", null)
    .order("published_at", { ascending: false })
    .limit(50);

  return (
    <main className="max-w-5xl mx-auto px-4 py-10">
      {/* Profile header */}
      <div className="flex items-start gap-6 mb-10 pb-8 border-b border-gray-200">
        {journalist.photo_url ? (
          <div className="relative w-24 h-24 flex-shrink-0 rounded-full overflow-hidden border-2 border-gray-200">
            <Image
              src={journalist.photo_url}
              alt={journalist.name}
              fill
              className="object-cover"
            />
          </div>
        ) : (
          <div className="w-24 h-24 flex-shrink-0 rounded-full bg-gray-100 flex items-center justify-center text-3xl font-bold text-gray-400">
            {journalist.name.charAt(0).toUpperCase()}
          </div>
        )}

        <div className="flex-1 min-w-0">
          <h1 className="font-serif text-2xl sm:text-3xl font-bold text-gray-900 mb-2">
            {journalist.name}
          </h1>

          {journalist.specializations?.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {journalist.specializations.map((s: string) => (
                <span
                  key={s}
                  className="text-xs font-semibold uppercase tracking-wide bg-accent text-white px-2 py-0.5 rounded"
                >
                  {capitalizeCategory(s)}
                </span>
              ))}
            </div>
          )}

          {journalist.style_tags?.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {journalist.style_tags.map((t: string) => (
                <span key={t} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                  {t}
                </span>
              ))}
            </div>
          )}

          {journalist.bio && (
            <p className="text-gray-600 text-sm leading-relaxed">{journalist.bio}</p>
          )}
        </div>
      </div>

      {/* Articles */}
      <h2 className="font-serif text-xl font-bold text-gray-900 mb-6">
        Articles publiés{articles?.length ? ` (${articles.length})` : ""}
      </h2>

      {!articles?.length ? (
        <p className="text-gray-500 text-sm">Aucun article publié pour l&apos;instant.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {articles.map((article) => (
            <ArticleCard
              key={article.id}
              article={{
                ...article,
                body: null,
                status: "published" as const,
                created_at: article.published_at ?? "",
                source_urls: null,
                deleted_at: null,
                journalist_id: article.journalist_id ?? null,
                journalist: Array.isArray(article.journalists) ? article.journalists[0] ?? null : (article.journalists as Article["journalist"]) ?? null,
              } as Article}
            />
          ))}
        </div>
      )}
    </main>
  );
}

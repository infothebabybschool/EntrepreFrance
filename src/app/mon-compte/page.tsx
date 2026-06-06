import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import Link from "next/link";
import Image from "next/image";
import { formatDate, capitalizeCategory, CATEGORY_TO_SLUG } from "@/lib/utils";
import ShareButton from "@/components/ui/ShareButton";
import type { Metadata } from "next";
import type { ReadingHistoryEntry } from "@/types";

export const metadata: Metadata = {
  title: "Mon compte",
};

export default async function AccountPage() {
  const { userId } = await auth();
  if (!userId) redirect("/");

  const supabase = createServerClient();

  const { data: history } = await supabase
    .from("user_reading_history")
    .select(`
      id,
      read_at,
      articles (
        id, title, slug, chapo, category, featured_image_url, published_at
      )
    `)
    .eq("clerk_id", userId)
    .order("read_at", { ascending: false })
    .limit(30);

  const entries = (history ?? []) as unknown as ReadingHistoryEntry[];

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="font-serif text-3xl font-bold text-gray-900 mb-8">
        Mon compte
      </h1>

      <section>
        <h2 className="text-xs font-sans font-semibold uppercase tracking-widest text-gray-500 mb-4">
          Historique de lecture
        </h2>

        {entries.length === 0 ? (
          <p className="text-gray-500 text-sm">
            Vous n&apos;avez pas encore lu d&apos;articles.{" "}
            <Link href="/" className="text-navy underline hover:text-accent">
              Découvrir les dernières nouvelles
            </Link>
          </p>
        ) : (
          <div className="space-y-4">
            {entries.map((entry) => {
              const article = entry.articles;
              if (!article) return null;
              return (
                <div key={entry.id} className="flex gap-4 bg-white border border-gray-100 p-4">
                  {article.featured_image_url && (
                    <Link href={`/article/${article.slug}`} className="shrink-0">
                      <div className="relative w-24 h-16">
                        <Image
                          src={article.featured_image_url}
                          alt=""
                          fill
                          className="object-cover"
                          sizes="96px"
                        />
                      </div>
                    </Link>
                  )}
                  <div className="flex-1 min-w-0">
                    <Link href={`/categorie/${CATEGORY_TO_SLUG[article.category] ?? article.category}`}>
                      <span className="text-xs font-semibold uppercase tracking-widest text-accent">
                        {capitalizeCategory(article.category)}
                      </span>
                    </Link>
                    <Link href={`/article/${article.slug}`}>
                      <h3 className="font-serif font-bold text-gray-900 leading-snug hover:text-navy transition-colors line-clamp-2">
                        {article.title}
                      </h3>
                    </Link>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs text-gray-400">
                        Lu le {formatDate(entry.read_at)}
                      </span>
                      <ShareButton url={`/article/${article.slug}`} title={article.title} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

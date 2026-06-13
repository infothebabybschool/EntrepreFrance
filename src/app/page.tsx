import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { Article } from "@/types";
import { capitalizeCategory, CATEGORY_TO_SLUG, CATEGORIES } from "@/lib/utils";
import HeroSection from "@/components/home/HeroSection";
import NewsletterBanner from "@/components/home/NewsletterBanner";
import FilterableArticles from "@/components/home/FilterableArticles";
import ArticleCard from "@/components/articles/ArticleCard";
import { SITE_NAME, TAGLINE } from "@/lib/brand";

export const revalidate = 60;

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-BE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Brussels",
  });
}

export default async function HomePage() {
  const supabase = createServerClient();

  // Fetch recent articles
  const { data: raw } = await supabase
    .from("articles")
    .select("*, journalists(id, name, slug, photo_url)")
    .eq("status", "published")
    .lte("published_at", new Date().toISOString())
    .is("deleted_at", null)
    .order("published_at", { ascending: false })
    .limit(20);

  const articles = (raw ?? []).map((a) => ({
    ...a,
    journalist_id: a.journalist_id ?? null,
    journalist: Array.isArray(a.journalists) ? (a.journalists[0] ?? null) : (a.journalists ?? null),
  })) as Article[];

  // Fetch most-read (last 30 days)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: reads } = await supabase
    .from("user_reading_history")
    .select("article_id")
    .gte("read_at", thirtyDaysAgo)
    .limit(1000);

  let mostRead: Article[] = [];
  if (reads && reads.length > 0) {
    const counts: Record<string, number> = {};
    for (const r of reads) {
      counts[r.article_id] = (counts[r.article_id] ?? 0) + 1;
    }
    const topIds = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([id]) => id);

    const { data: topArticles } = await supabase
      .from("articles")
      .select("id, title, slug, category, published_at, featured_image_url, chapo, journalist_id, journalists(id, name, slug, photo_url)")
      .in("id", topIds)
      .eq("status", "published")
      .is("deleted_at", null);

    if (topArticles) {
      mostRead = topArticles.map((a) => ({
        ...a,
        body: null, status: "published" as const, created_at: a.published_at ?? "",
        source_urls: null, tags: null, deleted_at: null, image_credit: null, job_title: null,
        journalist_id: a.journalist_id ?? null,
        journalist: Array.isArray(a.journalists) ? (a.journalists[0] ?? null) : (a.journalists ?? null),
      })) as Article[];
    }
  }

  const hero = articles[0];
  const secondary = articles.slice(1, 3);
  const gridArticles = articles.slice(3);

  const today = formatDate(new Date().toISOString());

  return (
    <div className="bg-gray-50">
      {/* Date strip */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-between">
          <p className="text-xs text-gray-500 font-sans capitalize">{today}</p>
          <div className="flex items-center gap-4 text-xs font-sans text-gray-500">
            <Link href="/newsletter" className="hover:text-navy transition-colors">Newsletter</Link>
            <span className="text-gray-300">|</span>
            <Link href="/contact" className="hover:text-navy transition-colors">Contact</Link>
          </div>
        </div>
      </div>

      {/* Hero section */}
      {hero ? (
        <HeroSection hero={hero} secondary={secondary} />
      ) : (
        <div className="bg-white">
          <div className="max-w-7xl mx-auto px-4 py-16 text-center text-gray-500">
            Aucun article pour le moment.
          </div>
        </div>
      )}

      {/* Newsletter banner */}
      <NewsletterBanner />

      {/* Main content + sidebar */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">

          {/* Article grid with category filter */}
          <div className="lg:col-span-3">
            <SectionHeader title="Dernières nouvelles" href={undefined} />
            <FilterableArticles articles={gridArticles} categories={CATEGORIES} />
          </div>

          {/* Sidebar */}
          <aside className="lg:col-span-1 space-y-8">

            {/* Most read */}
            {mostRead.length > 0 && (
              <div className="bg-white border border-gray-200 p-4">
                <SectionHeader title="Les plus consultés" small />
                <ol className="space-y-3 mt-3">
                  {mostRead.map((a, i) => (
                    <li key={a.id} className="flex gap-3">
                      <span className="font-serif text-3xl font-bold text-gray-100 leading-none w-7 shrink-0 select-none">
                        {i + 1}
                      </span>
                      <div>
                        <Link href={`/article/${a.slug}`}
                          className="text-sm font-serif font-semibold text-gray-900 hover:text-navy transition-colors leading-snug line-clamp-3">
                          {a.title}
                        </Link>
                        <span className="text-xs text-accent font-sans font-semibold uppercase tracking-wide">
                          {capitalizeCategory(a.category)}
                        </span>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {/* Category links */}
            <div className="bg-white border border-gray-200 p-4">
              <SectionHeader title="Rubriques" small />
              <ul className="mt-3 space-y-1">
                {CATEGORIES.map((cat) => (
                  <li key={cat}>
                    <Link
                      href={`/categorie/${CATEGORY_TO_SLUG[cat]}`}
                      className="flex items-center gap-2 text-sm text-gray-700 hover:text-navy
                                 hover:translate-x-1 transition-all py-0.5 font-sans"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
                      {capitalizeCategory(cat)}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* About widget */}
            <div className="bg-navy text-white p-4">
              <p className="font-serif text-lg font-bold mb-2">À propos de {SITE_NAME}</p>
              <p className="text-sm text-blue-200 leading-relaxed">
                {SITE_NAME} — {TAGLINE}
              </p>
              <Link href="/contact"
                className="inline-block mt-3 text-xs font-sans text-blue-300 hover:text-white
                           border border-blue-400 hover:border-white px-3 py-1.5 transition-colors rounded">
                Nous contacter
              </Link>
            </div>

          </aside>
        </div>
      </div>

      {/* Category highlights — one per category */}
      <div className="bg-white border-t border-gray-200 py-10">
        <div className="max-w-7xl mx-auto px-4 space-y-10">
          {CATEGORIES.map((cat) => {
            const catArticles = articles.filter((a) => a.category === cat).slice(0, 3);
            if (catArticles.length === 0) return null;
            return (
              <div key={cat}>
                <div className="flex items-baseline justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <span className="w-1 h-6 bg-accent inline-block" />
                    <h2 className="font-serif text-xl font-bold text-gray-900">
                      {capitalizeCategory(cat)}
                    </h2>
                  </div>
                  <Link
                    href={`/categorie/${CATEGORY_TO_SLUG[cat]}`}
                    className="text-xs text-navy hover:text-accent transition-colors font-sans font-medium"
                  >
                    Voir tout →
                  </Link>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                  {catArticles.map((a) => (
                    <ArticleCard key={a.id} article={a} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SectionHeader({ title, href, small }: { title: string; href?: string; small?: boolean }) {
  return (
    <div className="flex items-center gap-3 mb-4 border-b-2 border-navy pb-2">
      <h2 className={`font-serif font-bold text-navy ${small ? "text-base" : "text-xl"}`}>
        {title}
      </h2>
      {href && (
        <Link href={href} className="ml-auto text-xs text-gray-400 hover:text-navy font-sans">
          Voir tout →
        </Link>
      )}
    </div>
  );
}

import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Metadata } from "next";
import { createServerClient } from "@/lib/supabase/server";
import MarkdownRenderer from "@/components/articles/MarkdownRenderer";
import ReadingTracker from "@/components/articles/ReadingTracker";
import ShareButton from "@/components/ui/ShareButton";
import { formatDate, capitalizeCategory, CATEGORY_TO_SLUG } from "@/lib/utils";
import { SITE_NAME } from "@/lib/brand";
import { Article } from "@/types";
import { BYLINE_DEFAULTS, type BylineSettings } from "@/components/admin/BylineSettingsPanel";

export const revalidate = 3600; // 1 hour

interface Props {
  params: { slug: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from("articles")
    .select("title, chapo")
    .eq("slug", params.slug)
    .is("deleted_at", null)
    .single();

  if (!data) return {};

  return {
    title: data.title,
    description: data.chapo ?? undefined,
  };
}

export default async function ArticlePage({ params }: Props) {
  const supabase = createServerClient();

  const [{ data: article, error }, { data: settingsRow }] = await Promise.all([
    supabase
      .from("articles")
      .select("*, journalist:journalists(id, name, slug, photo_url)")
      .eq("slug", params.slug)
      .eq("status", "published")
      .lte("published_at", new Date().toISOString())
      .is("deleted_at", null)
      .single(),
    supabase
      .from("site_settings")
      .select("byline")
      .eq("id", 1)
      .single(),
  ]);

  if (error || !article) {
    notFound();
  }

  const a = article as Article;
  const byline: BylineSettings = { ...BYLINE_DEFAULTS, ...(settingsRow?.byline ?? {}) };

  const journalist = a.journalist;

  const bylineEl = byline.show ? (
    <div className="flex items-center gap-2 mb-4">
      {journalist ? (
        <>
          {byline.showPhoto && journalist.photo_url && (
            <div className="relative w-9 h-9 rounded-full overflow-hidden flex-shrink-0 border border-gray-200">
              <Image src={journalist.photo_url} alt={journalist.name} fill className="object-cover" />
            </div>
          )}
          {byline.clickable ? (
            <Link
              href={`/journaliste/${journalist.slug}`}
              className="text-sm font-medium text-gray-700 hover:text-navy transition-colors"
            >
              {journalist.name}
            </Link>
          ) : (
            <span className="text-sm font-medium text-gray-700">{journalist.name}</span>
          )}
        </>
      ) : (
        <span className="text-sm font-medium text-gray-500">Rédaction {SITE_NAME}</span>
      )}
    </div>
  ) : null;

  return (
    <article className="max-w-3xl mx-auto px-4 py-8">
      <ReadingTracker articleId={a.id} />

      {/* Category badge */}
      <div className="mb-4">
        <Link
          href={`/categorie/${CATEGORY_TO_SLUG[a.category] ?? a.category}`}
          className="inline-block text-xs font-sans font-semibold uppercase tracking-widest
                     text-white bg-accent px-2 py-0.5 hover:bg-accent-hover transition-colors"
        >
          {capitalizeCategory(a.category)}
        </Link>
      </div>

      {/* Byline — above title */}
      {byline.position === "above-title" && bylineEl}

      {/* Headline */}
      <h1 className="font-serif text-3xl sm:text-4xl font-bold text-gray-900 leading-tight mb-4">
        {a.title}
      </h1>

      {/* Byline — below title */}
      {byline.position === "below-title" && bylineEl}

      {/* Chapô */}
      {a.chapo && (
        <p className="font-serif text-lg font-semibold text-gray-700 leading-relaxed mb-6 border-l-4 border-accent pl-4">
          {a.chapo}
        </p>
      )}

      {/* Byline — below introduction paragraph (default) */}
      {byline.position === "below-chapo" && bylineEl}

      {/* Meta */}
      {a.published_at && (
        <div className="flex items-center gap-4 mb-6">
          <p className="text-sm text-gray-400 font-sans">
            Publié le {formatDate(a.published_at)}
          </p>
          <ShareButton url={`/article/${a.slug}`} title={a.title} />
        </div>
      )}

      {/* Byline — below date */}
      {byline.position === "below-date" && bylineEl}

      {/* Featured image */}
      {a.featured_image_url && (
        <figure className="mb-8 -mx-4 sm:mx-0">
          <div className="relative aspect-[16/9]">
            <Image
              src={a.featured_image_url}
              alt={a.title}
              fill
              priority
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 768px"
            />
          </div>
          {a.image_credit && (
            <figcaption className="text-xs text-gray-400 font-sans mt-1 px-4 sm:px-0">
              © {a.image_credit}
            </figcaption>
          )}
        </figure>
      )}

      {/* Body */}
      {a.body && (
        <div className="prose-custom text-base leading-relaxed">
          <MarkdownRenderer content={a.body} />
        </div>
      )}

      {/* Byline — end of article */}
      {byline.position === "end-of-article" && bylineEl}
    </article>
  );
}

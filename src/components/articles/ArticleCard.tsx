import Image from "next/image";
import Link from "next/link";
import { Article } from "@/types";
import { formatTimeAgo, capitalizeCategory, CATEGORY_TO_SLUG } from "@/lib/utils";

interface ArticleCardProps {
  article: Article;
}

export default function ArticleCard({ article }: ArticleCardProps) {
  return (
    <article className="group flex flex-col bg-white border border-gray-100 hover:shadow-md transition-shadow">
      {article.featured_image_url && (
        <Link href={`/article/${article.slug}`} className="block overflow-hidden aspect-[16/9] relative">
          <Image
            src={article.featured_image_url}
            alt={article.title}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-300"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          />
        </Link>
      )}
      <div className="flex flex-col flex-1 p-4">
        <div className="mb-2">
          <Link
            href={`/categorie/${CATEGORY_TO_SLUG[article.category] ?? article.category}`}
            className="inline-block text-xs font-sans font-semibold uppercase tracking-widest
                       text-white bg-accent px-2 py-0.5 hover:bg-accent-hover transition-colors"
          >
            {capitalizeCategory(article.category)}
          </Link>
        </div>
        <Link href={`/article/${article.slug}`}>
          <h2 className="font-serif text-lg font-bold text-gray-900 leading-snug
                         group-hover:text-navy transition-colors mb-2">
            {article.title}
          </h2>
        </Link>
        {article.chapo && (
          <p className="text-sm text-gray-600 leading-relaxed line-clamp-3 flex-1">
            {article.chapo}
          </p>
        )}
        <div className="mt-3 flex items-center justify-between gap-2">
          {article.published_at && (
            <p className="text-xs text-gray-400 font-sans">
              {formatTimeAgo(article.published_at)}
            </p>
          )}
          {article.journalist && (
            <p className="text-xs text-gray-500 font-sans truncate">
              {article.journalist.name}
            </p>
          )}
        </div>
      </div>
    </article>
  );
}

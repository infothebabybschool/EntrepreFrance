import Image from "next/image";
import Link from "next/link";
import { Article } from "@/types";
import { formatTimeAgo, capitalizeCategory } from "@/lib/utils";

interface HeroSectionProps {
  hero: Article;
  secondary: Article[];
}

export default function HeroSection({ hero, secondary }: HeroSectionProps) {
  return (
    <section className="bg-white border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-0 lg:gap-6">

          {/* Hero article — left 2/3 */}
          <Link href={`/article/${hero.slug}`} className="group lg:col-span-2 block">
            <div className="relative aspect-[16/9] overflow-hidden bg-gray-100">
              {hero.featured_image_url ? (
                <Image
                  src={hero.featured_image_url}
                  alt={hero.title}
                  fill
                  priority
                  className="object-cover group-hover:scale-105 transition-transform duration-500"
                  sizes="(max-width: 1024px) 100vw, 66vw"
                />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-navy to-navy-light" />
              )}
              {/* Gradient overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
              {/* Content overlay */}
              <div className="absolute bottom-0 left-0 right-0 p-5 sm:p-8">
                <div className="flex items-center gap-3 mb-3">
                  <span className="inline-block text-xs font-sans font-bold uppercase tracking-widest
                                   text-white bg-accent px-2 py-0.5">
                    {capitalizeCategory(hero.category)}
                  </span>
                  {hero.published_at && (
                    <span className="text-xs text-white/70 font-sans">
                      {formatTimeAgo(hero.published_at)}
                    </span>
                  )}
                </div>
                <h1 className="font-serif text-2xl sm:text-3xl lg:text-4xl font-bold text-white leading-tight
                               group-hover:underline decoration-1 underline-offset-4">
                  {hero.title}
                </h1>
                {hero.chapo && (
                  <p className="mt-2 text-sm text-white/80 leading-relaxed line-clamp-2 font-sans hidden sm:block">
                    {hero.chapo}
                  </p>
                )}
              </div>
            </div>
          </Link>

          {/* Secondary articles — right 1/3 */}
          <div className="flex flex-row lg:flex-col gap-4 lg:gap-0 mt-4 lg:mt-0">
            {secondary.map((article, i) => (
              <Link key={article.id} href={`/article/${article.slug}`}
                className={`group flex flex-col flex-1 lg:flex-initial ${i === 0 ? "lg:pb-4 lg:border-b lg:border-gray-200" : "lg:pt-4"}`}>
                {article.featured_image_url && (
                  <div className="relative aspect-[16/9] overflow-hidden bg-gray-100 mb-2 lg:mb-3">
                    <Image
                      src={article.featured_image_url}
                      alt={article.title}
                      fill
                      className="object-cover group-hover:scale-105 transition-transform duration-300"
                      sizes="(max-width: 1024px) 50vw, 25vw"
                    />
                  </div>
                )}
                <div>
                  <span className="inline-block text-[10px] font-sans font-bold uppercase tracking-widest
                                   text-white bg-accent px-1.5 py-0.5 mb-1.5">
                    {capitalizeCategory(article.category)}
                  </span>
                  <h2 className="font-serif text-base sm:text-lg font-bold text-gray-900 leading-snug
                                 group-hover:text-navy transition-colors line-clamp-3">
                    {article.title}
                  </h2>
                  {article.published_at && (
                    <p className="mt-1 text-xs text-gray-400 font-sans">
                      {formatTimeAgo(article.published_at)}
                    </p>
                  )}
                </div>
              </Link>
            ))}
          </div>

        </div>
      </div>
    </section>
  );
}

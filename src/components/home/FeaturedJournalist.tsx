import Image from "next/image";
import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";

export default async function FeaturedJournalist() {
  const supabase = createServerClient();

  const { data: journalist } = await supabase
    .from("journalists")
    .select("id, name, slug, bio, photo_url, job_title")
    .eq("active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  if (!journalist) return null;

  const bioExcerpt = journalist.bio
    ? journalist.bio.length > 120
      ? journalist.bio.slice(0, 120).trimEnd() + "…"
      : journalist.bio
    : null;

  return (
    <div className="bg-white border border-gray-200 p-4">
      <p className="text-xs font-sans font-semibold uppercase tracking-widest text-accent mb-3">
        À la une
      </p>
      <div className="flex items-start gap-3">
        {journalist.photo_url && (
          <div className="relative w-14 h-14 rounded-full overflow-hidden flex-shrink-0 border border-gray-200">
            <Image
              src={journalist.photo_url}
              alt={journalist.name}
              fill
              className="object-cover"
              sizes="56px"
            />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <Link
            href={`/journaliste/${journalist.slug}`}
            className="font-serif font-bold text-gray-900 hover:text-navy transition-colors leading-snug block"
          >
            {journalist.name}
          </Link>
          {journalist.job_title && (
            <p className="text-xs text-accent font-sans font-medium mt-0.5">
              {journalist.job_title}
            </p>
          )}
          {bioExcerpt && (
            <p className="text-xs text-gray-500 leading-relaxed mt-1.5">{bioExcerpt}</p>
          )}
          <Link
            href={`/journaliste/${journalist.slug}`}
            className="inline-block mt-2 text-xs font-sans text-navy hover:text-accent
                       transition-colors underline underline-offset-2"
          >
            Voir le profil →
          </Link>
        </div>
      </div>
    </div>
  );
}

import Link from "next/link";
import { CATEGORIES, CATEGORY_TO_SLUG, capitalizeCategory } from "@/lib/utils";
import { SITE_NAME, TAGLINE } from "@/lib/brand";
import { NEWSLETTER_ENABLED } from "@/lib/site-config";

const LIENS = [
  { label: "À propos", href: "/contact" },
  { label: "Contact", href: "/contact" },
  { label: "Newsletter", href: "/newsletter" },
  { label: "Notre équipe", href: "/equipe" },
];

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="bg-[#0f1f3d] text-blue-200 mt-16">
      <div className="max-w-7xl mx-auto px-4 pt-12 pb-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">

          <div className="lg:col-span-1">
            <Link href="/" className="font-serif text-2xl font-bold text-white tracking-tight">
              {SITE_NAME}
            </Link>
            <p className="text-sm mt-3 leading-relaxed text-blue-300">
              L&apos;actualité économique, entrepreneuriale et financière pour les professionnels français.
            </p>
            <p className="text-xs text-blue-400 mt-4">
              Indépendant · Sans publicité · Gratuit
            </p>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-widest text-white mb-4">
              Rubriques
            </h3>
            <ul className="space-y-2">
              {CATEGORIES.map((cat) => (
                <li key={cat}>
                  <Link
                    href={`/categorie/${CATEGORY_TO_SLUG[cat]}`}
                    className="text-sm text-blue-300 hover:text-white transition-colors"
                  >
                    {capitalizeCategory(cat)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-widest text-white mb-4">
              {SITE_NAME}
            </h3>
            <ul className="space-y-2">
              {LIENS.map((l) => (
                <li key={l.label}>
                  <Link
                    href={l.href}
                    className="text-sm text-blue-300 hover:text-white transition-colors"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {NEWSLETTER_ENABLED && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-widest text-white mb-4">
                Newsletter
              </h3>
              <p className="text-sm text-blue-300 leading-relaxed mb-4">
                Recevez l&apos;essentiel de nos actualités chaque matin.
              </p>
              <Link
                href="/newsletter"
                className="inline-block bg-accent hover:bg-accent-hover text-white text-sm
                           font-medium px-5 py-2.5 rounded transition-colors"
              >
                S&apos;abonner gratuitement
              </Link>
            </div>
          )}

        </div>
      </div>

      <div className="border-t border-blue-900">
        <div className="max-w-7xl mx-auto px-4 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-blue-400">
          <p>© {year} {SITE_NAME}. Tous droits réservés.</p>
          <p>Contenu généré par intelligence artificielle à des fins éducatives.</p>
        </div>
      </div>
    </footer>
  );
}

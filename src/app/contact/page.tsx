import { Metadata } from "next";
import ContactForm from "./ContactForm";
import { SITE_NAME, SITE_DOMAIN } from "@/lib/brand";

export const metadata: Metadata = {
  title: "Contact",
  description: `Contactez la rédaction de ${SITE_NAME} — suggestions, corrections, partenariats.`,
};

export default function ContactPage() {
  return (
    <div className="bg-gray-50 min-h-screen">
      {/* Header strip */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="flex items-center gap-3 mb-1">
            <span className="w-1 h-6 bg-accent inline-block" />
            <h1 className="font-serif text-3xl font-bold text-navy">Contact</h1>
          </div>
          <p className="text-gray-500 text-sm font-sans ml-4 pl-3">
            Suggestion éditoriale, correction factuelle, partenariat ou presse — nous lisons chaque message avec attention.
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">

          {/* Form */}
          <div className="lg:col-span-2 bg-white border border-gray-200 p-6 sm:p-8">
            <h2 className="font-serif text-xl font-bold text-gray-900 mb-6">
              Envoyer un message
            </h2>
            <ContactForm />
          </div>

          {/* Info sidebar */}
          <div className="space-y-6">
            <div className="bg-white border border-gray-200 p-6">
              <h3 className="font-serif text-lg font-bold text-gray-900 mb-4">
                La rédaction
              </h3>
              <div className="space-y-3 text-sm text-gray-600 font-sans">
                <div>
                  <p className="font-semibold text-gray-900 text-xs uppercase tracking-wide mb-1">Email</p>
                  <a href={`mailto:redaction@${SITE_DOMAIN}`}
                    className="text-navy hover:text-accent transition-colors">
                    redaction@{SITE_DOMAIN}
                  </a>
                </div>
                <div>
                  <p className="font-semibold text-gray-900 text-xs uppercase tracking-wide mb-1">
                    Délai de réponse
                  </p>
                  <p>Généralement sous 48 heures ouvrables.</p>
                </div>
              </div>
            </div>

            <div className="bg-navy text-white p-6">
              <h3 className="font-serif text-lg font-bold mb-3">Newsletter</h3>
              <p className="text-sm text-blue-200 leading-relaxed mb-4">
                Restez informé(e) avec {SITE_NAME}. Gratuit, sans publicité.
              </p>
              <a href="/newsletter"
                className="inline-block bg-accent hover:bg-accent-hover text-white text-sm
                           font-medium px-4 py-2 rounded transition-colors">
                S&apos;abonner
              </a>
            </div>

            <div className="bg-white border border-gray-200 p-6">
              <h3 className="font-serif text-lg font-bold text-gray-900 mb-3">
                Signaler une erreur
              </h3>
              <p className="text-sm text-gray-600 leading-relaxed">
                Vous avez repéré une inexactitude dans un article ?
                Indiquez l&apos;URL de l&apos;article et la correction dans votre message.
              </p>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

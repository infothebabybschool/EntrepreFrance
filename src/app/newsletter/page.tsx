import { Metadata } from "next";
import SubscribeForm from "@/components/newsletter/SubscribeForm";
import { SITE_NAME } from "@/lib/brand";

export const metadata: Metadata = {
  title: "Newsletter",
  description: `Inscrivez-vous à la newsletter ${SITE_NAME} et recevez nos dernières actualités directement dans votre boîte mail.`,
};

export default function NewsletterPage() {
  return (
    <div className="max-w-lg mx-auto px-4 py-16">
      <div className="text-center mb-10">
        <h1 className="font-serif text-3xl font-bold text-navy mb-3">
          La newsletter {SITE_NAME}
        </h1>
        <p className="text-gray-600 leading-relaxed">
          Chaque matin, recevez l&apos;essentiel de l&apos;actualité économique et entrepreneuriale française —
          startups, marchés financiers, innovations et leadership. Gratuit, sans publicité, désabonnement en un clic.
        </p>
      </div>
      <div className="bg-white border border-gray-200 rounded-lg p-8 shadow-sm">
        <SubscribeForm />
      </div>
    </div>
  );
}

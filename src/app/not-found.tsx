import Link from "next/link";

export default function NotFound() {
  return (
    <div className="max-w-lg mx-auto px-4 py-24 text-center">
      <h1 className="font-serif text-6xl font-bold text-navy mb-4">404</h1>
      <p className="text-gray-600 mb-8">Cette page n&apos;existe pas ou a été déplacée.</p>
      <Link
        href="/"
        className="bg-accent hover:bg-accent-hover text-white font-medium py-2 px-6 rounded transition-colors"
      >
        Retour à l&apos;accueil
      </Link>
    </div>
  );
}

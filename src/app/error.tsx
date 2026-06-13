"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="max-w-lg mx-auto px-4 py-24 text-center">
      <h1 className="font-serif text-3xl font-bold text-navy mb-4">
        Une erreur est survenue
      </h1>
      <p className="text-gray-600 mb-8">
        Quelque chose s&apos;est mal passé. Veuillez réessayer.
      </p>
      <button
        onClick={reset}
        className="bg-accent hover:bg-accent-hover text-white font-medium py-2 px-6 rounded transition-colors"
      >
        Réessayer
      </button>
    </div>
  );
}

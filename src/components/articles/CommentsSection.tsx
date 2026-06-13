"use client";

export default function CommentsSection() {
  return (
    <section className="mt-10 pt-8 border-t border-gray-200">
      <h2 className="font-serif text-xl font-bold text-gray-900 mb-5 flex items-center gap-2">
        <span className="w-1 h-5 bg-accent inline-block" />
        Commentaires
      </h2>
      <p className="text-sm text-gray-500 font-sans mb-5">
        La section commentaires arrive bientôt.
      </p>
      <div className="space-y-3">
        <textarea
          disabled
          placeholder="Votre commentaire…"
          rows={4}
          className="w-full border border-gray-200 rounded px-3 py-2 text-sm font-sans
                     text-gray-400 bg-gray-50 resize-none cursor-not-allowed
                     placeholder:text-gray-300"
        />
        <button
          disabled
          className="px-5 py-2 text-sm font-sans font-medium bg-gray-200 text-gray-400
                     rounded cursor-not-allowed"
        >
          Publier un commentaire
        </button>
      </div>
    </section>
  );
}

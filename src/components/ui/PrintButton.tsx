"use client";

export default function PrintButton() {
  return (
    <>
      <style>{`@media print { .print-button-hide { display: none !important; } }`}</style>
      <button
        onClick={() => window.print()}
        aria-label="Imprimer l'article"
        className="print-button-hide inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-sans
                   text-gray-600 border border-gray-300 rounded hover:border-gray-500
                   hover:text-gray-800 transition-colors"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="6 9 6 2 18 2 18 9" />
          <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
          <rect x="6" y="14" width="12" height="8" />
        </svg>
        Imprimer
      </button>
    </>
  );
}

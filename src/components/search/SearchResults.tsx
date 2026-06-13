"use client";

import { useState } from "react";
import Link from "next/link";
import { capitalizeCategory, formatTimeAgo, CATEGORY_TO_SLUG } from "@/lib/utils";

interface SearchArticle {
  id: string;
  title: string;
  slug: string;
  chapo: string | null;
  category: string;
  published_at: string | null;
}

interface Props {
  articles: SearchArticle[];
}

export default function SearchResults({ articles }: Props) {
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();

  const filtered = q
    ? articles.filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          (a.chapo ?? "").toLowerCase().includes(q)
      )
    : articles;

  return (
    <div>
      {/* Search input */}
      <div className="relative mb-8">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher un article…"
          autoFocus
          className="w-full border border-gray-300 rounded px-4 py-3 pr-10
                     text-base font-sans text-gray-900 placeholder:text-gray-400
                     focus:outline-none focus:border-navy transition-colors"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </span>
      </div>

      {/* Results count */}
      {q && (
        <p className="text-sm text-gray-400 font-sans mb-5">
          {filtered.length === 0
            ? "Aucun résultat"
            : `${filtered.length} résultat${filtered.length > 1 ? "s" : ""} pour « ${q} »`}
        </p>
      )}

      {/* Results list */}
      {filtered.length > 0 ? (
        <ul className="space-y-6">
          {filtered.map((article) => (
            <li
              key={article.id}
              className="border-b border-gray-100 pb-6 last:border-0"
            >
              <div className="flex items-center gap-2 mb-1">
                <Link
                  href={`/categorie/${CATEGORY_TO_SLUG[article.category] ?? article.category}`}
                  className="text-xs font-sans font-semibold uppercase tracking-widest
                             text-white bg-accent px-2 py-0.5 hover:bg-accent-hover transition-colors"
                >
                  {capitalizeCategory(article.category)}
                </Link>
                {article.published_at && (
                  <span className="text-xs text-gray-400 font-sans">
                    {formatTimeAgo(article.published_at)}
                  </span>
                )}
              </div>
              <Link
                href={`/article/${article.slug}`}
                className="font-serif text-lg font-bold text-gray-900 hover:text-navy
                           transition-colors leading-snug"
              >
                {article.title}
              </Link>
              {article.chapo && (
                <p className="text-sm text-gray-600 leading-relaxed mt-1 line-clamp-2">
                  {article.chapo}
                </p>
              )}
            </li>
          ))}
        </ul>
      ) : (
        !q && (
          <p className="text-gray-400 text-sm font-sans text-center py-12">
            Entrez un terme pour rechercher dans les articles.
          </p>
        )
      )}
    </div>
  );
}

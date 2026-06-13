"use client";

import { useState } from "react";
import { Article } from "@/types";
import ArticleCard from "@/components/articles/ArticleCard";
import { capitalizeCategory } from "@/lib/utils";
import { CATEGORY_FILTER_ENABLED } from "@/lib/site-config";

const ALL = "Tout";

interface Props {
  articles: Article[];
  categories: readonly string[];
}

export default function FilterableArticles({ articles, categories }: Props) {
  const [active, setActive] = useState(ALL);

  const filtered = active === ALL
    ? articles
    : articles.filter((a) => a.category === active);

  return (
    <div>
      {/* Category filter tabs — only rendered when feature is enabled */}
      {CATEGORY_FILTER_ENABLED && (
        <div className="flex flex-wrap gap-2 mb-6">
          {[ALL, ...categories].map((cat) => (
            <button
              key={cat}
              onClick={() => setActive(cat)}
              className={`px-4 py-1.5 text-sm font-medium font-sans rounded-full border transition-colors ${
                active === cat
                  ? "bg-navy text-white border-navy"
                  : "bg-white text-gray-600 border-gray-300 hover:border-navy hover:text-navy"
              }`}
            >
              {cat === ALL ? "Tout" : capitalizeCategory(cat)}
            </button>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="text-gray-400 text-sm py-8 text-center">Aucun article dans cette rubrique.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
          {filtered.map((article) => (
            <ArticleCard key={article.id} article={article} />
          ))}
        </div>
      )}
    </div>
  );
}

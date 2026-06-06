"use client";

import { useState } from "react";
import Link from "next/link";
import { Article } from "@/types";
import { formatDate, capitalizeCategory } from "@/lib/utils";
import { useRouter } from "next/navigation";

interface ArticleTableProps {
  articles: Article[];
}

export default function ArticleTable({ articles }: ArticleTableProps) {
  const router = useRouter();
  const [deleting, setDeleting] = useState<string | null>(null);

  async function handleDelete(id: string) {
    if (!confirm("Supprimer cet article ? Cette action peut être annulée en le restaurant via la base de données.")) return;

    setDeleting(id);
    const res = await fetch(`/api/admin/articles/${id}`, { method: "DELETE" });
    setDeleting(null);

    if (res.ok) {
      router.refresh();
    } else {
      alert("Erreur lors de la suppression.");
    }
  }

  if (articles.length === 0) {
    return (
      <p className="text-center text-gray-500 py-12 font-sans">
        Aucun article. <Link href="/admin/articles/new" className="text-navy underline">Créer le premier</Link>.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
      <table className="min-w-full text-sm font-sans">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="text-left px-4 py-3 font-semibold text-gray-600">Titre</th>
            <th className="text-left px-4 py-3 font-semibold text-gray-600">Catégorie</th>
            <th className="text-left px-4 py-3 font-semibold text-gray-600">Statut</th>
            <th className="text-left px-4 py-3 font-semibold text-gray-600">Publication</th>
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {articles.map((article) => (
            <tr key={article.id} className="hover:bg-gray-50 transition-colors">
              <td className="px-4 py-3 max-w-xs">
                <span className="font-medium text-gray-900 line-clamp-2 font-serif">
                  {article.title}
                </span>
                <span className="block text-xs text-gray-400 mt-0.5">{article.slug}</span>
              </td>
              <td className="px-4 py-3">
                <span className="text-xs font-medium bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                  {capitalizeCategory(article.category)}
                </span>
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={article.status} publishedAt={article.published_at} />
              </td>
              <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                {article.published_at ? formatDate(article.published_at) : "—"}
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-3 justify-end">
                  <Link
                    href={`/admin/articles/${article.id}/edit`}
                    className="text-navy hover:underline text-xs font-medium"
                  >
                    Modifier
                  </Link>
                  <button
                    onClick={() => handleDelete(article.id)}
                    disabled={deleting === article.id}
                    className="text-red-500 hover:text-red-700 text-xs font-medium disabled:opacity-40"
                  >
                    {deleting === article.id ? "…" : "Supprimer"}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusBadge({
  status,
  publishedAt,
}: {
  status: string;
  publishedAt: string | null;
}) {
  const now = new Date();
  const isScheduled =
    status === "published" && publishedAt && new Date(publishedAt) > now;

  if (isScheduled) {
    return (
      <span className="text-xs font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded">
        Programmé
      </span>
    );
  }
  if (status === "published") {
    return (
      <span className="text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded">
        Publié
      </span>
    );
  }
  return (
    <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
      Brouillon
    </span>
  );
}

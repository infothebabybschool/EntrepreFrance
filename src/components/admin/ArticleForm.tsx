"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Article } from "@/types";
import { CATEGORIES, capitalizeCategory } from "@/lib/utils";

interface ArticleFormProps {
  article?: Article; // undefined = new article
}

type FormData = {
  title: string;
  chapo: string;
  body: string;
  category: string;
  featured_image_url: string;
  image_credit: string;
  status: "draft" | "published";
  published_at: string;
  source_urls: string; // newline-separated in the form
  tags: string;        // comma-separated in the form
  journalist_id: string;
};

export default function ArticleForm({ article }: ArticleFormProps) {
  const router = useRouter();
  const isEdit = !!article;

  const [form, setForm] = useState<FormData>({
    title: article?.title ?? "",
    chapo: article?.chapo ?? "",
    body: article?.body ?? "",
    category: article?.category ?? CATEGORIES[0],
    featured_image_url: article?.featured_image_url ?? "",
    image_credit: article?.image_credit ?? "",
    status: article?.status ?? "draft",
    published_at: article?.published_at
      ? new Date(article.published_at).toISOString().slice(0, 16)
      : "",
    source_urls: article?.source_urls?.join("\n") ?? "",
    tags: article?.tags?.join(", ") ?? "",
    journalist_id: article?.journalist_id ?? "",
  });

  const [journalists, setJournalists] = useState<{ id: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin/journalists")
      .then((r) => r.json())
      .then((d) => setJournalists(d.journalists ?? []));
  }, []);

  function set(field: keyof FormData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    const payload = {
      title: form.title.trim(),
      chapo: form.chapo.trim() || null,
      body: form.body.trim() || null,
      category: form.category,
      featured_image_url: form.featured_image_url.trim() || null,
      image_credit: form.image_credit.trim() || null,
      status: form.status,
      published_at: form.published_at ? new Date(form.published_at).toISOString() : null,
      source_urls: form.source_urls
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
      tags: form.tags
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      journalist_id: form.journalist_id || null,
    };

    const url = isEdit ? `/api/admin/articles/${article.id}` : "/api/admin/articles";
    const method = isEdit ? "PATCH" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    setSaving(false);

    if (!res.ok) {
      setError(data.error ?? "Une erreur est survenue.");
    } else {
      router.push("/admin");
      router.refresh();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-3xl">
      <Field label="Titre *">
        <input
          type="text"
          value={form.title}
          onChange={(e) => set("title", e.target.value)}
          required
          className={inputClass}
          placeholder="Le titre de l'article"
        />
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <Field label="Catégorie *">
          <select
            value={form.category}
            onChange={(e) => set("category", e.target.value)}
            className={inputClass}
          >
            {CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {capitalizeCategory(cat)}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Journaliste">
          <select
            value={form.journalist_id}
            onChange={(e) => set("journalist_id", e.target.value)}
            className={inputClass}
          >
            <option value="">— Aucun —</option>
            {journalists.map((j) => (
              <option key={j.id} value={j.id}>
                {j.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Chapô" hint="Paragraphe d'introduction, affiché en gras">
        <textarea
          value={form.chapo}
          onChange={(e) => set("chapo", e.target.value)}
          rows={3}
          className={inputClass}
          placeholder="Résumé accrocheur de l'article…"
        />
      </Field>

      <Field label="Corps de l'article (Markdown)">
        <textarea
          value={form.body}
          onChange={(e) => set("body", e.target.value)}
          rows={18}
          className={`${inputClass} font-mono text-sm`}
          placeholder="## Introduction&#10;&#10;Le corps de l'article en Markdown…"
        />
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <Field label="URL de l'image principale">
          <input
            type="url"
            value={form.featured_image_url}
            onChange={(e) => set("featured_image_url", e.target.value)}
            className={inputClass}
            placeholder="https://…supabase.co/storage/…"
          />
        </Field>

        <Field label="Crédit photo">
          <input
            type="text"
            value={form.image_credit}
            onChange={(e) => set("image_credit", e.target.value)}
            className={inputClass}
            placeholder="© Photographe / Pexels"
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <Field label="Statut">
          <select
            value={form.status}
            onChange={(e) => set("status", e.target.value as "draft" | "published")}
            className={inputClass}
          >
            <option value="draft">Brouillon</option>
            <option value="published">Publié</option>
          </select>
        </Field>

        <Field label="Date de publication" hint="Laissez vide pour publier immédiatement">
          <input
            type="datetime-local"
            value={form.published_at}
            onChange={(e) => set("published_at", e.target.value)}
            className={inputClass}
          />
        </Field>
      </div>

      <Field label="URLs sources" hint="Une URL par ligne">
        <textarea
          value={form.source_urls}
          onChange={(e) => set("source_urls", e.target.value)}
          rows={3}
          className={`${inputClass} font-mono text-sm`}
          placeholder="https://rtbf.be/article/…&#10;https://lesoir.be/…"
        />
      </Field>

      <Field label="Tags SEO" hint="Séparés par des virgules">
        <input
          type="text"
          value={form.tags}
          onChange={(e) => set("tags", e.target.value)}
          className={inputClass}
          placeholder="belgique, politique, gouvernement"
        />
      </Field>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-4 py-3">
          {error}
        </p>
      )}

      <div className="flex items-center gap-4 pt-2">
        <button
          type="submit"
          disabled={saving}
          className="bg-navy hover:bg-navy-light text-white font-medium py-2 px-6
                     rounded transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {saving ? "Enregistrement…" : isEdit ? "Enregistrer les modifications" : "Créer l'article"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/admin")}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          Annuler
        </button>
      </div>
    </form>
  );
}

const inputClass =
  "w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-transparent";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
        {hint && <span className="text-gray-400 font-normal ml-1">— {hint}</span>}
      </label>
      {children}
    </div>
  );
}

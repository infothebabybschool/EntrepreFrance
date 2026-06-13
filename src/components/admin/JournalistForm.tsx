"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Journalist } from "@/types";
import { CATEGORIES, capitalizeCategory } from "@/lib/utils";
import { STRUCTURES } from "@/lib/article-structures";

const STYLE_TAGS = [
  "analytique", "terrain", "opinion", "data", "enquête",
  "portrait", "investigation", "correspondant", "marchés",
  "justice", "droits", "parlement", "institutionnel", "lifestyle",
  "critique", "vétéran",
];

interface JournalistFormProps {
  journalist?: Journalist;
}

export default function JournalistForm({ journalist }: JournalistFormProps) {
  const router = useRouter();
  const isEdit = !!journalist;
  const fileRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    name: journalist?.name ?? "",
    slug: journalist?.slug ?? "",
    bio: journalist?.bio ?? "",
    job_title: journalist?.job_title ?? "Journaliste",
    countries: journalist?.countries?.join(", ") ?? "",
    specializations: journalist?.specializations ?? [] as string[],
    style_tags: journalist?.style_tags ?? [] as string[],
    article_structure: journalist?.article_structure ?? null as string | null,
    active: journalist?.active ?? true,
  });
  const [photoUrl, setPhotoUrl] = useState<string | null>(journalist?.photo_url ?? null);
  const [photoOpts, setPhotoOpts] = useState({
    gender: "femme",
    age: "35-45",
    ethnicity: "europeenne",
    style: "corporate",
    background: "studio",
  });
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  function slugify(name: string) {
    return name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function setName(name: string) {
    setForm((prev) => ({
      ...prev,
      name,
      slug: isEdit ? prev.slug : slugify(name),
    }));
  }

  function toggleSpec(cat: string) {
    setForm((prev) => ({
      ...prev,
      specializations: prev.specializations.includes(cat)
        ? prev.specializations.filter((c) => c !== cat)
        : [...prev.specializations, cat],
    }));
  }

  function toggleTag(tag: string) {
    setForm((prev) => ({
      ...prev,
      style_tags: prev.style_tags.includes(tag)
        ? prev.style_tags.filter((t) => t !== tag)
        : [...prev.style_tags, tag],
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    // Strip cache-busting query param before saving
    const cleanPhotoUrl = photoUrl ? photoUrl.split("?")[0] : null;

    const payload = {
      name: form.name.trim(),
      slug: form.slug.trim(),
      bio: form.bio.trim() || null,
      job_title: form.job_title || "Journaliste",
      countries: form.countries.split(",").map((s) => s.trim()).filter(Boolean),
      specializations: form.specializations,
      style_tags: form.style_tags,
      article_structure: form.article_structure || null,
      active: form.active,
      photo_url: cleanPhotoUrl,
    };

    const url = isEdit ? `/api/admin/journalists/${journalist.id}` : "/api/admin/journalists";
    const method = isEdit ? "PATCH" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const json = await res.json();
    setSaving(false);

    if (!res.ok) {
      setError(json.error ?? "Une erreur est survenue");
      return;
    }

    // Hard navigation bypasses Next.js router cache, ensuring fresh data is shown
    window.location.href = "/admin/equipe";
  }

  async function generatePhoto() {
    if (!isEdit) return;
    setGenerating(true);
    setError("");

    const res = await fetch(`/api/admin/journalists/${journalist.id}/generate-photo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(photoOpts),
    });
    const json = await res.json();
    setGenerating(false);

    if (!res.ok) {
      setError(json.error ?? "Échec de la génération");
      return;
    }
    setPhotoUrl(json.photo_url + "?t=" + Date.now());
  }

  async function uploadPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    if (!isEdit || !e.target.files?.[0]) return;
    const file = e.target.files[0];
    setUploading(true);
    setError("");

    const fd = new FormData();
    fd.append("photo", file);

    const res = await fetch(`/api/admin/journalists/${journalist.id}/upload-photo`, {
      method: "POST",
      body: fd,
    });
    const json = await res.json();
    setUploading(false);

    if (!res.ok) {
      setError(json.error ?? "Échec de l'upload");
      return;
    }
    setPhotoUrl(json.photo_url + "?t=" + Date.now());
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      {/* Photo section — only available when editing */}
      {isEdit && (
        <div className="p-4 bg-gray-50 border border-gray-200 rounded space-y-4">
          <p className="text-sm font-medium text-gray-700">Photo de profil</p>

          <div className="flex items-start gap-4">
            {/* Preview */}
            <div className="flex-shrink-0">
              {photoUrl ? (
                <div className="relative w-20 h-20 rounded-full overflow-hidden border-2 border-gray-200">
                  <Image src={photoUrl} alt={form.name} fill className="object-cover" />
                </div>
              ) : (
                <div className="w-20 h-20 rounded-full bg-gray-200 flex items-center justify-center text-gray-400 text-2xl font-bold">
                  {form.name.charAt(0).toUpperCase() || "?"}
                </div>
              )}
            </div>

            {/* Upload button */}
            <div className="pt-1">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="text-sm bg-white text-gray-700 border border-gray-300 px-3 py-1.5 rounded hover:bg-gray-50 transition-colors disabled:opacity-60"
              >
                {uploading ? "Upload…" : "Uploader une photo"}
              </button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={uploadPhoto} />
            </div>
          </div>

          {/* AI generation options */}
          <div className="border-t border-gray-200 pt-4 space-y-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Générer avec DALL-E 3</p>

            <div className="grid grid-cols-2 gap-3">
              <PhotoOptField label="Genre">
                <ToggleGroup
                  value={photoOpts.gender}
                  onChange={(v) => setPhotoOpts((p) => ({ ...p, gender: v }))}
                  options={[
                    { label: "Femme", value: "femme" },
                    { label: "Homme", value: "homme" },
                    { label: "Non-binaire", value: "non-binaire" },
                  ]}
                />
              </PhotoOptField>

              <PhotoOptField label="Tranche d'âge">
                <ToggleGroup
                  value={photoOpts.age}
                  onChange={(v) => setPhotoOpts((p) => ({ ...p, age: v }))}
                  options={[
                    { label: "25–35", value: "25-35" },
                    { label: "35–45", value: "35-45" },
                    { label: "45–55", value: "45-55" },
                    { label: "55+", value: "55+" },
                  ]}
                />
              </PhotoOptField>

              <PhotoOptField label="Apparence">
                <ToggleGroup
                  value={photoOpts.ethnicity}
                  onChange={(v) => setPhotoOpts((p) => ({ ...p, ethnicity: v }))}
                  options={[
                    { label: "Européenne", value: "europeenne" },
                    { label: "Africaine", value: "africaine" },
                    { label: "Asiatique", value: "asiatique" },
                    { label: "Moyen-orient.", value: "moyen-orientale" },
                    { label: "Latino/a", value: "latina" },
                    { label: "Mixte", value: "mixte" },
                  ]}
                />
              </PhotoOptField>

              <PhotoOptField label="Style vestimentaire">
                <ToggleGroup
                  value={photoOpts.style}
                  onChange={(v) => setPhotoOpts((p) => ({ ...p, style: v }))}
                  options={[
                    { label: "Corporate", value: "corporate" },
                    { label: "Décontracté", value: "decontracte" },
                    { label: "Créatif", value: "creatif" },
                    { label: "Formel", value: "formel" },
                  ]}
                />
              </PhotoOptField>

              <PhotoOptField label="Arrière-plan">
                <ToggleGroup
                  value={photoOpts.background}
                  onChange={(v) => setPhotoOpts((p) => ({ ...p, background: v }))}
                  options={[
                    { label: "Studio (uniforme)", value: "studio" },
                    { label: "Personnel (unique)", value: "personnel" },
                    { label: "Extérieur", value: "exterieur" },
                  ]}
                />
              </PhotoOptField>
            </div>

            <button
              type="button"
              onClick={generatePhoto}
              disabled={generating}
              className="text-sm bg-navy text-white px-4 py-2 rounded hover:bg-navy-light transition-colors disabled:opacity-60"
            >
              {generating ? "Génération en cours…" : "Générer la photo"}
            </button>
          </div>
        </div>
      )}

      <Field label="Nom complet">
        <input
          type="text"
          required
          value={form.name}
          onChange={(e) => setName(e.target.value)}
          className={inputClass}
          placeholder="Sophie Renard"
        />
      </Field>

      <Field label="Slug URL">
        <input
          type="text"
          required
          value={form.slug}
          onChange={(e) => setForm((p) => ({ ...p, slug: e.target.value }))}
          className={`${inputClass} font-mono`}
          placeholder="sophie-renard"
        />
      </Field>

      <Field label="Titre / Fonction">
        <select
          value={form.job_title}
          onChange={(e) => setForm((p) => ({ ...p, job_title: e.target.value }))}
          className={inputClass}
        >
          {["Journaliste", "Chef de rubrique", "Cheffe de rubrique",
            "Rédacteur en chef adjoint", "Rédactrice en chef adjointe",
            "Rédacteur en chef", "Rédactrice en chef",
            "Correspondant", "Correspondante", "Pigiste",
          ].map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </Field>

      <Field label="Biographie" hint="Courte présentation, 2-3 phrases">
        <textarea
          value={form.bio}
          onChange={(e) => setForm((p) => ({ ...p, bio: e.target.value }))}
          rows={3}
          className={inputClass}
          placeholder="Sophie Renard couvre la politique belge et européenne depuis 2010…"
        />
      </Field>

      <Field label="Pays" hint="Séparés par des virgules">
        <input
          type="text"
          value={form.countries}
          onChange={(e) => setForm((p) => ({ ...p, countries: e.target.value }))}
          className={inputClass}
          placeholder="Belgique, France, Maroc"
        />
      </Field>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Spécialisations</label>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => toggleSpec(cat)}
              className={`px-3 py-1 text-sm rounded border transition-colors ${
                form.specializations.includes(cat)
                  ? "bg-navy text-white border-navy"
                  : "bg-white text-gray-600 border-gray-300 hover:border-navy"
              }`}
            >
              {capitalizeCategory(cat)}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Style rédactionnel</label>
        <div className="flex flex-wrap gap-2">
          {STYLE_TAGS.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => toggleTag(tag)}
              className={`px-3 py-1 text-sm rounded border transition-colors ${
                form.style_tags.includes(tag)
                  ? "bg-accent text-white border-accent"
                  : "bg-white text-gray-600 border-gray-300 hover:border-accent"
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      <Field label="Structure d'article" hint="Structure utilisée en mode «Par journaliste»">
        <select
          value={form.article_structure ?? ""}
          onChange={(e) => setForm((p) => ({ ...p, article_structure: e.target.value || null }))}
          className={inputClass}
        >
          <option value="">— Aucune (utiliser la structure par défaut) —</option>
          {STRUCTURES.map((s) => (
            <option key={s.id} value={s.id}>{s.label} — {s.description}</option>
          ))}
        </select>
      </Field>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="active"
          checked={form.active}
          onChange={(e) => setForm((p) => ({ ...p, active: e.target.checked }))}
          className="rounded border-gray-300"
        />
        <label htmlFor="active" className="text-sm font-medium text-gray-700">
          Journaliste actif(ve)
        </label>
      </div>

      {!isEdit && (
        <p className="text-xs text-gray-400">
          Vous pourrez ajouter une photo après la création.
        </p>
      )}

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-4 py-3">
          {error}
        </p>
      )}

      <div className="flex items-center gap-4 pt-2">
        <button
          type="submit"
          disabled={saving}
          className="bg-navy hover:bg-navy-light text-white font-medium py-2 px-6 rounded transition-colors disabled:opacity-60"
        >
          {saving ? "Enregistrement…" : isEdit ? "Enregistrer" : "Créer le journaliste"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/admin/equipe")}
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

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
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

function PhotoOptField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      {children}
    </div>
  );
}

function ToggleGroup({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { label: string; value: string }[];
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`px-2 py-0.5 text-xs rounded border transition-colors ${
            value === opt.value
              ? "bg-navy text-white border-navy"
              : "bg-white text-gray-600 border-gray-300 hover:border-navy"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

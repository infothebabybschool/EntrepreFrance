"use client";

import { useState } from "react";

const SUBJECTS = [
  "Question générale",
  "Signaler une erreur",
  "Partenariat / presse",
  "Suggestion d'article",
  "Problème technique",
  "Autre",
];

export default function ContactForm() {
  const [form, setForm] = useState({ name: "", email: "", subject: SUBJECTS[0], message: "" });
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  function set(field: string, value: string) {
    setForm((p) => ({ ...p, [field]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setErrorMsg("");

    const res = await fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    if (res.ok) {
      setStatus("done");
    } else {
      const data = await res.json();
      setStatus("error");
      setErrorMsg(data.error ?? "Une erreur est survenue. Réessayez plus tard.");
    }
  }

  if (status === "done") {
    return (
      <div className="text-center py-12">
        <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="font-serif text-xl font-bold text-gray-900 mb-2">Message envoyé</h3>
        <p className="text-gray-500 text-sm">Nous vous répondrons dans les meilleurs délais.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <Field label="Nom complet *">
          <input
            type="text"
            required
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            className={inputClass}
            placeholder="Jean Dupont"
          />
        </Field>
        <Field label="Adresse email *">
          <input
            type="email"
            required
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
            className={inputClass}
            placeholder="jean@exemple.be"
          />
        </Field>
      </div>

      <Field label="Sujet">
        <select value={form.subject} onChange={(e) => set("subject", e.target.value)} className={inputClass}>
          {SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </Field>

      <Field label="Message *">
        <textarea
          required
          value={form.message}
          onChange={(e) => set("message", e.target.value)}
          rows={6}
          className={inputClass}
          placeholder="Votre message…"
        />
      </Field>

      {status === "error" && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-4 py-3">
          {errorMsg}
        </p>
      )}

      <button
        type="submit"
        disabled={status === "loading"}
        className="bg-navy hover:bg-navy-light text-white font-medium py-2.5 px-8
                   rounded transition-colors disabled:opacity-60 font-sans text-sm"
      >
        {status === "loading" ? "Envoi en cours…" : "Envoyer le message"}
      </button>
    </form>
  );
}

const inputClass = "w-full border border-gray-300 rounded px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-transparent";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

"use client";

import { useState } from "react";

export default function SubscribeForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setErrorMsg("");

    try {
      const res = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.error ?? "Une erreur est survenue.");
        setStatus("error");
      } else {
        setStatus("success");
        setEmail("");
      }
    } catch {
      setErrorMsg("Impossible de contacter le serveur. Réessayez plus tard.");
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div className="bg-green-50 border border-green-200 rounded p-6 text-center">
        <p className="text-green-800 font-medium text-lg">
          Inscription réussie !
        </p>
        <p className="text-green-700 text-sm mt-1">
          Un email de bienvenue vous a été envoyé.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
          Adresse email
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          placeholder="vous@exemple.com"
          className="w-full border border-gray-300 rounded px-4 py-2 text-sm
                     focus:outline-none focus:ring-2 focus:ring-navy focus:border-transparent"
        />
      </div>

      {status === "error" && (
        <p className="text-sm text-red-600">{errorMsg}</p>
      )}

      <button
        type="submit"
        disabled={status === "loading"}
        className="w-full bg-accent hover:bg-accent-hover text-white font-medium
                   py-2 px-6 rounded transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {status === "loading" ? "Inscription en cours…" : "S'inscrire gratuitement"}
      </button>

      <p className="text-xs text-gray-500 text-center">
        Gratuit. Pas de spam. Désabonnement en un clic.
      </p>
    </form>
  );
}

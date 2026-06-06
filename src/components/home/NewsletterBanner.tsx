"use client";

import { useState } from "react";

export default function NewsletterBanner() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");

  async function subscribe(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    const res = await fetch("/api/newsletter/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await res.json();
    if (res.ok) {
      setStatus("done");
    } else {
      setStatus("error");
      setMsg(data.error ?? "Une erreur est survenue.");
    }
  }

  return (
    <section className="bg-navy text-white py-10 px-4">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
        <div>
          <h2 className="font-serif text-xl sm:text-2xl font-bold">
            Restez informé de l&apos;actualité belge
          </h2>
          <p className="text-blue-200 text-sm mt-1">
            Nos meilleurs articles directement dans votre boîte mail. Gratuit, sans publicité.
          </p>
        </div>

        {status === "done" ? (
          <p className="text-green-300 font-medium text-sm shrink-0">
            ✓ Vous êtes inscrit(e) !
          </p>
        ) : (
          <form onSubmit={subscribe} className="flex gap-2 w-full sm:w-auto shrink-0">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="votre@email.com"
              className="px-4 py-2 rounded text-sm text-gray-900 placeholder-gray-400
                         focus:outline-none focus:ring-2 focus:ring-accent w-full sm:w-56"
            />
            <button
              type="submit"
              disabled={status === "loading"}
              className="bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded text-sm
                         font-medium transition-colors shrink-0 disabled:opacity-60"
            >
              {status === "loading" ? "…" : "S'abonner"}
            </button>
          </form>
        )}
      </div>
      {status === "error" && (
        <p className="text-center text-red-300 text-xs mt-3">{msg}</p>
      )}
    </section>
  );
}

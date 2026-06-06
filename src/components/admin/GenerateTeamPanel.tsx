"use client";

import { useState } from "react";

interface PhotoOpts {
  gender: string;
  age: string;
  ethnicity: string;
  style: string;
  background: string;
}

interface GeneratedJournalist {
  id: string;
  name: string;
  photo_opts: PhotoOpts;
}

type Phase = "idle" | "generating-team" | "generating-photos" | "done" | "error";

export default function GenerateTeamPanel() {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(6);
  const [parity, setParity] = useState(50);
  const [diversity, setDiversity] = useState(50);
  const [countriesInput, setCountriesInput] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState({ current: 0, total: 0, name: "" });
  const [errorMsg, setErrorMsg] = useState("");

  async function generate() {
    setPhase("generating-team");
    setErrorMsg("");

    // Step 1: Generate team roster via Claude
    const countries = countriesInput.split(",").map((s) => s.trim()).filter(Boolean);
    const res = await fetch("/api/admin/journalists/generate-team", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ count, parity, diversity, countries }),
    });

    if (!res.ok) {
      const json = await res.json();
      setErrorMsg(json.error ?? "Erreur lors de la génération");
      setPhase("error");
      return;
    }

    const { journalists } = await res.json() as { journalists: GeneratedJournalist[] };

    if (!journalists.length) {
      setErrorMsg("Aucun journaliste créé");
      setPhase("error");
      return;
    }

    // Step 2: Generate photos one by one
    setPhase("generating-photos");
    setProgress({ current: 0, total: journalists.length, name: "" });

    for (let i = 0; i < journalists.length; i++) {
      const j = journalists[i];
      setProgress({ current: i + 1, total: journalists.length, name: j.name });

      try {
        await fetch(`/api/admin/journalists/${j.id}/generate-photo`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(j.photo_opts),
        });
      } catch {
        // Photo failure is non-blocking — journalist still created
      }
    }

    setPhase("done");
    // Hard reload to show fresh team list
    setTimeout(() => { window.location.reload(); }, 800);
  }

  function parityLabel(v: number) {
    if (v === 0) return "100% hommes";
    if (v === 100) return "100% femmes";
    if (v === 50) return "Parité parfaite";
    if (v < 50) return `${100 - v}% H / ${v}% F`;
    return `${v}% F / ${100 - v}% H`;
  }

  function diversityLabel(v: number) {
    if (v < 20) return "Très homogène";
    if (v < 40) return "Légèrement diversifiée";
    if (v < 60) return "Modérément diversifiée";
    if (v < 80) return "Très diversifiée";
    return "Maximum";
  }

  return (
    <div className="mb-6">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 text-sm text-navy hover:text-navy-light font-medium transition-colors"
      >
        <span className={`transition-transform ${open ? "rotate-90" : ""}`}>▶</span>
        Générer une équipe complète
      </button>

      {open && (
        <div className="mt-4 bg-white border border-gray-200 rounded p-5 space-y-5 max-w-xl">
          {phase === "idle" || phase === "error" ? (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nombre de journalistes
                  <span className="ml-2 text-navy font-bold">{count}</span>
                </label>
                <input
                  type="range"
                  min={1}
                  max={20}
                  value={count}
                  onChange={(e) => setCount(Number(e.target.value))}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-gray-400 mt-0.5">
                  <span>1</span><span>20</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Parité hommes / femmes
                  <span className="ml-2 text-navy font-bold">{parityLabel(parity)}</span>
                </label>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={parity}
                  onChange={(e) => setParity(Number(e.target.value))}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-gray-400 mt-0.5">
                  <span>100% H</span><span>Parité</span><span>100% F</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Diversité de l&apos;équipe
                  <span className="ml-2 text-navy font-bold">{diversityLabel(diversity)}</span>
                </label>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={diversity}
                  onChange={(e) => setDiversity(Number(e.target.value))}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-gray-400 mt-0.5">
                  <span>Homogène</span><span>Maximum</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Pays / origines
                  <span className="text-gray-400 font-normal ml-1">— séparés par des virgules (optionnel)</span>
                </label>
                <input
                  type="text"
                  value={countriesInput}
                  onChange={(e) => setCountriesInput(e.target.value)}
                  placeholder="Belgique, Maroc, Congo, Chine…"
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-transparent"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Les noms et apparences des journalistes seront adaptés à ces pays. Laissez vide pour Belgique/France par défaut.
                </p>
              </div>

              <div className="text-xs text-gray-500 bg-gray-50 rounded px-3 py-2 space-y-1">
                <p><strong>Structure générée pour {count} journalistes :</strong></p>
                <p>{jobTitlePlan(count)}</p>
                <p className="text-gray-400">Les photos seront générées via DALL-E 3 (~{count * 20}s)</p>
              </div>

              {errorMsg && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
                  {errorMsg}
                </p>
              )}

              <button
                type="button"
                onClick={generate}
                className="bg-navy text-white text-sm font-medium px-5 py-2 rounded hover:bg-navy-light transition-colors"
              >
                Générer l&apos;équipe
              </button>
            </>
          ) : phase === "generating-team" ? (
            <div className="text-center py-6">
              <Spinner />
              <p className="text-sm text-gray-600 mt-3">Génération des profils avec Claude…</p>
            </div>
          ) : phase === "generating-photos" ? (
            <div className="py-4 space-y-3">
              <div className="flex justify-between text-sm text-gray-600">
                <span>Génération des photos DALL-E 3…</span>
                <span>{progress.current}/{progress.total}</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div
                  className="bg-navy h-2 rounded-full transition-all duration-300"
                  style={{ width: `${(progress.current / progress.total) * 100}%` }}
                />
              </div>
              {progress.name && (
                <p className="text-xs text-gray-500">Génération : {progress.name}</p>
              )}
            </div>
          ) : (
            <div className="text-center py-6">
              <p className="text-green-600 font-medium">Équipe générée avec succès !</p>
              <p className="text-xs text-gray-400 mt-1">Rechargement en cours…</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function jobTitlePlan(count: number): string {
  if (count === 1) return "1 Rédacteur·rice en chef";
  if (count === 2) return "1 Rédacteur·rice en chef, 1 Journaliste";
  if (count <= 4) return `1 Rédacteur·rice en chef, ${count - 1} Journalistes`;
  if (count <= 6) return `1 Rédacteur·rice en chef, 1 Rédacteur·rice adjoint·e, ${count - 2} Journalistes`;
  if (count <= 10) return `1 Rédacteur·rice en chef, 1 Rédacteur·rice adjoint·e, 2 Chef·fes de rubrique, ${count - 4} Journalistes`;
  return `1 Rédacteur·rice en chef, 2 Rédacteur·rices adjoint·es, 3 Chef·fes de rubrique, ${count - 6} Journalistes`;
}

function Spinner() {
  return (
    <div className="inline-block w-6 h-6 border-2 border-gray-200 border-t-navy rounded-full animate-spin" />
  );
}

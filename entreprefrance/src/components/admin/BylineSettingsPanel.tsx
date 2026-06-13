"use client";

import { useState, useEffect } from "react";

export interface BylineSettings {
  show: boolean;
  showPhoto: boolean;
  position: "above-title" | "below-title" | "below-chapo" | "below-date" | "end-of-article";
  clickable: boolean;
}

export const BYLINE_DEFAULTS: BylineSettings = {
  show: true,
  showPhoto: true,
  position: "below-chapo",
  clickable: true,
};

const POSITIONS: { value: BylineSettings["position"]; label: string }[] = [
  { value: "above-title", label: "Above the title" },
  { value: "below-title", label: "Below the title" },
  { value: "below-chapo", label: "Below the introduction paragraph (current default)" },
  { value: "below-date", label: "Below the date" },
  { value: "end-of-article", label: "End of the article" },
];

export default function BylineSettingsPanel() {
  const [settings, setSettings] = useState<BylineSettings>(BYLINE_DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/byline-settings")
      .then((r) => r.json())
      .then((data) => {
        if (data.settings) setSettings({ ...BYLINE_DEFAULTS, ...data.settings });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch("/api/admin/byline-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Unknown error");
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setSaving(false);
  }

  return (
    <div className="bg-white border border-gray-200 rounded p-6 mb-8">
      <h2 className="font-serif text-lg font-bold text-gray-900 mb-1">Byline settings</h2>
      <p className="text-xs text-gray-400 mb-5">
        Controls how the author credit appears on every article. Changes take effect within 1 hour.
      </p>

      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : (
        <div className="space-y-5">
          {/* Show journalist name */}
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.show}
              onChange={(e) => setSettings({ ...settings, show: e.target.checked })}
              className="accent-navy w-4 h-4 mt-0.5 flex-shrink-0"
            />
            <div>
              <span className="text-sm font-medium text-gray-800">Show journalist name</span>
              <p className="text-xs text-gray-400 mt-0.5">
                Display an author attribution on each article. When off, no byline is shown at all.
              </p>
            </div>
          </label>

          {settings.show && (
            <>
              <div className="border-t border-gray-100 pt-4 space-y-4">
                {/* Show photo */}
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.showPhoto}
                    onChange={(e) => setSettings({ ...settings, showPhoto: e.target.checked })}
                    className="accent-navy w-4 h-4 mt-0.5 flex-shrink-0"
                  />
                  <div>
                    <span className="text-sm font-medium text-gray-800">Show journalist photo</span>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Display the journalist&apos;s avatar next to their name.
                    </p>
                  </div>
                </label>

                {/* Clickable */}
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.clickable}
                    onChange={(e) => setSettings({ ...settings, clickable: e.target.checked })}
                    className="accent-navy w-4 h-4 mt-0.5 flex-shrink-0"
                  />
                  <div>
                    <span className="text-sm font-medium text-gray-800">Name is clickable</span>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Link the journalist&apos;s name to their profile page.
                    </p>
                  </div>
                </label>
              </div>

              {/* Position */}
              <div className="border-t border-gray-100 pt-4">
                <p className="text-sm font-medium text-gray-800 mb-3">Byline position</p>
                <div className="space-y-2">
                  {POSITIONS.map((p) => (
                    <label key={p.value} className="flex items-center gap-2.5 cursor-pointer">
                      <input
                        type="radio"
                        name="byline-position"
                        value={p.value}
                        checked={settings.position === p.value}
                        onChange={() => setSettings({ ...settings, position: p.value })}
                        className="accent-navy flex-shrink-0"
                      />
                      <span className="text-sm text-gray-700">{p.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </>
          )}

          <div className="border-t border-gray-100 pt-4 flex items-center gap-3">
            <button
              onClick={save}
              disabled={saving}
              className="bg-navy hover:bg-navy-light text-white text-sm font-medium px-5 py-2 rounded transition-colors disabled:opacity-50"
            >
              {saving ? "Saving…" : saved ? "Saved ✓" : "Save byline settings"}
            </button>
            {error && <p className="text-xs text-red-500">{error}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

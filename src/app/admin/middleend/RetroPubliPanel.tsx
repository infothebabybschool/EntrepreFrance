"use client";

import { useState, useEffect } from "react";
import CurveEditor, { CurvePreset, applyPreset } from "./CurveEditor";

type ImageMode = "pexels" | "dalle3";

interface MonthLog {
  label: string;
  scraped: number;
  written: number;
  errors: string[];
}

function getYearMonth(
  idx: number,
  includeCurrent: boolean,
): { year: number; month: number; label: string } {
  // includeCurrent: idx=0 → current month (0 ago), idx=1 → 1 month ago, ...
  // !includeCurrent: idx=0 → 1 month ago, idx=1 → 2 months ago, ...
  const monthsAgo = includeCurrent ? idx : idx + 1;
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - monthsAgo);
  return {
    year: d.getFullYear(),
    month: d.getMonth() + 1,
    label: monthsAgo === 0
      ? "Last 4 weeks"
      : d.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
  };
}

export default function RetroPubliPanel() {
  const [monthsBack, setMonthsBack] = useState(6);
  const [baseCount, setBaseCount] = useState(2);
  const [imageMode, setImageMode] = useState<ImageMode>("pexels");
  const [safeSensitivity, setSafeSensitivity] = useState(false);
  const [includeCurrent, setIncludeCurrent] = useState(true);
  const [preset, setPreset] = useState<CurvePreset>("linear");
  const [distribution, setDistribution] = useState<number[]>(() =>
    applyPreset("linear", 6, 2)
  );

  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [logs, setLogs] = useState<MonthLog[]>([]);
  const [finished, setFinished] = useState(false);

  // Recompute distribution when any param changes
  // Total slots = monthsBack + (includeCurrent ? 1 : 0)
  useEffect(() => {
    const base = applyPreset(preset, monthsBack, baseCount);
    // Prepend baseCount for "Now" slot when includeCurrent is on
    setDistribution(includeCurrent ? [baseCount, ...base] : base);
  }, [preset, monthsBack, baseCount, includeCurrent]);

  const totalArticles = distribution.reduce((a, b) => a + b, 0);
  const anthropicCost = totalArticles * 0.044;
  const openaiCostIfSelected = totalArticles * 0.04;
  const openaiCost = imageMode === "dalle3" ? openaiCostIfSelected : 0;
  const totalCost = anthropicCost + openaiCost;

  function handlePresetChange(p: CurvePreset) {
    setPreset(p);
    setDistribution(applyPreset(p, monthsBack, baseCount));
  }

  async function launch() {
    setRunning(true);
    setFinished(false);
    setLogs([]);
    const total = totalArticles;
    setProgress({ done: 0, total });
    let done = 0; // tracks articles written so far across all months

    for (let idx = 0; idx < monthsBack; idx++) {
      const target = distribution[idx];
      if (target === 0) continue;

      const { year, month, label } = getYearMonth(idx, includeCurrent);

      // Step 1: scrape historical RSS via Wayback Machine
      let scraped: object[] = [];
      try {
        const scrapeRes = await fetch("/api/admin/retropubli/scrape-month", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ year, month }),
        });
        if (scrapeRes.ok) {
          const data = await scrapeRes.json();
          scraped = data.articles ?? [];
        }
      } catch {
        // continue — write-month handles empty list
      }

      // Step 2: write one article at a time (avoids Vercel 60s timeout)
      let written = 0;
      const errors: string[] = [];
      const excludeUrls: string[] = [];

      for (let a = 0; a < target; a++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 55000);
        try {
          const writeRes = await fetch("/api/admin/retropubli/write-month", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: controller.signal,
            body: JSON.stringify({ articles: scraped, excludeUrls, year, month, imageMode, safeSensitivity }),
          });
          const data = await writeRes.json();
          if (data.written) written += data.written;
          if (data.sourceUrl) excludeUrls.push(data.sourceUrl);
          if (data.errors?.length) errors.push(...data.errors);
          done += data.written ?? 0;
          setProgress({ done, total });
        } catch (e) {
          const msg = e instanceof Error && e.name === "AbortError" ? "Timeout (55s) — article skipped" : String(e);
          errors.push(msg);
        } finally {
          clearTimeout(timer);
        }
      }

      setLogs((prev) => [
        ...prev,
        { label, scraped: scraped.length, written, errors },
      ]);
    }

    setRunning(false);
    setFinished(true);
  }

  return (
    <div className="space-y-8">
      {/* Settings */}
      <div className="bg-white border border-gray-200 rounded p-6 space-y-6">
        <h2 className="font-serif text-lg font-bold text-gray-900">Settings</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {/* Months back */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Go back{" "}
              <span className="text-navy font-bold">{monthsBack} month{monthsBack > 1 ? "s" : ""}</span>
            </label>
            <input
              type="range" min={1} max={60} value={monthsBack}
              onChange={(e) => setMonthsBack(Number(e.target.value))}
              className="w-full accent-navy"
            />
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>1 month</span><span>60 months</span>
            </div>
          </div>

          {/* Base articles/month */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Base{" "}
              <span className="text-navy font-bold">{baseCount} article{baseCount > 1 ? "s" : ""}/month</span>
            </label>
            <input
              type="range" min={1} max={30} value={baseCount}
              onChange={(e) => setBaseCount(Number(e.target.value))}
              className="w-full accent-navy"
            />
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>1</span><span>10</span>
            </div>
          </div>
        </div>

        {/* Image mode */}
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">Images</p>
          <div className="flex flex-wrap gap-4">
            {(["pexels", "dalle3"] as ImageMode[]).map((mode) => (
              <label key={mode} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="imageMode"
                  value={mode}
                  checked={imageMode === mode}
                  onChange={() => setImageMode(mode)}
                  className="accent-navy"
                />
                <span className="text-sm text-gray-700">
                  {mode === "pexels" ? "Pexels (free)" : "DALL-E 3 ($0.04/image)"}
                </span>
              </label>
            ))}
          </div>
          {imageMode === "dalle3" && (
            <label className="flex items-center gap-2 mt-3 cursor-pointer">
              <input
                type="checkbox"
                checked={safeSensitivity}
                onChange={(e) => setSafeSensitivity(e.target.checked)}
                className="accent-navy"
              />
              <span className="text-sm text-gray-600">
                Safe mode — avoid sensitive imagery (violence, conflicts)
              </span>
            </label>
          )}
        </div>

        {/* Last 4 weeks toggle */}
        <div className="border-t border-gray-100 pt-4">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={includeCurrent}
              onChange={(e) => setIncludeCurrent(e.target.checked)}
              className="accent-teal-600 w-4 h-4"
            />
            <div>
              <span className="text-sm font-medium text-gray-700">
                Include current month up to today
              </span>
              <p className="text-xs text-gray-400 mt-0.5">
                The teal <strong className="text-gray-500">&ldquo;Now&rdquo;</strong> bar covers{" "}
                {new Date().toLocaleDateString("en-US", { month: "long" })} 1st through yesterday.
                This fills the gap between your retropublished history and the live pipeline,
                so readers never see a blank period on the site.
              </p>
            </div>
          </label>
        </div>
      </div>

      {/* Temporal distribution curve */}
      <div className="bg-white border border-gray-200 rounded p-6">
        <h2 className="font-serif text-lg font-bold text-gray-900 mb-1">
          Temporal Distribution
        </h2>
        <p className="text-xs text-gray-400 mb-4">
          Choose a preset and drag the bars to fine-tune how many articles to generate per month.
        </p>
        <CurveEditor
          values={distribution}
          onChange={setDistribution}
          onPresetChange={handlePresetChange}
          activePreset={preset}
          hasCurrent={includeCurrent}
        />
      </div>

      {/* Cost estimate */}
      <div className="bg-white border border-gray-200 rounded p-6">
        <h2 className="font-serif text-lg font-bold text-gray-900 mb-4">
          Cost Estimate
        </h2>
        <div className="font-mono text-sm space-y-2">
          <div className="flex justify-between text-gray-700">
            <span>Total articles</span>
            <span className="font-bold text-navy">{totalArticles}</span>
          </div>
          <div className="flex justify-between text-gray-600">
            <span>
              Anthropic — selection + writing{" "}
              <span className="text-gray-400 text-xs">($0.044/article)</span>
            </span>
            <span>~${anthropicCost.toFixed(2)}</span>
          </div>
          <div className={`flex justify-between ${imageMode === "dalle3" ? "text-gray-600" : "text-gray-300"}`}>
            <span>
              OpenAI DALL-E 3 — images{" "}
              <span className="text-xs">($0.04/image)</span>
              {imageMode !== "dalle3" && (
                <span className="text-gray-400 ml-1 text-xs font-sans not-italic">— not selected</span>
              )}
            </span>
            <span>~${openaiCostIfSelected.toFixed(2)}</span>
          </div>
          <div className="border-t border-gray-200 pt-2 flex justify-between font-bold text-gray-900">
            <span>Total estimate</span>
            <span className="text-navy">~${totalCost.toFixed(2)}</span>
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-3">
          Indicative estimate. Actual costs may vary based on article length and archive availability.
          DALL-E 3 cost shown assumes one image per article.
        </p>
      </div>

      {/* Launch */}
      {!running && !finished && (
        <button
          onClick={launch}
          disabled={totalArticles === 0}
          className="w-full bg-accent hover:bg-accent-hover text-white font-medium py-3 px-6
                     rounded transition-colors disabled:opacity-40 font-sans"
        >
          Start retropublication — {totalArticles} article{totalArticles > 1 ? "s" : ""} over {monthsBack} month{monthsBack > 1 ? "s" : ""}
        </button>
      )}

      {/* Progress */}
      {(running || finished) && (
        <div className="bg-white border border-gray-200 rounded p-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-900">
              {running ? "Generating…" : "Done"}
            </h3>
            <span className="text-sm font-mono text-gray-500">
              {progress.done} / {progress.total} articles
            </span>
          </div>

          <div className="w-full bg-gray-100 rounded-full h-2 mb-5">
            <div
              className="bg-navy h-2 rounded-full transition-all duration-300"
              style={{ width: progress.total > 0 ? `${(progress.done / progress.total) * 100}%` : "0%" }}
            />
          </div>

          <div className="space-y-2">
            {logs.map((log, i) => (
              <div key={i} className="flex items-start gap-3 text-sm">
                <span className={`shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-white text-xs mt-0.5 ${
                  log.errors.length > 0 ? "bg-orange-400" : "bg-green-500"
                }`}>
                  {log.errors.length > 0 ? "!" : "✓"}
                </span>
                <div>
                  <span className="font-medium text-gray-800">{log.label}</span>
                  <span className="text-gray-500 ml-2">
                    {log.scraped > 0
                      ? `${log.scraped} found → ${log.written} written`
                      : `no archive — ${log.written} written from Claude's knowledge`}
                  </span>
                  {log.errors.map((e, j) => (
                    <p key={j} className="text-xs text-orange-600 mt-0.5">{e}</p>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {finished && (
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => { setFinished(false); setLogs([]); }}
                className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2 px-4 rounded text-sm transition-colors"
              >
                New generation
              </button>
              <a
                href="/admin"
                className="bg-navy hover:bg-navy-light text-white font-medium py-2 px-4 rounded text-sm transition-colors"
              >
                View articles
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

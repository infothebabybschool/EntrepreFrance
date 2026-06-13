"use client";

import { useState, useEffect, useCallback, useRef } from "react";

// ── Types ──────────────────────────────────────────────────────────────────────

type PostingMode = "interval" | "same-time" | "random" | "specific";
type SourceName = "pexels" | "unsplash" | "pixabay" | "openverse";
type ImageStrategy = "priority" | "weighted" | "best-of-all";
type StructureMode = "fixed" | "auto" | "per-journalist";
type StructureId =
  | "pyramide-inversee" | "flash" | "narratif" | "analyse" | "qr"
  | "listicle" | "chronologie" | "contexte-dabord" | "mise-en-perspective" | "briefing";

const STRUCTURE_LIST: { id: StructureId; label: string; description: string }[] = [
  { id: "pyramide-inversee",   label: "Pyramide inversée",       description: "Facts first, then context, reactions, perspectives" },
  { id: "flash",               label: "En bref / Flash",          description: "150-250 words, essential facts only" },
  { id: "narratif",            label: "WSJ / Narratif",           description: "Anecdote opener, nut graf, development, forward close" },
  { id: "analyse",             label: "Analyse / Décryptage",     description: "600-800 words with subheadings, multiple angles" },
  { id: "qr",                  label: "Q&R / Essentiel",          description: "Bold questions + short direct answers" },
  { id: "listicle",            label: "Listicle / Points clés",   description: "Brief intro + numbered key facts" },
  { id: "chronologie",         label: "Chronologie / Timeline",   description: "Dated events building to today's news" },
  { id: "contexte-dabord",     label: "Contexte d'abord",         description: "Background first, then the news" },
  { id: "mise-en-perspective", label: "Mise en perspective",      description: "Belgium vs neighbouring countries comparison" },
  { id: "briefing",            label: "Briefing structuré",       description: "Les faits / Le contexte / Les réactions / Ce qu'il faut surveiller" },
];

const DEFAULT_IMAGE_SOURCES: ImageSourceConfig[] = [
  { name: "pexels",    enabled: true,  weight: 25 },
  { name: "unsplash",  enabled: false, weight: 25 },
  { name: "pixabay",   enabled: false, weight: 25 },
  { name: "openverse", enabled: false, weight: 25 },
];

interface ImageSourceConfig {
  name: SourceName;
  enabled: boolean;
  weight: number;
}

interface RssFeed {
  name: string;
  url: string;
  enabled: boolean;
}

interface PipelineConfig {
  schedule: { time: string; timezone: string };
  pipeline: { articlesPerDay: number; minArticlesRequired: number; topicRepetitionWeight: number };
  posting: {
    mode: PostingMode;
    firstPostTime: string;
    intervalMinutes: number;
    randomMin: number;
    randomMax: number;
    specificTimes: string[];
  };
  rssFeeds: RssFeed[];
  images: {
    enabled: boolean;
    relevanceThreshold: number;
    generationStyle: string;
    costLog?: Record<string, number>;
    strategy?: ImageStrategy;
    sources?: ImageSourceConfig[];
  };
  articleStructure?: {
    mode: StructureMode;
    fixed?: StructureId;
    allowlist?: StructureId[];
  };
}

interface ScrapedArticle {
  source: string;
  headline: string;
  url: string;
  thumbnail_url: string | null;
  published_at: string | null;
}

interface ScrapeHistoryEntry {
  scraped_at: string;
  total: number;
  source: "manual" | "auto";
}

interface ScrapeData {
  scraped_at: string;
  total: number;
  articles: ScrapedArticle[];
  history: ScrapeHistoryEntry[];
}

interface SelectedArticle {
  source_urls: string[];
  headlines: string[];
  angle: string;
  category: string;
  image_keywords: string[];
  added_by?: string;
}

interface SelectionData {
  selected_at: string;
  total: number;
  articles: SelectedArticle[];
}

interface ReadyArticle {
  title: string;
  slug: string;
  chapo: string;
  body: string;
  category: string;
  tags: string[];
  source_urls: string[];
  featured_image_url: string | null;
  image_credit: string | null;
  scheduled_for: string;
  posted?: boolean;
  posted_at?: string;
  failed?: boolean;
}

interface ReadyData {
  generated_at: string;
  total: number;
  articles: ReadyArticle[];
}

interface LogEntry {
  id: number;
  created_at: string;
  is_error: boolean;
  scope: string;
  message: string;
}

interface Props {
  initialConfig: PipelineConfig;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

// Normalize articles that may have been saved in the old single-source format
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeSelectedArticle(a: any): SelectedArticle {
  return {
    source_urls: Array.isArray(a.source_urls) ? a.source_urls : a.source_url ? [a.source_url] : [],
    headlines: Array.isArray(a.headlines) ? a.headlines : a.headline ? [a.headline] : [],
    angle: a.angle ?? "",
    category: a.category ?? "",
    image_keywords: Array.isArray(a.image_keywords) ? a.image_keywords : [],
    added_by: a.added_by,
  };
}

function formatDate(iso: string, opts: Intl.DateTimeFormatOptions = {}) {
  return new Date(iso).toLocaleString("en-GB", { timeZone: "Europe/Brussels", ...opts });
}

function formatCountdown(iso: string) {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return "now";
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  return h > 0 ? `in ${h}h ${m}m` : `in ${m}m`;
}

function getNextRunTime(config: PipelineConfig): string {
  const [h, m] = config.schedule.time.split(":").map(Number);
  const now = new Date();
  const tz = config.schedule.timezone;
  const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const [y, mo, d] = todayStr.split("-").map(Number);
  const testDate = new Date(Date.UTC(y, mo - 1, d, 12, 0, 0));
  const tzNoon = parseInt(new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hour12: false }).format(testDate), 10);
  const offset = tzNoon - 12;
  let run = new Date(Date.UTC(y, mo - 1, d, h - offset, m, 0));
  if (run <= now) run = new Date(run.getTime() + 86400000);
  return run.toISOString();
}

function toBrusselsTime(iso: string) {
  return new Date(iso).toLocaleString("en-CA", {
    timeZone: "Europe/Brussels", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).replace(", ", "T").replace(/,/, "T").slice(0, 16);
}

function renderMarkdown(md: string): string {
  const escaped = md.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return escaped
    .replace(/^### (.+)$/gm, "<h3 style=\"font-size:14px;font-weight:700;margin:16px 0 6px\">$1</h3>")
    .replace(/^## (.+)$/gm, "<h2 style=\"font-size:15px;font-weight:700;margin:18px 0 8px\">$1</h2>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/\n\n/g, "</p><p style=\"margin:0 0 12px\">")
    .replace(/^/, "<p style=\"margin:0 0 12px\">")
    .replace(/$/, "</p>");
}

// ── Main component ─────────────────────────────────────────────────────────────

function normalizeConfig(c: PipelineConfig): PipelineConfig {
  return {
    ...c,
    images: {
      ...c.images,
      strategy: c.images.strategy ?? "priority",
      sources: c.images.sources ?? DEFAULT_IMAGE_SOURCES,
    },
  };
}

export default function PipelinePanel({ initialConfig }: Props) {
  const [config, setConfig] = useState<PipelineConfig>(() => normalizeConfig(initialConfig));
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const [scrape, setScrape] = useState<ScrapeData | null>(null);
  const [selection, setSelection] = useState<SelectionData | null>(null);
  const [ready, setReady] = useState<ReadyData | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [queuedUrls, setQueuedUrls] = useState<Set<string>>(new Set());
  // articles added via "+ select" shown immediately in selection with pending badge
  const [pendingSelections, setPendingSelections] = useState<SelectedArticle[]>([]);
  // source_urls queued for generation (show feedback until ready cache updates)
  const [pendingGenerations, setPendingGenerations] = useState<Set<string>>(new Set());
  const [cmdMsg, setCmdMsg] = useState<{ section: string; msg: string } | null>(null);

  // Preview + editing
  const [preview, setPreview] = useState<ReadyArticle | null>(null);
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState<Partial<ReadyArticle>>({});

  const [pendingTimes, setPendingTimes] = useState<Record<string, string>>({});
  const [countdown, setCountdown] = useState("");
  const nextRunRef = useRef(getNextRunTime(config));

  // RSS Sources
  const [newFeedName, setNewFeedName] = useState("");
  const [newFeedUrl, setNewFeedUrl] = useState("");
  type TestResult = { valid: boolean; itemCount?: number; sampleUrl?: string; error?: string } | "loading";
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});
  const [imgSrcTestResults, setImgSrcTestResults] = useState<Record<string, TestResult>>({});
  const [savingFeeds, setSavingFeeds] = useState(false);
  const [feedSaveMsg, setFeedSaveMsg] = useState<string | null>(null);

  // Storage stats
  const [storageMb, setStorageMb] = useState<number | null>(null);
  const [storageFiles, setStorageFiles] = useState<number>(0);

  // Image settings save
  const [savingImages, setSavingImages] = useState(false);
  const [imageSaveMsg, setImageSaveMsg] = useState<string | null>(null);

  // ── Data loading ─────────────────────────────────────────────────────────────

  const loadSection = useCallback(async (section: string) => {
    setLoading((l) => ({ ...l, [section]: true }));
    try {
      const res = await fetch(`/api/admin/pipeline/data?section=${section}`);
      const { data } = await res.json();
      if (section === "scrape") setScrape(data);
      if (section === "selection") {
        const normalized: SelectionData | null = data
          ? { ...data, articles: (data.articles ?? []).map(normalizeSelectedArticle) }
          : null;
        setSelection(normalized);
        // remove pending selections that are now in real data
        if (normalized?.articles) {
          const realUrls = new Set(normalized.articles.flatMap((a) => a.source_urls));
          setPendingSelections((p) => p.filter((a) => !a.source_urls.some((u) => realUrls.has(u))));
        }
      }
      if (section === "ready") {
        setReady(data);
        // clear pending generations that now appear in ready
        if (data?.articles) {
          const generatedUrls = new Set(
            (data.articles as ReadyArticle[]).flatMap((a) => a.source_urls ?? [])
          );
          setPendingGenerations((p) => new Set(Array.from(p).filter((u) => !generatedUrls.has(u))));
        }
        setPreview((prev) => {
          if (!prev || !data) return prev;
          const updated = (data as ReadyData).articles?.find((a) => a.slug === prev.slug);
          return updated ?? prev;
        });
      }
      if (section === "logs") setLogs(data ?? []);
    } finally {
      setLoading((l) => ({ ...l, [section]: false }));
    }
  }, []);

  useEffect(() => {
    loadSection("scrape");
    loadSection("selection");
    loadSection("ready");
    loadSection("logs");
    fetch("/api/admin/pipeline/storage")
      .then((r) => r.json())
      .then(({ totalMb, fileCount }: { totalMb: number | null; fileCount: number }) => {
        setStorageMb(totalMb);
        setStorageFiles(fileCount);
      })
      .catch(() => {});
  }, [loadSection]);

  useEffect(() => {
    const logTimer = setInterval(() => loadSection("logs"), 30000);
    const countdownTimer = setInterval(() => setCountdown(formatCountdown(nextRunRef.current)), 60000);
    setCountdown(formatCountdown(nextRunRef.current));
    return () => { clearInterval(logTimer); clearInterval(countdownTimer); };
  }, [loadSection]);

  useEffect(() => {
    nextRunRef.current = getNextRunTime(config);
    setCountdown(formatCountdown(nextRunRef.current));
  }, [config]);

  // ── Commands ─────────────────────────────────────────────────────────────────

  async function sendCommand(command: string, section: string, successMsg: string, payload?: object, cmdKey?: string) {
    const key = cmdKey ?? command;
    setCmdMsg(null);
    setLoading((l) => ({ ...l, [key]: true }));
    try {
      const res = await fetch("/api/admin/pipeline/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command, payload }),
      });
      if (res.ok) {
        setCmdMsg({ section, msg: `✅ ${successMsg} — Render will execute within ~60s.` });
        setTimeout(() => setCmdMsg(null), 8000);
      } else {
        const err = await res.json().catch(() => ({}));
        setCmdMsg({ section, msg: `❌ ${(err as { error?: string }).error ?? "Failed to send command."}` });
      }
    } catch {
      setCmdMsg({ section, msg: "❌ Network error." });
    } finally {
      setLoading((l) => ({ ...l, [key]: false }));
    }
  }

  // ── Config save ───────────────────────────────────────────────────────────────

  async function saveConfig() {
    setSaving(true); setSaveMsg(null);
    try {
      const res = await fetch("/api/admin/pipeline/config", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config }),
      });
      setSaveMsg(res.ok ? "✅ Saved — Render will update within ~60s." : "❌ Save failed.");
    } catch { setSaveMsg("❌ Network error."); }
    finally { setSaving(false); }
  }

  // ── Config helpers ────────────────────────────────────────────────────────────

  function setArticlesPerDay(n: number) {
    const times = Array.from({ length: n }, (_, i) => config.posting.specificTimes[i] ?? "09:00");
    setConfig((c) => ({ ...c, pipeline: { ...c.pipeline, articlesPerDay: n, minArticlesRequired: n }, posting: { ...c.posting, specificTimes: times } }));
  }

  function setSpecificTime(i: number, t: string) {
    const times = [...config.posting.specificTimes];
    times[i] = t;
    setConfig((c) => ({ ...c, posting: { ...c.posting, specificTimes: times } }));
  }

  // ── RSS feed helpers ──────────────────────────────────────────────────────────

  function addFeed() {
    if (!newFeedName.trim() || !newFeedUrl.trim()) return;
    setConfig((c) => ({ ...c, rssFeeds: [...(c.rssFeeds ?? []), { name: newFeedName.trim(), url: newFeedUrl.trim(), enabled: true }] }));
    setNewFeedName("");
    setNewFeedUrl("");
  }

  function removeFeed(index: number) {
    setConfig((c) => ({ ...c, rssFeeds: (c.rssFeeds ?? []).filter((_, i) => i !== index) }));
  }

  function toggleFeed(index: number) {
    setConfig((c) => ({ ...c, rssFeeds: (c.rssFeeds ?? []).map((f, i) => i === index ? { ...f, enabled: !f.enabled } : f) }));
  }

  async function testFeed(url: string) {
    setTestResults((r) => ({ ...r, [url]: "loading" }));
    try {
      const res = await fetch("/api/admin/pipeline/test-feed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      setTestResults((r) => ({ ...r, [url]: data }));
    } catch {
      setTestResults((r) => ({ ...r, [url]: { valid: false, error: "Network error" } }));
    }
  }

  async function saveFeedsConfig() {
    setSavingFeeds(true);
    setFeedSaveMsg(null);
    try {
      const res = await fetch("/api/admin/pipeline/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config }),
      });
      const body = await res.json();
      if (!res.ok) {
        setFeedSaveMsg(`❌ ${body.error ?? "Save failed"}`);
        return;
      }
      // Update local state with exactly what Supabase confirmed it saved
      if (body.config?.rssFeeds) {
        setConfig((c) => ({ ...c, rssFeeds: body.config.rssFeeds }));
        setFeedSaveMsg(`✅ ${body.config.rssFeeds.length} feeds saved.`);
      } else {
        setFeedSaveMsg("⚠️ Saved but rssFeeds missing from response — check Supabase.");
      }
    } catch { setFeedSaveMsg("❌ Network error."); }
    finally { setSavingFeeds(false); }
  }

  async function saveImageConfig() {
    setSavingImages(true);
    setImageSaveMsg(null);
    try {
      const res = await fetch("/api/admin/pipeline/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config }),
      });
      const body = await res.json();
      if (!res.ok) { setImageSaveMsg(`❌ ${body.error ?? "Save failed"}`); return; }
      setImageSaveMsg("✅ Image settings saved.");
    } catch { setImageSaveMsg("❌ Network error."); }
    finally { setSavingImages(false); }
  }

  // ── Image source helpers ──────────────────────────────────────────────────────

  function toggleSource(index: number) {
    setConfig((c) => ({
      ...c,
      images: {
        ...c.images,
        sources: (c.images.sources ?? DEFAULT_IMAGE_SOURCES).map((s, i) =>
          i === index ? { ...s, enabled: !s.enabled } : s
        ),
      },
    }));
  }

  function setSourceWeight(index: number, weight: number) {
    setConfig((c) => ({
      ...c,
      images: {
        ...c.images,
        sources: (c.images.sources ?? DEFAULT_IMAGE_SOURCES).map((s, i) =>
          i === index ? { ...s, weight: Math.max(0, weight) } : s
        ),
      },
    }));
  }

  function moveSource(from: number, to: number) {
    const sources = [...(config.images.sources ?? DEFAULT_IMAGE_SOURCES)];
    if (to < 0 || to >= sources.length) return;
    const [item] = sources.splice(from, 1);
    sources.splice(to, 0, item);
    setConfig((c) => ({ ...c, images: { ...c.images, sources } }));
  }

  async function testImageSource(name: SourceName) {
    setImgSrcTestResults((r) => ({ ...r, [name]: "loading" }));
    try {
      const res = await fetch("/api/admin/pipeline/test-image-source", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: name }),
      });
      const data = await res.json();
      setImgSrcTestResults((r) => ({ ...r, [name]: data }));
    } catch {
      setImgSrcTestResults((r) => ({ ...r, [name]: { valid: false, error: "Network error" } }));
    }
  }

  // ── Edit helpers ──────────────────────────────────────────────────────────────

  function openEdit(article: ReadyArticle) {
    setEditDraft({
      title: article.title,
      chapo: article.chapo,
      body: article.body,
      tags: article.tags,
      featured_image_url: article.featured_image_url ?? "",
      image_credit: article.image_credit ?? "",
    });
    setEditing(true);
  }

  async function saveEdit(slug: string) {
    await sendCommand("update_article", "ready", "Article updated", { slug, ...editDraft }, `edit_${slug}`);
    setEditing(false);
    setTimeout(() => loadSection("ready"), 10000);
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  const nextRun = nextRunRef.current;
  const selectionUrls = new Set([
    ...(selection?.articles ?? []).flatMap((a) => a.source_urls),
    ...Array.from(queuedUrls),
  ]);
  // merge real selection + pending optimistic entries (pending first so they appear at top)
  const allSelectionArticles: (SelectedArticle & { _pending?: boolean })[] = [
    ...pendingSelections.filter((p) => !selection?.articles?.some((a) => a.source_urls.some((u) => p.source_urls.includes(u)))).map((a) => ({ ...a, _pending: true as const })),
    ...(selection?.articles ?? []),
  ];
  const remaining = config.pipeline.articlesPerDay - allSelectionArticles.length;

  function SectionMsg({ section }: { section: string }) {
    if (cmdMsg?.section !== section) return null;
    return <p className="mt-2 text-xs text-gray-600">{cmdMsg.msg}</p>;
  }

  return (
    <div className="space-y-6">

      {/* ── Status Banner ─────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-5 flex-wrap">
            <span className="w-2.5 h-2.5 rounded-full bg-green-500 ring-4 ring-green-100 flex-shrink-0" />
            <div>
              <div className="text-xs text-gray-400">Next pipeline run</div>
              <div className="text-xl font-bold text-gray-900">
                {formatDate(nextRun, { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
              </div>
              <div className="text-xs text-gray-400">{countdown || formatCountdown(nextRun)}</div>
            </div>
            {scrape && (
              <>
                <div className="w-px h-10 bg-gray-200 hidden sm:block" />
                <div>
                  <div className="text-xs text-gray-400">Last scrape</div>
                  <div className="text-sm font-semibold">{scrape.total} articles</div>
                  <div className="text-xs text-gray-400">{formatDate(scrape.scraped_at, { hour: "2-digit", minute: "2-digit" })} Brussels</div>
                </div>
              </>
            )}
            {ready && (
              <>
                <div className="w-px h-10 bg-gray-200 hidden sm:block" />
                <div className="flex gap-4">
                  {[
                    { label: "Posted", val: ready.articles.filter(a => a.posted).length, color: "text-green-600" },
                    { label: "Pending", val: ready.articles.filter(a => !a.posted && !a.failed).length, color: "text-yellow-600" },
                    { label: "Failed", val: ready.articles.filter(a => a.failed).length, color: "text-red-500" },
                    { label: "Total", val: ready.total, color: "text-gray-800" },
                  ].map(({ label, val, color }) => (
                    <div key={label} className="text-center">
                      <div className={`text-xl font-bold leading-none ${color}`}>{val}</div>
                      <div className="text-xs text-gray-400 mt-0.5 uppercase tracking-wide">{label}</div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={() => {
                sendCommand("run_pipeline", "status", "Pipeline started — articles will be posted once generated");
                for (const d of [60000, 120000, 180000, 300000]) setTimeout(() => { loadSection("scrape"); loadSection("selection"); loadSection("ready"); }, d);
              }} disabled={loading["run_pipeline"]}
              className="border border-gray-300 hover:bg-gray-50 disabled:opacity-50 text-sm font-medium py-1.5 px-3 rounded transition-colors">
              {loading["run_pipeline"] ? "⏳ Queuing…" : "▶ Run pipeline now"}
            </button>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* ── Left column: Scrape history + AI Image Generation ─────────── */}
          <div className="space-y-5">
            {/* Scrape history */}
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Scrape history</div>
              {scrape?.history && scrape.history.length > 0 ? (
                <div className="max-h-36 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-white"><tr className="text-gray-400 text-left"><th className="pb-1 font-semibold">Date &amp; time</th><th className="pb-1 font-semibold">Articles</th><th className="pb-1 font-semibold">Source</th></tr></thead>
                  <tbody>
                    {scrape.history.map((h, i) => (
                      <tr key={i} className="border-t border-gray-100">
                        <td className="py-1">{formatDate(h.scraped_at, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}{i === 0 && <span className="ml-1 text-gray-400">(latest)</span>}</td>
                        <td className="py-1">{h.total}</td>
                        <td className="py-1"><span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${h.source === "manual" ? "bg-blue-50 text-blue-700" : "bg-green-50 text-green-700"}`}>{h.source === "manual" ? "manual" : "auto pipeline"}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              ) : (
                <p className="text-xs text-gray-400">No history yet — run a scrape first.</p>
              )}
            </div>

            {/* Image Sources */}
            <div className="pt-4 border-t border-gray-100">
              <div className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Image Sources</div>

              {/* Strategy selector */}
              <div className="mb-3">
                <div className="text-xs font-medium text-gray-500 mb-1">Strategy</div>
                <div className="flex gap-1 flex-wrap">
                  {(["priority", "weighted", "best-of-all"] as ImageStrategy[]).map((s) => (
                    <button
                      key={s}
                      onClick={() => setConfig((c) => ({ ...c, images: { ...c.images, strategy: s } }))}
                      className={`text-xs py-0.5 px-2 rounded border transition-colors ${
                        config.images.strategy === s
                          ? "border-blue-700 bg-blue-700 text-white"
                          : "border-gray-300 text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      {s === "priority" ? "Priority" : s === "weighted" ? "Weighted" : "Best of all"}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  {config.images.strategy === "priority" && "Try sources in order — move to the next if one finds nothing relevant."}
                  {config.images.strategy === "weighted" && "Pick a source by weight each run. Set a weight per source (any number); the % is auto-computed."}
                  {config.images.strategy === "best-of-all" && "Query all sources at once and pick the highest-scoring result. Needs AI scoring enabled."}
                </p>
              </div>

              {/* Source rows */}
              <div className="space-y-1 mb-3">
                {(config.images.sources ?? DEFAULT_IMAGE_SOURCES).map((src, i) => {
                  const sources = config.images.sources ?? DEFAULT_IMAGE_SOURCES;
                  const enabledSources = sources.filter((s) => s.enabled);
                  const totalWeight = enabledSources.reduce((sum, s) => sum + (s.weight || 0), 0);
                  const pct = totalWeight > 0 && src.enabled ? Math.round((src.weight / totalWeight) * 100) : 0;
                  const enabledRank = src.enabled ? enabledSources.findIndex((s) => s.name === src.name) + 1 : null;
                  const testResult = imgSrcTestResults[src.name];
                  return (
                    <div key={src.name} className="flex items-center gap-1.5 text-xs">
                      {/* Up / Down */}
                      <div className="flex flex-col -space-y-0.5">
                        <button onClick={() => moveSource(i, i - 1)} disabled={i === 0} className="text-gray-300 hover:text-gray-500 disabled:opacity-20 leading-none" title="Move up">▲</button>
                        <button onClick={() => moveSource(i, i + 1)} disabled={i === sources.length - 1} className="text-gray-300 hover:text-gray-500 disabled:opacity-20 leading-none" title="Move down">▼</button>
                      </div>
                      {/* Enable toggle */}
                      <button
                        onClick={() => toggleSource(i)}
                        className={`relative w-7 h-3.5 rounded-full transition-colors flex-shrink-0 ${src.enabled ? "bg-green-500" : "bg-gray-300"}`}
                        title={src.enabled ? "Enabled" : "Disabled"}
                      >
                        <span className={`absolute top-0.5 w-2.5 h-2.5 bg-white rounded-full shadow transition-transform ${src.enabled ? "translate-x-[14px]" : "translate-x-0.5"}`} />
                      </button>
                      {/* Name + rank */}
                      <span className={`w-20 font-medium ${src.enabled ? "text-gray-700" : "text-gray-400"}`}>
                        {src.name.charAt(0).toUpperCase() + src.name.slice(1)}
                      </span>
                      {/* Weight (weighted mode) */}
                      {config.images.strategy === "weighted" && (
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min={0}
                            value={src.weight}
                            onChange={(e) => setSourceWeight(i, Number(e.target.value))}
                            className="w-12 border border-gray-300 rounded px-1 py-0 text-xs text-center"
                          />
                          <span className="text-gray-400 w-7 text-right">{pct}%</span>
                        </div>
                      )}
                      {/* Priority rank */}
                      {config.images.strategy === "priority" && (
                        <span className="text-gray-400 w-5">{enabledRank ? `#${enabledRank}` : "—"}</span>
                      )}
                      {/* Test button */}
                      <button
                        onClick={() => testImageSource(src.name)}
                        disabled={testResult === "loading"}
                        className={`text-xs py-0.5 px-2 rounded border transition-colors disabled:opacity-50 ml-auto ${
                          testResult && testResult !== "loading" && (testResult as { valid: boolean }).valid
                            ? "border-green-300 text-green-700 bg-green-50"
                            : testResult && testResult !== "loading"
                            ? "border-red-300 text-red-700 bg-red-50"
                            : "border-gray-300 hover:bg-gray-50 text-gray-600"
                        }`}
                        title={
                          testResult && testResult !== "loading"
                            ? (testResult as { valid: boolean; sampleUrl?: string; error?: string }).valid
                              ? (testResult as { sampleUrl?: string }).sampleUrl
                              : (testResult as { error?: string }).error
                            : undefined
                        }
                      >
                        {testResult === "loading" ? "…" : testResult && (testResult as { valid: boolean }).valid ? "✓" : testResult ? "✗" : "Test"}
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* AI Scoring & Fallback */}
              <div className="flex items-center justify-between mb-2 pt-3 border-t border-gray-100">
                <div className="text-xs font-bold uppercase tracking-wider text-gray-400">AI Relevance Scoring</div>
                <button
                  onClick={() => setConfig((c) => ({ ...c, images: { ...c.images, enabled: !c.images.enabled } }))}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0 ${config.images.enabled ? "bg-blue-700" : "bg-gray-300"}`}
                  title={config.images.enabled ? "Enabled — click to disable" : "Disabled — click to enable"}
                >
                  <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${config.images.enabled ? "translate-x-4" : "translate-x-1"}`} />
                </button>
              </div>

              {!config.images.enabled ? (
                <p className="text-xs text-gray-400 mb-3">When enabled, Claude scores each image for relevance and skips low-scoring ones. DALL-E 3 is always used as a last resort when all sources fail.</p>
              ) : (
                <>
                  {/* Sensitivity slider */}
                  <div className="mb-3">
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-medium text-gray-500">Replacement sensitivity</label>
                      <span className="text-xs font-semibold text-gray-700">{config.images.relevanceThreshold}/10</span>
                    </div>
                    <input
                      type="range" min={1} max={10} step={1}
                      value={config.images.relevanceThreshold}
                      onChange={(e) => setConfig((c) => ({ ...c, images: { ...c.images, relevanceThreshold: Number(e.target.value) } }))}
                      className="w-full accent-blue-700"
                    />
                    <div className="flex justify-between text-xs text-gray-400 mt-0.5">
                      <span>Low (rarely replaced)</span>
                      <span>High (easily replaced)</span>
                    </div>
                  </div>

                  {/* Style */}
                  <div className="mb-3">
                    <label className="block text-xs font-medium text-gray-500 mb-1">Image style</label>
                    <textarea
                      rows={2}
                      value={config.images.generationStyle}
                      onChange={(e) => setConfig((c) => ({ ...c, images: { ...c.images, generationStyle: e.target.value } }))}
                      className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs resize-none"
                      placeholder="photorealistic editorial news photo, professional lighting, no text overlay, no logo"
                    />
                  </div>

                  {/* Cost & stats */}
                  {(() => {
                    const costLog = config.images.costLog ?? {};
                    const now = new Date();
                    const todayStr = now.toISOString().slice(0, 10);
                    const monday = new Date(now); monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
                    const mondayStr = monday.toISOString().slice(0, 10);
                    const monthStr = now.toISOString().slice(0, 7);
                    let todayCount = 0, weekCount = 0, monthCount = 0, totalCount = 0;
                    for (const [d, n] of Object.entries(costLog)) {
                      totalCount += n;
                      if (d === todayStr) todayCount += n;
                      if (d >= mondayStr) weekCount += n;
                      if (d.startsWith(monthStr)) monthCount += n;
                    }
                    return (
                      <div className="border-t border-gray-100 pt-2 space-y-1 mb-3">
                        <div className="flex justify-between text-xs"><span className="text-gray-400">Model</span><span className="font-medium text-gray-700">DALL-E 3 standard · $0.04/image</span></div>
                        <div className="flex justify-between text-xs"><span className="text-gray-400">Today</span><span className="font-medium text-gray-700">{todayCount} image{todayCount !== 1 ? "s" : ""} · ${(todayCount * 0.04).toFixed(2)}</span></div>
                        <div className="flex justify-between text-xs"><span className="text-gray-400">This week</span><span className="font-medium text-gray-700">{weekCount} image{weekCount !== 1 ? "s" : ""} · ${(weekCount * 0.04).toFixed(2)}</span></div>
                        <div className="flex justify-between text-xs"><span className="text-gray-400">This month</span><span className="font-medium text-gray-700">{monthCount} image{monthCount !== 1 ? "s" : ""} · ${(monthCount * 0.04).toFixed(2)}</span></div>
                        <div className="flex justify-between text-xs"><span className="text-gray-400">All time</span><span className="font-medium text-gray-700">{totalCount} image{totalCount !== 1 ? "s" : ""} · ${(totalCount * 0.04).toFixed(2)}</span></div>
                        <div className="flex justify-between text-xs"><span className="text-gray-400">Storage</span><span className="font-medium text-gray-700">{storageMb !== null ? `${storageMb} MB (${storageFiles} file${storageFiles !== 1 ? "s" : ""})` : "—"}</span></div>
                      </div>
                    );
                  })()}
                </>
              )}

              <div className="flex items-center gap-3">
                <button onClick={saveImageConfig} disabled={savingImages} className="border border-blue-700 text-blue-700 hover:bg-blue-50 disabled:opacity-50 text-xs font-medium py-1 px-3 rounded transition-colors">{savingImages ? "Saving…" : "Save image settings"}</button>
                {imageSaveMsg && <span className="text-xs text-gray-600">{imageSaveMsg}</span>}
              </div>
            </div>
          </div>

          {/* ── Right column: RSS Sources + Topic convergence ───────────────── */}
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">RSS Sources <span className="font-normal normal-case text-gray-300">({(config.rssFeeds ?? []).length} loaded)</span></div>
            <div className="max-h-48 overflow-y-auto">
            <table className="w-full text-xs mb-2">
              <thead>
                <tr className="text-left text-gray-400 border-b border-gray-100">
                  <th className="pb-1 font-semibold">Source</th>
                  <th className="pb-1 font-semibold">Active</th>
                  <th className="pb-1 font-semibold"></th>
                </tr>
              </thead>
              <tbody>
                {(config.rssFeeds ?? []).map((feed, i) => {
                  const result = testResults[feed.url];
                  return (
                    <tr key={i} className="border-b border-gray-50">
                      <td className="py-1.5 pr-2">
                        <div className="font-medium">{feed.name}</div>
                        <div className="text-gray-400 truncate max-w-[160px]" title={feed.url}>{feed.url}</div>
                      </td>
                      <td className="py-1.5 pr-2">
                        <button onClick={() => toggleFeed(i)} className={`relative w-8 h-4 rounded-full transition-colors ${feed.enabled ? "bg-green-500" : "bg-gray-300"}`}>
                          <span className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${feed.enabled ? "translate-x-4" : "translate-x-0.5"}`} />
                        </button>
                      </td>
                      <td className="py-1.5">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => testFeed(feed.url)}
                            disabled={result === "loading"}
                            className={`text-xs py-0.5 px-2 rounded border transition-colors disabled:opacity-50 ${
                              result && result !== "loading" && (result as {valid:boolean}).valid
                                ? "border-green-300 text-green-700 bg-green-50"
                                : result && result !== "loading"
                                ? "border-red-300 text-red-700 bg-red-50"
                                : "border-gray-300 hover:bg-gray-50 text-gray-600"
                            }`}
                            title={result && result !== "loading" && !(result as {valid:boolean}).valid ? (result as {error?:string}).error : undefined}
                          >
                            {result === "loading" ? "…" : result && (result as {valid:boolean}).valid ? `✓ ${(result as {itemCount?:number}).itemCount}` : result ? "✗" : "Test"}
                          </button>
                          <button onClick={() => removeFeed(i)} className="text-red-400 hover:text-red-600 px-1" title="Remove">✕</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
            {/* Add feed */}
            <div className="flex gap-2 items-end pt-2 border-t border-gray-100 flex-wrap">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Name</label>
                <input value={newFeedName} onChange={(e) => setNewFeedName(e.target.value)} placeholder="Le Soir" className="border border-gray-300 rounded px-2 py-1.5 text-xs w-24" />
              </div>
              <div className="flex-1 min-w-[140px]">
                <label className="block text-xs font-medium text-gray-500 mb-1">URL</label>
                <input value={newFeedUrl} onChange={(e) => setNewFeedUrl(e.target.value)} placeholder="https://…/rss" className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs" />
              </div>
              <button onClick={addFeed} disabled={!newFeedName.trim() || !newFeedUrl.trim()} className="bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white text-xs font-medium py-1.5 px-2.5 rounded transition-colors">Add</button>
            </div>
            {/* Topic convergence */}
            <div className="mt-3 pt-3 border-t border-gray-100">
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-gray-500">Topic convergence weight</label>
                <span className="text-xs font-semibold text-gray-700">{config.pipeline.topicRepetitionWeight ?? 5}/10</span>
              </div>
              <input
                type="range" min={0} max={10} step={1}
                value={config.pipeline.topicRepetitionWeight ?? 5}
                onChange={(e) => setConfig((c) => ({ ...c, pipeline: { ...c.pipeline, topicRepetitionWeight: Number(e.target.value) } }))}
                className="w-full accent-blue-700"
              />
              <div className="flex justify-between text-xs text-gray-400 mt-0.5">
                <span>Diversity</span>
                <span>Convergence</span>
              </div>
              <p className="text-xs text-gray-400 mt-1">Low: Claude ignores source overlap and picks based on editorial variety. High: Claude strongly favors topics covered by multiple sources simultaneously, treating that overlap as a signal the story matters. Saved with &quot;Save RSS sources&quot;.</p>
            </div>
            {/* Article structure */}
            <div className="mt-3 pt-3 border-t border-gray-100">
              <label className="text-xs font-medium text-gray-500 block mb-2">Article structure</label>
              {/* Mode selector */}
              <div className="flex gap-1 bg-gray-100 border border-gray-200 rounded-lg p-1 mb-3">
                {(["fixed", "auto", "per-journalist"] as StructureMode[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => setConfig((c) => ({
                      ...c,
                      articleStructure: { ...c.articleStructure, mode: m } as NonNullable<typeof c.articleStructure>,
                    }))}
                    className={`py-1 px-2.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                      (config.articleStructure?.mode ?? "fixed") === m
                        ? "bg-white shadow text-gray-900"
                        : "text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    {m === "fixed" ? "Fixed" : m === "auto" ? "Auto (Claude picks)" : "Per journalist"}
                  </button>
                ))}
              </div>

              {/* Fixed mode: single dropdown */}
              {(config.articleStructure?.mode ?? "fixed") === "fixed" && (
                <div>
                  <select
                    value={config.articleStructure?.fixed ?? "pyramide-inversee"}
                    onChange={(e) => setConfig((c) => ({
                      ...c,
                      articleStructure: { ...(c.articleStructure ?? {}), fixed: e.target.value as StructureId } as NonNullable<typeof c.articleStructure>,
                    }))}
                    className="border border-gray-300 rounded px-2 py-1.5 text-xs w-full mb-1"
                  >
                    {STRUCTURE_LIST.map((s) => (
                      <option key={s.id} value={s.id}>{s.label}</option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-400">
                    {STRUCTURE_LIST.find((s) => s.id === (config.articleStructure?.fixed ?? "pyramide-inversee"))?.description}
                  </p>
                </div>
              )}

              {/* Auto mode: multi-checkbox allowlist */}
              {config.articleStructure?.mode === "auto" && (
                <div>
                  <p className="text-xs text-gray-500 mb-1.5">Structures Claude can choose from:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {STRUCTURE_LIST.map((s) => {
                      const allowlist = config.articleStructure?.allowlist ?? STRUCTURE_LIST.map((x) => x.id);
                      const checked = allowlist.includes(s.id);
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => {
                            const current = config.articleStructure?.allowlist ?? STRUCTURE_LIST.map((x) => x.id);
                            const next = checked
                              ? current.filter((id) => id !== s.id)
                              : [...current, s.id];
                            if (next.length === 0) return;
                            setConfig((c) => ({
                              ...c,
                              articleStructure: { ...(c.articleStructure ?? {}), allowlist: next } as NonNullable<typeof c.articleStructure>,
                            }));
                          }}
                          className={`px-2 py-0.5 text-xs rounded border transition-colors ${
                            checked
                              ? "bg-blue-700 text-white border-blue-700"
                              : "bg-white text-gray-600 border-gray-300 hover:border-blue-700"
                          }`}
                        >
                          {s.label}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-gray-400 mt-1">Claude picks the best-fitting structure for each article. At least one must remain selected.</p>
                </div>
              )}

              {/* Per-journalist mode: info */}
              {config.articleStructure?.mode === "per-journalist" && (
                <div className="text-xs text-gray-500 space-y-1">
                  <p>Each journalist&apos;s assigned structure is used. Journalists without an assignment fall back to <em>Pyramide inversée</em>.</p>
                  <p>
                    Set per journalist in{" "}
                    <a href="/admin/equipe" className="text-blue-700 underline">Admin → Équipe</a>.
                  </p>
                </div>
              )}

              <p className="text-xs text-gray-400 mt-2">Saved with &quot;Save RSS sources&quot;.</p>
            </div>
            <div className="flex items-center gap-3 mt-3">
              <button onClick={saveFeedsConfig} disabled={savingFeeds} className="border border-blue-700 text-blue-700 hover:bg-blue-50 disabled:opacity-50 text-xs font-medium py-1 px-3 rounded transition-colors">{savingFeeds ? "Saving…" : "Save RSS sources"}</button>
              {feedSaveMsg && <span className="text-xs text-gray-600">{feedSaveMsg}</span>}
            </div>
          </div>
        </div>
        <SectionMsg section="status" />
      </div>

      {/* ── Configuration ─────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-4">Configuration</h2>

        {/* All schedule fields in one row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Timezone</label>
            <select value={config.schedule.timezone} onChange={(e) => setConfig((c) => ({ ...c, schedule: { ...c.schedule, timezone: e.target.value } }))} className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs">
              <option value="Europe/Brussels">Europe/Brussels</option>
              <option value="Europe/Paris">Europe/Paris</option>
              <option value="Europe/London">Europe/London</option>
              <option value="UTC">UTC</option>
              <option value="America/New_York">America/New_York</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Trigger time</label>
            <input type="time" value={config.schedule.time} onChange={(e) => setConfig((c) => ({ ...c, schedule: { ...c.schedule, time: e.target.value } }))} className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Articles / day</label>
            <input type="number" min={1} max={20} value={config.pipeline.articlesPerDay} onChange={(e) => setArticlesPerDay(Number(e.target.value))} className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Min required</label>
            <input type="number" min={1} max={20} value={config.pipeline.minArticlesRequired} onChange={(e) => setConfig((c) => ({ ...c, pipeline: { ...c.pipeline, minArticlesRequired: Number(e.target.value) } }))} className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs" />
          </div>
        </div>

        <div className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2 pt-3 border-t border-gray-100">Posting schedule</div>
        <div className="flex items-center gap-4 mb-3 flex-wrap">
          <div className="flex gap-1 bg-gray-100 border border-gray-200 rounded-lg p-1">
            {(["interval", "same-time", "random", "specific"] as PostingMode[]).map((m) => (
              <button key={m} onClick={() => setConfig((c) => ({ ...c, posting: { ...c.posting, mode: m } }))}
                className={`py-1 px-2.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${config.posting.mode === m ? "bg-white shadow text-gray-900" : "text-gray-500 hover:text-gray-700"}`}>
                {m === "same-time" ? "Same time" : m.charAt(0).toUpperCase() + m.slice(1)}
              </button>
            ))}
          </div>
          {/* inline mode fields */}
          {config.posting.mode === "interval" && (
            <div className="flex gap-3">
              <div><label className="block text-xs font-medium text-gray-500 mb-1">First post</label><input type="time" value={config.posting.firstPostTime} onChange={(e) => setConfig((c) => ({ ...c, posting: { ...c.posting, firstPostTime: e.target.value } }))} className="border border-gray-300 rounded px-2 py-1.5 text-xs" /></div>
              <div><label className="block text-xs font-medium text-gray-500 mb-1">Every (min)</label><input type="number" min={1} value={config.posting.intervalMinutes} onChange={(e) => setConfig((c) => ({ ...c, posting: { ...c.posting, intervalMinutes: Number(e.target.value) } }))} className="w-20 border border-gray-300 rounded px-2 py-1.5 text-xs" /></div>
            </div>
          )}
          {config.posting.mode === "same-time" && (
            <div><label className="block text-xs font-medium text-gray-500 mb-1">Post at</label><input type="time" value={config.posting.firstPostTime} onChange={(e) => setConfig((c) => ({ ...c, posting: { ...c.posting, firstPostTime: e.target.value } }))} className="border border-gray-300 rounded px-2 py-1.5 text-xs" /></div>
          )}
          {config.posting.mode === "random" && (
            <div className="flex gap-3">
              <div><label className="block text-xs font-medium text-gray-500 mb-1">First post</label><input type="time" value={config.posting.firstPostTime} onChange={(e) => setConfig((c) => ({ ...c, posting: { ...c.posting, firstPostTime: e.target.value } }))} className="border border-gray-300 rounded px-2 py-1.5 text-xs" /></div>
              <div><label className="block text-xs font-medium text-gray-500 mb-1">Min (min)</label><input type="number" min={1} value={config.posting.randomMin} onChange={(e) => setConfig((c) => ({ ...c, posting: { ...c.posting, randomMin: Number(e.target.value) } }))} className="w-16 border border-gray-300 rounded px-2 py-1.5 text-xs" /></div>
              <div><label className="block text-xs font-medium text-gray-500 mb-1">Max (min)</label><input type="number" min={1} value={config.posting.randomMax} onChange={(e) => setConfig((c) => ({ ...c, posting: { ...c.posting, randomMax: Number(e.target.value) } }))} className="w-16 border border-gray-300 rounded px-2 py-1.5 text-xs" /></div>
            </div>
          )}
        </div>
        {config.posting.mode === "specific" && (
          <div className="grid grid-cols-4 gap-2 mb-3 max-w-sm">
            {Array.from({ length: config.pipeline.articlesPerDay }).map((_, i) => (
              <div key={i}><label className="block text-xs font-medium text-gray-500 mb-1">#{i + 1}</label><input type="time" value={config.posting.specificTimes[i] ?? "09:00"} onChange={(e) => setSpecificTime(i, e.target.value)} className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs" /></div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-4 pt-3 border-t border-gray-100 mt-4">
          <button onClick={saveConfig} disabled={saving} className="bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white text-sm font-medium py-1.5 px-4 rounded transition-colors">{saving ? "Saving…" : "Save configuration"}</button>
          {saveMsg && <span className="text-sm text-gray-600">{saveMsg}</span>}
        </div>
      </div>

      {/* ── Sourced Articles ───────────────────────────────────────────────────── */}
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400">Sourced articles</h2>
          <div className="flex items-center gap-2 flex-wrap">
            {cmdMsg?.section === "sourced" && (
              <span className="text-xs text-gray-600">{cmdMsg.msg}</span>
            )}
            <button
              disabled={loading["clear_scrape"]}
              onClick={() => {
                if (!confirm("Clear all sourced articles?")) return;
                setScrape(null);
                sendCommand("clear_scrape", "sourced", "Scrape data cleared");
              }}
              className="border border-red-200 hover:bg-red-50 disabled:opacity-50 text-xs font-medium py-1 px-2.5 rounded text-red-600 transition-colors">
              ✕ Clear
            </button>
            <button
              disabled={loading["scrape_now"]}
              onClick={async () => {
                await sendCommand("scrape_now", "sourced", "Scrape started");
                setTimeout(() => loadSection("scrape"), 25000);
              }}
              className="border border-gray-300 hover:bg-gray-50 disabled:opacity-50 text-xs font-medium py-1 px-2.5 rounded transition-colors flex items-center gap-1.5">
              {loading["scrape_now"]
                ? <><span className="animate-spin inline-block w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full" /> Scraping…</>
                : "⟳ Scrape now"}
            </button>
          </div>
        </div>

        {loading.scrape && <p className="text-sm text-gray-400">Loading…</p>}
        {!loading.scrape && !scrape && <p className="text-sm text-gray-400">No data — run a scrape first.</p>}
        {scrape && scrape.articles.length > 0 && (
          <ul className="max-h-80 overflow-y-auto divide-y divide-gray-100">
            {scrape.articles.map((a, i) => {
              const added = selectionUrls.has(a.url);
              const isQueuing = loading[`add_${a.url}`];
              return (
                <li key={i} className="flex items-start gap-3 py-2">
                  {a.thumbnail_url
                    /* eslint-disable-next-line @next/next/no-img-element */
                    ? <img src={a.thumbnail_url} alt="" className="w-12 h-9 object-cover rounded flex-shrink-0" onError={(e) => (e.currentTarget.style.display = "none")} />
                    : <div className="w-12 h-9 bg-gray-100 rounded flex-shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <a href={a.url} target="_blank" rel="noreferrer" className="text-xs font-medium text-gray-800 hover:underline line-clamp-2">{a.headline}</a>
                    <div className="text-xs text-gray-400 mt-0.5 flex flex-wrap gap-x-2">
                      <span>{a.source}</span>
                      {a.published_at && <span>Published {formatDate(a.published_at, { hour: "2-digit", minute: "2-digit" })}</span>}
                      <span>Scraped {formatDate(scrape.scraped_at, { hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                  </div>
                  <button
                    disabled={added || isQueuing}
                    onClick={async () => {
                      setQueuedUrls((s) => new Set([...Array.from(s), a.url]));
                      // add optimistically to selection section immediately
                      setPendingSelections((p) => [...p, {
                        source_urls: [a.url],
                        headlines: [a.headline],
                        angle: "",
                        category: "politique",
                        image_keywords: ["news", "belgium", "press"],
                        added_by: "manual",
                      }]);
                      await sendCommand("add_to_selection", "sourced",
                        `"${a.headline.slice(0, 50)}" queued for selection`,
                        { source_url: a.url, headline: a.headline },
                        `add_${a.url}`
                      );
                      for (const d of [15000, 30000, 60000]) setTimeout(() => loadSection("selection"), d);
                    }}
                    className={`flex-shrink-0 text-xs font-medium px-2 py-1 rounded border transition-colors whitespace-nowrap ${
                      added ? "opacity-60 cursor-default bg-green-50 text-green-700 border-green-200"
                      : isQueuing ? "opacity-60 cursor-default bg-gray-50 text-gray-500 border-gray-200"
                      : "bg-white hover:bg-gray-50 border-gray-300 text-gray-700"}`}>
                    {added ? "✓ queued" : isQueuing ? "⏳…" : "+ select"}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* ── Article Selection ──────────────────────────────────────────────────── */}
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400">Editorial selection</h2>
          <div className="flex gap-2 flex-wrap">
            <button disabled={loading["refresh_selection"]}
              onClick={() => { sendCommand("refresh_selection", "selection", "Selection refresh started"); setTimeout(() => loadSection("selection"), 35000); }}
              className="border border-gray-300 hover:bg-gray-50 disabled:opacity-50 text-xs font-medium py-1 px-2.5 rounded transition-colors">
              {loading["refresh_selection"] ? "⏳ Running…" : "↺ Refresh selection"}
            </button>
            {remaining > 0 && (
              <button disabled={loading["add_more"]}
                onClick={() => { sendCommand("refresh_selection", "selection", `Adding ${remaining} more articles`, undefined, "add_more"); setTimeout(() => loadSection("selection"), 35000); }}
                className="border border-gray-300 hover:bg-gray-50 disabled:opacity-50 text-xs font-medium py-1 px-2.5 rounded transition-colors">
                {loading["add_more"] ? "⏳ Running…" : `+ Add ${remaining} more`}
              </button>
            )}
            <button disabled={loading["clear_selection"]}
              onClick={() => { if (!confirm("Clear all selected articles?")) return; sendCommand("clear_selection", "selection", "Selection cleared"); setTimeout(() => { loadSection("selection"); setQueuedUrls(new Set()); }, 5000); }}
              className="border border-red-200 hover:bg-red-50 disabled:opacity-50 text-xs font-medium py-1 px-2.5 rounded text-red-600 transition-colors">
              ✕ Clear
            </button>
          </div>
        </div>

        {loading.selection && allSelectionArticles.length === 0 && <p className="text-sm text-gray-400">Loading…</p>}
        {!loading.selection && allSelectionArticles.length === 0 && (
          <p className="text-sm text-gray-400">No articles selected — use &quot;+ select&quot; on articles above, or click &quot;Refresh selection&quot;.</p>
        )}
        {allSelectionArticles.length > 0 && (
          <>
            {selection && (
              <p className="text-xs text-gray-400 mb-3">Updated {formatDate(selection.selected_at, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} — {allSelectionArticles.length}/{config.pipeline.articlesPerDay} articles</p>
            )}
            <ul className="divide-y divide-gray-100 mb-4">
              {allSelectionArticles.map((a, i) => {
                const isPending = a._pending === true;
                const isManual = a.added_by === "manual";
                const primaryUrl = a.source_urls[0];
                const isGenerated = ready?.articles.some((r) => r.source_urls?.some((u) => a.source_urls.includes(u)));
                const isQueued = pendingGenerations.has(primaryUrl);
                return (
                  <li key={i} className={`flex items-center gap-3 py-2 ${isPending ? "opacity-60" : ""}`}>
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isPending ? "bg-gray-400" : isManual ? "bg-yellow-400" : "bg-green-500"}`} />
                    <span className="flex-1 text-xs truncate" title={a.headlines[0]}>
                      {a.headlines[0]}
                      {a.source_urls.length > 1 && <span className="ml-1 text-gray-400">({a.source_urls.length} sources)</span>}
                    </span>
                    <span className="text-xs text-gray-400 flex-shrink-0 w-20">{isPending ? "—" : a.category}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded font-semibold flex-shrink-0 ${
                      isPending ? "bg-gray-100 text-gray-500"
                      : isManual ? "bg-yellow-50 text-yellow-700"
                      : "bg-green-50 text-green-700"}`}>
                      {isPending ? "⏳ queued" : isManual ? "manual" : "claude"}
                    </span>
                    <button disabled={!!isGenerated || isQueued || loading[`gen_${primaryUrl}`] || isPending}
                      onClick={() => {
                        const url = primaryUrl;
                        setPendingGenerations((p) => new Set([...Array.from(p), url]));
                        sendCommand("generate_article", "selection", "Article generation queued", {
                          source_url: url,
                          headline: a.headlines[0],
                          angle: a.angle,
                          category: a.category,
                          image_keywords: a.image_keywords,
                        }, `gen_${url}`);
                        // Poll ready section until article appears (every 20s, up to 3min)
                        for (const delay of [20000, 40000, 70000, 110000, 160000]) {
                          setTimeout(() => loadSection("ready"), delay);
                        }
                        // Timeout: clear pending state after 5 min if nothing appeared
                        setTimeout(() => setPendingGenerations((p) => { const n = new Set(Array.from(p)); n.delete(url); return n; }), 300000);
                      }}
                      className={`text-xs font-medium px-2 py-1 rounded border transition-colors flex-shrink-0 ${
                        isGenerated ? "opacity-50 cursor-default bg-green-50 text-green-700 border-green-200"
                        : (isQueued || loading[`gen_${primaryUrl}`]) ? "opacity-70 cursor-default bg-orange-50 text-orange-700 border-orange-200"
                        : isPending ? "opacity-40 cursor-not-allowed bg-gray-50 border-gray-200 text-gray-400"
                        : "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100"}`}>
                      {isGenerated ? "✓ generated" : (isQueued || loading[`gen_${primaryUrl}`]) ? "⏳ in progress…" : "✦ Generate"}
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
              <button disabled={loading["generate_all"]}
                onClick={() => { sendCommand("generate_all", "selection", "Generating all articles"); for (const d of [30000, 70000, 120000, 180000]) setTimeout(() => loadSection("ready"), d); }}
                className="bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white text-sm font-medium py-2 px-4 rounded transition-colors">
                {loading["generate_all"] ? "⏳ Queuing…" : "✦ Generate all articles"}
              </button>
            </div>
          </>
        )}
        <SectionMsg section="selection" />
      </div>

      {/* ── Ready to Post ──────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400">Ready to post</h2>
          <div className="flex gap-2">
            <button onClick={() => loadSection("ready")} className="border border-gray-300 hover:bg-gray-50 text-xs font-medium py-1 px-2.5 rounded transition-colors">Refresh</button>
            <button disabled={loading["clear_ready"]}
              onClick={() => {
                if (!confirm("Delete all ready articles? This cannot be undone.")) return;
                setReady(null);
                sendCommand("clear_ready", "ready", "Ready list cleared");
              }}
              className="border border-red-200 hover:bg-red-50 disabled:opacity-50 text-xs font-medium py-1 px-2.5 rounded text-red-600 transition-colors">
              ✕ Clear
            </button>
          </div>
        </div>

        {loading.ready && <p className="text-sm text-gray-400">Loading…</p>}
        {!loading.ready && !ready?.articles?.length && <p className="text-sm text-gray-400">No articles — generate them from the selection above.</p>}
        {ready && ready.articles.length > 0 && (() => {
          const unposted = ready.articles.filter((a) => !a.posted && !a.failed);
          const postedCount = ready.articles.filter((a) => a.posted).length;
          const failedCount = ready.articles.filter((a) => a.failed).length;
          return (
            <>
              <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-100 flex-wrap">
                <button disabled={unposted.length === 0 || loading["post_now"]}
                  onClick={() => { if (!confirm(`Post all ${unposted.length} unposted article(s) right now?`)) return; sendCommand("post_now", "ready", "Posting all due articles"); setTimeout(() => loadSection("ready"), 30000); }}
                  className="bg-blue-700 hover:bg-blue-800 disabled:opacity-40 text-white text-xs font-medium py-1.5 px-3 rounded transition-colors">
                  {loading["post_now"] ? "⏳ Queuing…" : `↑ Post all now (${unposted.length})`}
                </button>
                <button disabled={unposted.length === 0 || loading["reschedule_articles"]}
                  onClick={() => { if (!confirm(`Reschedule ${unposted.length} article(s) starting now with ${config.posting.intervalMinutes}min intervals?`)) return; sendCommand("reschedule_articles", "ready", "Articles rescheduled with intervals"); setTimeout(() => loadSection("ready"), 10000); }}
                  className="border border-gray-300 hover:bg-gray-50 disabled:opacity-40 text-xs font-medium py-1.5 px-3 rounded transition-colors">
                  {loading["reschedule_articles"] ? "⏳ Queuing…" : `⏱ Post with ${config.posting.intervalMinutes}min intervals`}
                </button>
                <span className="ml-auto text-xs text-gray-400">{postedCount} posted · {failedCount} failed · {unposted.length} pending</span>
              </div>
              <ul className="divide-y divide-gray-100 mb-4">
                {ready.articles.map((a) => {
                  const dot = a.posted ? "bg-green-500" : a.failed ? "bg-red-400" : "bg-yellow-400";
                  const badge = a.posted ? "bg-green-50 text-green-700" : a.failed ? "bg-red-50 text-red-700" : "bg-yellow-50 text-yellow-700";
                  const badgeText = a.posted ? "posted" : a.failed ? "failed" : "pending";
                  const timeStr = a.posted && a.posted_at ? `Posted ${formatDate(a.posted_at, { hour: "2-digit", minute: "2-digit" })}` : `Sched. ${formatDate(a.scheduled_for, { hour: "2-digit", minute: "2-digit" })}`;
                  return (
                    <li key={a.slug} className="flex items-center gap-3 py-2 cursor-pointer hover:bg-gray-50 rounded px-1 -mx-1" onClick={() => { setPreview(a); setEditing(false); }}>
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dot}`} />
                      <span className="flex-1 text-xs truncate font-medium" title={a.title}>{a.title}</span>
                      <span className="text-xs text-gray-400 flex-shrink-0 w-20">{a.category}</span>
                      <input type="time" defaultValue={toBrusselsTime(a.scheduled_for).slice(11, 16)} disabled={a.posted}
                        className="text-xs border border-gray-200 rounded px-1.5 py-0.5 w-20 flex-shrink-0 disabled:opacity-40"
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => { const d = toBrusselsTime(a.scheduled_for).slice(0, 10); setPendingTimes((p) => ({ ...p, [a.slug]: `${d}T${e.target.value}:00` })); }} />
                      <span className={`text-xs px-1.5 py-0.5 rounded font-semibold flex-shrink-0 w-14 text-center ${badge}`}>{badgeText}</span>
                      <span className="text-xs text-gray-400 flex-shrink-0 w-36 text-right">{timeStr}</span>
                      <button disabled={a.posted || loading[`post_${a.slug}`]}
                        onClick={(e) => { e.stopPropagation(); sendCommand("post_article", "ready", `"${a.title.slice(0, 40)}" posted`, { slug: a.slug }, `post_${a.slug}`); setTimeout(() => loadSection("ready"), 30000); }}
                        className={`text-xs font-medium px-2 py-1 rounded border flex-shrink-0 transition-colors ${a.posted ? "opacity-50 cursor-default bg-green-50 text-green-700 border-green-200" : loading[`post_${a.slug}`] ? "opacity-50 cursor-default bg-gray-50 border-gray-200 text-gray-500" : "bg-white hover:bg-gray-50 border-gray-300"}`}>
                        {a.posted ? "✓ posted" : loading[`post_${a.slug}`] ? "⏳" : "↑ post now"}
                      </button>
                    </li>
                  );
                })}
              </ul>
              {Object.keys(pendingTimes).length > 0 && (
                <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
                  <span className="text-xs text-gray-400">{Object.keys(pendingTimes).length} time(s) modified</span>
                  <button disabled={loading["save_times"]}
                    onClick={async () => {
                      setLoading((l) => ({ ...l, save_times: true }));
                      for (const [slug, scheduled_for] of Object.entries(pendingTimes)) {
                        await sendCommand("update_schedule", "ready", "Times saved", { slug, scheduled_for }, `sched_${slug}`);
                      }
                      setPendingTimes({});
                      setLoading((l) => ({ ...l, save_times: false }));
                      setTimeout(() => loadSection("ready"), 10000);
                    }}
                    className="bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white text-xs font-medium py-1.5 px-3 rounded transition-colors">
                    {loading["save_times"] ? "Saving…" : "Save times"}
                  </button>
                </div>
              )}
            </>
          );
        })()}
        <SectionMsg section="ready" />
      </div>

      {/* ── Manual Actions ─────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-4">Manual actions</h2>
        <div className="flex flex-wrap gap-3">
          <button disabled={loading["run_pipeline"]} onClick={() => {
            sendCommand("run_pipeline", "actions", "Pipeline started — articles will be posted once generated");
            for (const d of [60000, 120000, 180000, 300000]) setTimeout(() => { loadSection("scrape"); loadSection("selection"); loadSection("ready"); }, d);
          }} className="bg-green-700 hover:bg-green-800 disabled:opacity-50 text-white text-sm font-medium py-2 px-4 rounded transition-colors">{loading["run_pipeline"] ? "⏳ Queuing…" : "▶ Run pipeline now"}</button>
          <button disabled={loading["scrape_now"]} onClick={async () => { await sendCommand("scrape_now", "actions", "Scrape started"); setTimeout(() => loadSection("scrape"), 25000); }} className="border border-gray-300 hover:bg-gray-50 disabled:opacity-50 text-sm font-medium py-2 px-4 rounded transition-colors flex items-center gap-2">
            {loading["scrape_now"] ? <><span className="animate-spin inline-block w-3.5 h-3.5 border-2 border-gray-400 border-t-transparent rounded-full" /> Scraping…</> : "Scrape now"}
          </button>
          <button disabled={loading["post_now"]} onClick={() => { sendCommand("post_now", "actions", "Post due articles started"); setTimeout(() => loadSection("ready"), 15000); }} className="border border-gray-300 hover:bg-gray-50 disabled:opacity-50 text-sm font-medium py-2 px-4 rounded transition-colors">{loading["post_now"] ? "⏳ Queuing…" : "Post due articles"}</button>
        </div>
        <SectionMsg section="actions" />
      </div>

      {/* ── Logs ──────────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400">Pipeline logs <span className="normal-case font-normal text-gray-400">(auto-refresh 30s)</span></h2>
          <button onClick={() => loadSection("logs")} className="border border-gray-300 hover:bg-gray-50 text-xs font-medium py-1 px-2.5 rounded transition-colors">Refresh</button>
        </div>
        <div className="bg-gray-900 text-green-400 font-mono text-xs leading-relaxed p-4 rounded max-h-72 overflow-y-auto">
          {logs.length === 0 && <span className="text-gray-500">No logs available.</span>}
          {logs.map((l) => (
            <div key={l.id} className={l.is_error ? "text-red-400" : l.message.includes("✅") ? "text-green-300" : ""}>
              <span className="text-gray-500">{new Date(l.created_at).toISOString().slice(11, 19)}</span>{" "}[{l.scope}] {l.message}
            </div>
          ))}
        </div>
      </div>

      {/* ── Preview / Edit Modal ───────────────────────────────────────────────── */}
      {preview && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-6 overflow-y-auto" onClick={() => { setPreview(null); setEditing(false); }}>
          <div className="bg-white max-w-2xl w-full rounded-xl shadow-2xl overflow-hidden my-4" onClick={(e) => e.stopPropagation()}>

            {/* Header */}
            <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-200 sticky top-0 bg-white z-10">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-400">{preview.category}</span>
              <span className="flex-1 font-bold text-sm truncate">{editing ? editDraft.title : preview.title}</span>
              <div className="flex gap-2">
                {!preview.posted && (
                  <button onClick={() => editing ? saveEdit(preview.slug) : openEdit(preview)}
                    disabled={loading[`edit_${preview.slug}`]}
                    className={`text-xs font-medium px-2 py-1 rounded border transition-colors ${editing ? "bg-blue-700 text-white border-blue-700 hover:bg-blue-800" : "border-gray-300 hover:bg-gray-50"}`}>
                    {loading[`edit_${preview.slug}`] ? "Saving…" : editing ? "Save changes" : "✎ Edit"}
                  </button>
                )}
                {editing && (
                  <button onClick={() => setEditing(false)} className="text-xs border border-gray-300 px-2 py-1 rounded hover:bg-gray-50">Cancel</button>
                )}
                <button onClick={() => { setPreview(null); setEditing(false); }} className="text-xs border border-gray-300 px-2 py-1 rounded hover:bg-gray-50">✕ Close</button>
              </div>
            </div>

            {/* Image */}
            {editing ? (
              <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 space-y-2">
                <label className="block text-xs font-medium text-gray-500">Image URL</label>
                <input type="url" value={editDraft.featured_image_url ?? ""}
                  onChange={(e) => setEditDraft((d) => ({ ...d, featured_image_url: e.target.value }))}
                  placeholder="https://images.pexels.com/..."
                  className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" />
                {editDraft.featured_image_url && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={editDraft.featured_image_url} alt="" className="w-full h-36 object-cover rounded border border-gray-200" onError={(e) => (e.currentTarget.style.display = "none")} />
                )}
                <label className="block text-xs font-medium text-gray-500 mt-2">Image credit</label>
                <input type="text" value={editDraft.image_credit ?? ""}
                  onChange={(e) => setEditDraft((d) => ({ ...d, image_credit: e.target.value }))}
                  placeholder="Photo: Name / Pexels"
                  className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" />
              </div>
            ) : (
              preview.featured_image_url && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={preview.featured_image_url} alt="" className="w-full h-52 object-cover" />
              )
            )}

            {/* Body */}
            <div className="p-5">
              {editing ? (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Title</label>
                    <input type="text" value={editDraft.title ?? ""}
                      onChange={(e) => setEditDraft((d) => ({ ...d, title: e.target.value }))}
                      className="w-full border border-gray-300 rounded px-3 py-2 text-sm font-semibold" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Chapo (intro)</label>
                    <textarea rows={3} value={editDraft.chapo ?? ""}
                      onChange={(e) => setEditDraft((d) => ({ ...d, chapo: e.target.value }))}
                      className="w-full border border-gray-300 rounded px-3 py-2 text-sm resize-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Body</label>
                    <textarea rows={16} value={editDraft.body ?? ""}
                      onChange={(e) => setEditDraft((d) => ({ ...d, body: e.target.value }))}
                      className="w-full border border-gray-300 rounded px-3 py-2 text-sm font-mono text-xs resize-y" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Tags (comma-separated)</label>
                    <input type="text" value={(editDraft.tags ?? []).join(", ")}
                      onChange={(e) => setEditDraft((d) => ({ ...d, tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) }))}
                      className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
                  </div>
                </div>
              ) : (
                <>
                  {preview.image_credit && <p className="text-xs text-gray-400 mb-3">Photo: {preview.image_credit}</p>}
                  <p className="text-sm italic text-gray-600 leading-relaxed mb-4 pb-4 border-b border-gray-100">{preview.chapo}</p>
                  <div className="text-sm leading-relaxed text-gray-800" dangerouslySetInnerHTML={{ __html: renderMarkdown(preview.body || "") }} />
                  {preview.tags && preview.tags.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-1.5">
                      {preview.tags.map((t) => <span key={t} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{t}</span>)}
                    </div>
                  )}
                  {preview.source_urls?.length > 0 && (
                    <div className="mt-4 pt-3 border-t border-gray-100">
                      <a href={preview.source_urls[0]} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline">→ View source article</a>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

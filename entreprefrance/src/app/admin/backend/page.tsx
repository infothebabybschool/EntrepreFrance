import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const FREE_PLAN_DB_BYTES = 500 * 1024 * 1024;

// claude-sonnet-4-6 pricing (USD per million tokens)
const PRICE_INPUT_PER_MTOK = 3.0;
const PRICE_OUTPUT_PER_MTOK = 15.0;

// DALL-E 3 pricing: standard quality 1024×1024
const DALLE3_PRICE_PER_IMAGE = 0.04;

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatCost(usd: number): string {
  if (usd < 0.01) return `$${(usd * 100).toFixed(3)}¢`;
  return `$${usd.toFixed(4)}`;
}

function calcCost(inputTokens: number, outputTokens: number): number {
  return (inputTokens / 1_000_000) * PRICE_INPUT_PER_MTOK +
         (outputTokens / 1_000_000) * PRICE_OUTPUT_PER_MTOK;
}

const SQL_SNIPPET = `create or replace function get_db_stats()
returns json language sql security definer as $$
  select json_build_object(
    'db_size_bytes',       pg_database_size(current_database()),
    'articles_size_bytes', pg_total_relation_size('public.articles')
  );
$$;`;

const CLAUDE_TABLE_SQL = `create table if not exists claude_usage (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  date date not null,
  scope text not null default 'claude',
  input_tokens integer not null default 0,
  output_tokens integer not null default 0
);
create index if not exists claude_usage_date_idx on claude_usage (date);`;

const OPENAI_TABLE_SQL = `create table if not exists openai_usage (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  date date not null,
  model text not null default 'dall-e-3',
  images_count integer not null default 1
);
create index if not exists openai_usage_date_idx on openai_usage (date);`;

export default async function BackendPage() {
  const supabase = createServerClient();

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().slice(0, 10);
  const todayStr = new Date().toISOString().slice(0, 10);

  const [
    { count: total },
    { count: published },
    { count: draft },
    { count: deleted },
    { data: dbStats, error: dbError },
    { data: usageRows, error: usageError },
    { data: openaiRows, error: openaiError },
  ] = await Promise.all([
    supabase.from("articles").select("*", { count: "exact", head: true }),
    supabase
      .from("articles")
      .select("*", { count: "exact", head: true })
      .eq("status", "published")
      .is("deleted_at", null),
    supabase
      .from("articles")
      .select("*", { count: "exact", head: true })
      .eq("status", "draft")
      .is("deleted_at", null),
    supabase
      .from("articles")
      .select("*", { count: "exact", head: true })
      .not("deleted_at", "is", null),
    supabase.rpc("get_db_stats"),
    supabase
      .from("claude_usage")
      .select("date, scope, input_tokens, output_tokens")
      .gte("date", thirtyDaysAgoStr)
      .order("date", { ascending: true }),
    supabase
      .from("openai_usage")
      .select("date, model, images_count")
      .gte("date", thirtyDaysAgoStr)
      .order("date", { ascending: true }),
  ]);

  const stats = dbStats as {
    db_size_bytes: number;
    articles_size_bytes: number;
  } | null;

  const dbPct = stats
    ? Math.min((stats.db_size_bytes / FREE_PLAN_DB_BYTES) * 100, 100)
    : null;

  const barColor =
    dbPct == null
      ? "bg-gray-300"
      : dbPct > 80
      ? "bg-red-500"
      : dbPct > 50
      ? "bg-yellow-400"
      : "bg-green-500";

  // Aggregate Claude usage by date
  type DayUsage = { input: number; output: number; cost: number };
  const byDay = new Map<string, DayUsage>();
  if (usageRows) {
    for (const row of usageRows as { date: string; scope: string; input_tokens: number; output_tokens: number }[]) {
      const d = byDay.get(row.date) ?? { input: 0, output: 0, cost: 0 };
      d.input += row.input_tokens;
      d.output += row.output_tokens;
      d.cost += calcCost(row.input_tokens, row.output_tokens);
      byDay.set(row.date, d);
    }
  }

  const allDays = Array.from(byDay.entries())
    .sort(([a], [b]) => a.localeCompare(b));

  const last7Days = allDays.slice(-7);

  const todayUsage = byDay.get(todayStr) ?? null;

  const monthStart = todayStr.slice(0, 7);
  const monthTotal = allDays
    .filter(([d]) => d.startsWith(monthStart))
    .reduce((acc, [, v]) => acc + v.cost, 0);

  const totalAllTime = allDays.reduce((acc, [, v]) => acc + v.cost, 0);

  const totalInputTokens = (usageRows ?? []).reduce(
    (acc: number, r: { input_tokens: number }) => acc + r.input_tokens, 0
  );
  const totalOutputTokens = (usageRows ?? []).reduce(
    (acc: number, r: { output_tokens: number }) => acc + r.output_tokens, 0
  );

  const maxDayCost = last7Days.length > 0
    ? Math.max(...last7Days.map(([, v]) => v.cost))
    : 0;

  // Build per-scope totals for last 30 days
  type ScopeUsage = { input: number; output: number; cost: number; calls: number };
  const byScope = new Map<string, ScopeUsage>();
  if (usageRows) {
    for (const row of usageRows as { date: string; scope: string; input_tokens: number; output_tokens: number }[]) {
      const s = byScope.get(row.scope) ?? { input: 0, output: 0, cost: 0, calls: 0 };
      s.input += row.input_tokens;
      s.output += row.output_tokens;
      s.cost += calcCost(row.input_tokens, row.output_tokens);
      s.calls += 1;
      byScope.set(row.scope, s);
    }
  }
  const scopeEntries = Array.from(byScope.entries()).sort(([, a], [, b]) => b.cost - a.cost);

  const claudeTableMissing = usageError && usageError.message?.includes("does not exist");

  // Aggregate OpenAI usage by date
  type OpenAIDayUsage = { images: number; cost: number };
  const openaiByDay = new Map<string, OpenAIDayUsage>();
  if (openaiRows) {
    for (const row of openaiRows as { date: string; model: string; images_count: number }[]) {
      const d = openaiByDay.get(row.date) ?? { images: 0, cost: 0 };
      d.images += row.images_count;
      d.cost += row.images_count * DALLE3_PRICE_PER_IMAGE;
      openaiByDay.set(row.date, d);
    }
  }

  const openaiAllDays = Array.from(openaiByDay.entries()).sort(([a], [b]) => a.localeCompare(b));
  const openaiLast7 = openaiAllDays.slice(-7);
  const openaiToday = openaiByDay.get(todayStr) ?? null;
  const openaiMonthTotal = openaiAllDays
    .filter(([d]) => d.startsWith(monthStart))
    .reduce((acc, [, v]) => acc + v.cost, 0);
  const openaiTotal30 = openaiAllDays.reduce((acc, [, v]) => acc + v.cost, 0);
  const openaiTotalImages = openaiAllDays.reduce((acc, [, v]) => acc + v.images, 0);
  const openaiMaxDayCost = openaiLast7.length > 0
    ? Math.max(...openaiLast7.map(([, v]) => v.cost))
    : 0;

  const openaiTableMissing = openaiError && openaiError.message?.includes("does not exist");

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="font-serif text-2xl font-bold text-gray-900">Back-end</h1>
        <p className="text-sm text-gray-400 mt-1 font-sans">Supabase · Claude API · OpenAI API</p>
      </div>

      {/* ── Article counts ──────────────────────────── */}
      <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3 font-sans">
        Articles
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">
        {(
          [
            { label: "Total stored", value: total ?? 0, accent: "text-navy" },
            { label: "Published", value: published ?? 0, accent: "text-green-600" },
            { label: "Draft", value: draft ?? 0, accent: "text-yellow-500" },
            { label: "Soft-deleted", value: deleted ?? 0, accent: "text-gray-400" },
          ] as const
        ).map(({ label, value, accent }) => (
          <div
            key={label}
            className="bg-white border border-gray-200 rounded p-5"
          >
            <p className="text-xs font-sans font-semibold uppercase tracking-widest text-gray-400 mb-2">
              {label}
            </p>
            <p className={`font-serif text-4xl font-bold ${accent}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* ── Database size ───────────────────────────── */}
      <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3 font-sans">
        Database
      </h2>

      {dbError || !stats ? (
        <div className="bg-white border border-gray-200 rounded p-6 mb-10">
          <p className="text-sm text-gray-700 mb-1 font-medium">
            One-time setup required
          </p>
          <p className="text-sm text-gray-500 mb-4">
            Run this function once in your{" "}
            <span className="font-medium text-gray-700">Supabase SQL Editor</span> to
            enable database size tracking:
          </p>
          <pre className="bg-gray-50 border border-gray-200 rounded p-4 text-xs text-gray-700 overflow-x-auto leading-relaxed">
            {SQL_SNIPPET}
          </pre>
          <p className="text-xs text-gray-400 mt-3">
            Then refresh this page — no redeployment needed.
          </p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded p-6 space-y-6 mb-10">
          <div>
            <div className="flex items-baseline justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">
                Total database size
              </span>
              <span className="font-mono text-sm text-gray-600">
                {formatBytes(stats.db_size_bytes)}
                <span className="text-gray-400 font-sans text-xs ml-1">
                  / 500 MB free plan
                </span>
              </span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
              <div
                className={`h-3 rounded-full transition-all ${barColor}`}
                style={{ width: `${dbPct}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-gray-400 mt-1.5 font-mono">
              <span>{dbPct!.toFixed(1)}% used</span>
              <span>
                {formatBytes(FREE_PLAN_DB_BYTES - stats.db_size_bytes)} remaining
              </span>
            </div>
          </div>

          <div className="border-t border-gray-100 pt-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-gray-400 font-sans mb-1">articles table</p>
              <p className="font-mono text-lg text-gray-800 font-semibold">
                {formatBytes(stats.articles_size_bytes)}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400 font-sans mb-1">
                rest of database
              </p>
              <p className="font-mono text-lg text-gray-800 font-semibold">
                {formatBytes(stats.db_size_bytes - stats.articles_size_bytes)}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400 font-sans mb-1">
                avg. per article
              </p>
              <p className="font-mono text-lg text-gray-800 font-semibold">
                {total
                  ? formatBytes(Math.round(stats.articles_size_bytes / total))
                  : "—"}
              </p>
            </div>
          </div>

          <p className="text-xs text-gray-300 font-sans">
            Free plan limit is 500 MB. Upgrade to Supabase Pro for 8 GB.
          </p>
        </div>
      )}

      {/* ── Claude API usage ─────────────────────────── */}
      <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3 font-sans">
        Claude API
      </h2>

      {claudeTableMissing ? (
        <div className="bg-white border border-gray-200 rounded p-6">
          <p className="text-sm text-gray-700 mb-1 font-medium">
            One-time setup required
          </p>
          <p className="text-sm text-gray-500 mb-4">
            Run this in your{" "}
            <span className="font-medium text-gray-700">Supabase SQL Editor</span> to
            enable Claude usage tracking:
          </p>
          <pre className="bg-gray-50 border border-gray-200 rounded p-4 text-xs text-gray-700 overflow-x-auto leading-relaxed">
            {CLAUDE_TABLE_SQL}
          </pre>
          <p className="text-xs text-gray-400 mt-3">
            Then refresh this page. Usage will be recorded automatically from the next pipeline run.
          </p>
        </div>
      ) : (
        <div className="space-y-5">

          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-white border border-gray-200 rounded p-5">
              <p className="text-xs font-sans font-semibold uppercase tracking-widest text-gray-400 mb-2">
                Today
              </p>
              <p className="font-mono text-2xl font-bold text-gray-900">
                {todayUsage ? formatCost(todayUsage.cost) : "—"}
              </p>
              {todayUsage && (
                <p className="text-xs text-gray-400 font-mono mt-1">
                  {(todayUsage.input + todayUsage.output).toLocaleString()} tok
                </p>
              )}
            </div>
            <div className="bg-white border border-gray-200 rounded p-5">
              <p className="text-xs font-sans font-semibold uppercase tracking-widest text-gray-400 mb-2">
                This month
              </p>
              <p className="font-mono text-2xl font-bold text-gray-900">
                {monthTotal > 0 ? formatCost(monthTotal) : "—"}
              </p>
            </div>
            <div className="bg-white border border-gray-200 rounded p-5">
              <p className="text-xs font-sans font-semibold uppercase tracking-widest text-gray-400 mb-2">
                Last 30 days
              </p>
              <p className="font-mono text-2xl font-bold text-gray-900">
                {totalAllTime > 0 ? formatCost(totalAllTime) : "—"}
              </p>
            </div>
            <div className="bg-white border border-gray-200 rounded p-5">
              <p className="text-xs font-sans font-semibold uppercase tracking-widest text-gray-400 mb-2">
                Avg / day
              </p>
              <p className="font-mono text-2xl font-bold text-gray-900">
                {allDays.length > 0 ? formatCost(totalAllTime / allDays.length) : "—"}
              </p>
            </div>
          </div>

          {/* Daily bar chart — last 7 days */}
          {last7Days.length > 0 ? (
            <div className="bg-white border border-gray-200 rounded p-6">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-5 font-sans">
                Daily cost — last 7 days
              </p>
              <div className="flex items-end gap-2 h-28">
                {last7Days.map(([date, usage]) => {
                  const pct = maxDayCost > 0 ? (usage.cost / maxDayCost) * 100 : 0;
                  const isToday = date === todayStr;
                  const label = new Date(date + "T12:00:00Z").toLocaleDateString("fr-BE", {
                    weekday: "short",
                    day: "numeric",
                  });
                  return (
                    <div key={date} className="flex-1 flex flex-col items-center gap-1">
                      <span className="text-xs font-mono text-gray-500" title={formatCost(usage.cost)}>
                        {formatCost(usage.cost)}
                      </span>
                      <div className="w-full flex flex-col justify-end" style={{ height: "64px" }}>
                        <div
                          className={`w-full rounded-t transition-all ${isToday ? "bg-blue-500" : "bg-gray-300"}`}
                          style={{ height: `${Math.max(pct, 4)}%` }}
                        />
                      </div>
                      <span className={`text-xs font-sans ${isToday ? "text-blue-600 font-semibold" : "text-gray-400"}`}>
                        {label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded p-6">
              <p className="text-sm text-gray-500">
                No usage recorded yet. Data will appear after the next pipeline run.
              </p>
            </div>
          )}

          {/* Token breakdown + per-scope */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {/* Token breakdown */}
            <div className="bg-white border border-gray-200 rounded p-6 space-y-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest font-sans">
                Token breakdown — 30 days
              </p>
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600">Input</span>
                    <span className="font-mono text-gray-800">
                      {(totalInputTokens / 1000).toFixed(1)}K
                      <span className="text-gray-400 text-xs ml-1">
                        ({formatCost((totalInputTokens / 1_000_000) * PRICE_INPUT_PER_MTOK)})
                      </span>
                    </span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div
                      className="h-2 rounded-full bg-blue-400"
                      style={{
                        width: `${totalInputTokens + totalOutputTokens > 0
                          ? (totalInputTokens / (totalInputTokens + totalOutputTokens)) * 100
                          : 0}%`,
                      }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600">Output</span>
                    <span className="font-mono text-gray-800">
                      {(totalOutputTokens / 1000).toFixed(1)}K
                      <span className="text-gray-400 text-xs ml-1">
                        ({formatCost((totalOutputTokens / 1_000_000) * PRICE_OUTPUT_PER_MTOK)})
                      </span>
                    </span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div
                      className="h-2 rounded-full bg-orange-400"
                      style={{
                        width: `${totalInputTokens + totalOutputTokens > 0
                          ? (totalOutputTokens / (totalInputTokens + totalOutputTokens)) * 100
                          : 0}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
              <p className="text-xs text-gray-300 font-sans pt-1">
                Pricing: $3 / MTok input · $15 / MTok output (claude-sonnet-4-6)
              </p>
            </div>

            {/* Per-scope */}
            <div className="bg-white border border-gray-200 rounded p-6">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4 font-sans">
                By scope — 30 days
              </p>
              {scopeEntries.length > 0 ? (
                <div className="space-y-3">
                  {scopeEntries.map(([scope, s]) => (
                    <div key={scope} className="flex items-center justify-between text-sm">
                      <span className="font-mono text-gray-700 bg-gray-50 border border-gray-200 rounded px-2 py-0.5 text-xs">
                        {scope}
                      </span>
                      <span className="text-gray-500 text-xs">
                        {s.calls} call{s.calls !== 1 ? "s" : ""}
                      </span>
                      <span className="font-mono text-gray-800">
                        {(s.input + s.output).toLocaleString()} tok
                      </span>
                      <span className="font-mono font-semibold text-gray-900">
                        {formatCost(s.cost)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400">No data yet.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── OpenAI / DALL-E usage ────────────────────── */}
      <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3 mt-10 font-sans">
        OpenAI — DALL·E 3
      </h2>

      {openaiTableMissing ? (
        <div className="bg-white border border-gray-200 rounded p-6">
          <p className="text-sm text-gray-700 mb-1 font-medium">
            One-time setup required
          </p>
          <p className="text-sm text-gray-500 mb-4">
            Run this in your{" "}
            <span className="font-medium text-gray-700">Supabase SQL Editor</span> to
            enable DALL·E usage tracking:
          </p>
          <pre className="bg-gray-50 border border-gray-200 rounded p-4 text-xs text-gray-700 overflow-x-auto leading-relaxed">
            {OPENAI_TABLE_SQL}
          </pre>
          <p className="text-xs text-gray-400 mt-3">
            Then refresh this page. Usage will be recorded automatically from the next pipeline run.
          </p>
        </div>
      ) : (
        <div className="space-y-5">

          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-white border border-gray-200 rounded p-5">
              <p className="text-xs font-sans font-semibold uppercase tracking-widest text-gray-400 mb-2">
                Today
              </p>
              <p className="font-mono text-2xl font-bold text-gray-900">
                {openaiToday ? formatCost(openaiToday.cost) : "—"}
              </p>
              {openaiToday && (
                <p className="text-xs text-gray-400 font-mono mt-1">
                  {openaiToday.images} image{openaiToday.images !== 1 ? "s" : ""}
                </p>
              )}
            </div>
            <div className="bg-white border border-gray-200 rounded p-5">
              <p className="text-xs font-sans font-semibold uppercase tracking-widest text-gray-400 mb-2">
                This month
              </p>
              <p className="font-mono text-2xl font-bold text-gray-900">
                {openaiMonthTotal > 0 ? formatCost(openaiMonthTotal) : "—"}
              </p>
            </div>
            <div className="bg-white border border-gray-200 rounded p-5">
              <p className="text-xs font-sans font-semibold uppercase tracking-widest text-gray-400 mb-2">
                Last 30 days
              </p>
              <p className="font-mono text-2xl font-bold text-gray-900">
                {openaiTotal30 > 0 ? formatCost(openaiTotal30) : "—"}
              </p>
            </div>
            <div className="bg-white border border-gray-200 rounded p-5">
              <p className="text-xs font-sans font-semibold uppercase tracking-widest text-gray-400 mb-2">
                Images total
              </p>
              <p className="font-mono text-2xl font-bold text-gray-900">
                {openaiTotalImages > 0 ? openaiTotalImages : "—"}
              </p>
              <p className="text-xs text-gray-400 font-sans mt-1">
                $0.04 / image
              </p>
            </div>
          </div>

          {/* Daily bar chart — last 7 days */}
          {openaiLast7.length > 0 ? (
            <div className="bg-white border border-gray-200 rounded p-6">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-5 font-sans">
                Daily cost — last 7 days
              </p>
              <div className="flex items-end gap-2 h-28">
                {openaiLast7.map(([date, usage]) => {
                  const pct = openaiMaxDayCost > 0 ? (usage.cost / openaiMaxDayCost) * 100 : 0;
                  const isToday = date === todayStr;
                  const label = new Date(date + "T12:00:00Z").toLocaleDateString("fr-BE", {
                    weekday: "short",
                    day: "numeric",
                  });
                  return (
                    <div key={date} className="flex-1 flex flex-col items-center gap-1">
                      <span className="text-xs font-mono text-gray-500" title={formatCost(usage.cost)}>
                        {usage.images}×
                      </span>
                      <div className="w-full flex flex-col justify-end" style={{ height: "64px" }}>
                        <div
                          className={`w-full rounded-t transition-all ${isToday ? "bg-green-500" : "bg-gray-300"}`}
                          style={{ height: `${Math.max(pct, 4)}%` }}
                        />
                      </div>
                      <span className={`text-xs font-sans ${isToday ? "text-green-600 font-semibold" : "text-gray-400"}`}>
                        {label}
                      </span>
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-gray-300 font-sans mt-3">
                Bar height = relative daily cost. Number = images generated that day.
              </p>
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded p-6">
              <p className="text-sm text-gray-500">
                No usage recorded yet. Data will appear after the next pipeline run with image generation.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

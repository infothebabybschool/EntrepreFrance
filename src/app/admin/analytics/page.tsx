export const dynamic = "force-dynamic";

const POSTHOG_HOST = "https://us.posthog.com";
const POSTHOG_PROJECT_ID = "408282";
const POSTHOG_DASHBOARD_URL =
  "https://us.posthog.com/project/408282/web?path_cleaning=false&filter_test_accounts=false";

async function phQuery(sql: string, apiKey: string): Promise<unknown[][]> {
  const res = await fetch(
    `${POSTHOG_HOST}/api/projects/${POSTHOG_PROJECT_ID}/query/`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ query: { kind: "HogQLQuery", query: sql } }),
      cache: "no-store",
    }
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`PostHog ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as { results?: unknown[][] };
  return data.results ?? [];
}

function scalar(r: PromiseSettledResult<unknown[][]>): number | null {
  if (r.status === "rejected") return null;
  const v = r.value[0]?.[0];
  return v != null ? Number(v) : null;
}

function SetupRequired() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="font-serif text-2xl font-bold text-gray-900">Analytics</h1>
        <p className="text-sm text-gray-400 mt-1 font-sans">PostHog · Web traffic</p>
      </div>
      <div className="bg-white border border-gray-200 rounded p-6 max-w-xl">
        <p className="text-sm font-medium text-gray-700 mb-1">One-time setup required</p>
        <p className="text-sm text-gray-500 mb-4">
          Add a PostHog Personal API key to pull metrics server-side.
        </p>
        <ol className="text-sm text-gray-600 space-y-2 list-decimal list-inside mb-5">
          <li>
            Go to{" "}
            <span className="font-medium text-gray-700">
              PostHog → Settings → Personal API Keys
            </span>
          </li>
          <li>
            Create a key — <strong>Query Read</strong> access is enough
          </li>
          <li>
            Add it to Vercel (and your local{" "}
            <code className="bg-gray-100 px-1.5 py-0.5 rounded font-mono text-xs">.env.local</code>
            ) as{" "}
            <code className="bg-gray-100 px-1.5 py-0.5 rounded font-mono text-xs">
              POSTHOG_PERSONAL_API_KEY
            </code>
          </li>
          <li>Redeploy — the key is never exposed to the browser</li>
        </ol>
        <a
          href={POSTHOG_DASHBOARD_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 border border-blue-200 hover:border-blue-400 rounded px-3 py-1.5 transition-colors font-sans"
        >
          Open PostHog dashboard ↗
        </a>
      </div>
    </div>
  );
}

export default async function AnalyticsPage() {
  const apiKey = process.env.POSTHOG_PERSONAL_API_KEY;
  if (!apiKey) return <SetupRequired />;

  const results = await Promise.allSettled([
    // 0 — unique visitors last 7 days
    phQuery(
      "SELECT count(distinct person_id) FROM events WHERE event = '$pageview' AND timestamp >= now() - interval 7 day",
      apiKey
    ),
    // 1 — pageviews last 7 days
    phQuery(
      "SELECT count() FROM events WHERE event = '$pageview' AND timestamp >= now() - interval 7 day",
      apiKey
    ),
    // 2 — sessions last 7 days
    phQuery(
      "SELECT count(distinct properties.$session_id) FROM events WHERE timestamp >= now() - interval 7 day AND properties.$session_id IS NOT NULL",
      apiKey
    ),
    // 3 — new persons last 7 days
    phQuery(
      "SELECT count() FROM persons WHERE created_at >= now() - interval 7 day",
      apiKey
    ),
    // 4 — unique visitors last 30 days
    phQuery(
      "SELECT count(distinct person_id) FROM events WHERE event = '$pageview' AND timestamp >= now() - interval 30 day",
      apiKey
    ),
    // 5 — daily pageviews + unique visitors last 14 days
    phQuery(
      "SELECT toDate(timestamp) as day, count() as views, count(distinct person_id) as visitors FROM events WHERE event = '$pageview' AND timestamp >= now() - interval 14 day GROUP BY day ORDER BY day ASC",
      apiKey
    ),
    // 6 — top pages last 7 days
    phQuery(
      "SELECT properties.$current_url as url, count() as views, count(distinct person_id) as visitors FROM events WHERE event = '$pageview' AND timestamp >= now() - interval 7 day AND properties.$current_url IS NOT NULL GROUP BY url ORDER BY views DESC LIMIT 10",
      apiKey
    ),
    // 7 — device breakdown last 7 days
    phQuery(
      "SELECT coalesce(toString(properties.$device_type), 'Unknown') as device, count(distinct person_id) as users FROM events WHERE event = '$pageview' AND timestamp >= now() - interval 7 day GROUP BY device ORDER BY users DESC LIMIT 5",
      apiKey
    ),
  ]);

  const visitors7 = scalar(results[0]);
  const pageviews7 = scalar(results[1]);
  const sessions7 = scalar(results[2]);
  const newUsers7 = scalar(results[3]);
  const visitors30 = scalar(results[4]);

  type DayRow = { day: string; views: number; visitors: number };
  const dailyData: DayRow[] =
    results[5].status === "fulfilled"
      ? results[5].value.map((r) => ({
          day: String(r[0]),
          views: Number(r[1]),
          visitors: Number(r[2]),
        }))
      : [];
  const maxViews = dailyData.length ? Math.max(...dailyData.map((d) => d.views)) : 0;

  type PageRow = { url: string; views: number; visitors: number };
  const topPages: PageRow[] =
    results[6].status === "fulfilled"
      ? results[6].value.map((r) => ({
          url: String(r[0] ?? ""),
          views: Number(r[1]),
          visitors: Number(r[2]),
        }))
      : [];

  type DeviceRow = { device: string; users: number };
  const devices: DeviceRow[] =
    results[7].status === "fulfilled"
      ? results[7].value.map((r) => ({
          device: String(r[0] ?? "Unknown"),
          users: Number(r[1]),
        }))
      : [];
  const totalDeviceUsers = devices.reduce((s, d) => s + d.users, 0);

  const pagesPerSession =
    sessions7 && pageviews7 && sessions7 > 0
      ? (pageviews7 / sessions7).toFixed(1)
      : null;
  const avgPerDay = visitors7 != null ? Math.round(visitors7 / 7) : null;

  const displayPath = (url: string) =>
    url.replace(/^https?:\/\/[^/]+/, "").replace(/^$/, "/") || "/";

  const todayStr = new Date().toISOString().slice(0, 10);

  const DEVICE_LABEL: Record<string, string> = {
    Desktop: "Desktop",
    Mobile: "Mobile",
    Tablet: "Tablet",
  };

  return (
    <div>
      {/* ── Header ─────────────────────────────────────── */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="font-serif text-2xl font-bold text-gray-900">Analytics</h1>
          <p className="text-sm text-gray-400 mt-1 font-sans">PostHog · Web traffic</p>
        </div>
        <a
          href={POSTHOG_DASHBOARD_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 border border-blue-200 hover:border-blue-400 rounded px-3 py-1.5 transition-colors bg-white font-sans"
        >
          Open PostHog ↗
        </a>
      </div>

      {/* ── Last 7 days — main KPIs ────────────────────── */}
      <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3 font-sans">
        Last 7 days
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">
        {(
          [
            { label: "Unique visitors", value: visitors7, accent: "text-navy" },
            { label: "Pageviews", value: pageviews7, accent: "text-blue-600" },
            { label: "Sessions", value: sessions7, accent: "text-purple-600" },
            { label: "New users", value: newUsers7, accent: "text-green-600" },
          ] as const
        ).map(({ label, value, accent }) => (
          <div key={label} className="bg-white border border-gray-200 rounded p-5">
            <p className="text-xs font-sans font-semibold uppercase tracking-widest text-gray-400 mb-2">
              {label}
            </p>
            <p className={`font-serif text-4xl font-bold ${accent}`}>
              {value === null ? "—" : value.toLocaleString()}
            </p>
          </div>
        ))}
      </div>

      {/* ── Secondary KPIs ─────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
        <div className="bg-white border border-gray-200 rounded p-5">
          <p className="text-xs font-sans font-semibold uppercase tracking-widest text-gray-400 mb-2">
            Unique visitors (30d)
          </p>
          <p className="font-mono text-2xl font-bold text-gray-900">
            {visitors30 !== null ? visitors30.toLocaleString() : "—"}
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded p-5">
          <p className="text-xs font-sans font-semibold uppercase tracking-widest text-gray-400 mb-2">
            Avg visitors / day (7d)
          </p>
          <p className="font-mono text-2xl font-bold text-gray-900">
            {avgPerDay !== null ? avgPerDay.toLocaleString() : "—"}
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded p-5">
          <p className="text-xs font-sans font-semibold uppercase tracking-widest text-gray-400 mb-2">
            Pages / session (7d)
          </p>
          <p className="font-mono text-2xl font-bold text-gray-900">{pagesPerSession ?? "—"}</p>
        </div>
      </div>

      {/* ── Daily pageviews chart ───────────────────────── */}
      <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3 font-sans">
        Daily pageviews — last 14 days
      </h2>
      {dailyData.length > 0 ? (
        <div className="bg-white border border-gray-200 rounded p-6 mb-10">
          <div className="flex items-end gap-1.5" style={{ height: "96px" }}>
            {dailyData.map(({ day, views, visitors }) => {
              const pct = maxViews > 0 ? (views / maxViews) * 100 : 0;
              const isToday = day === todayStr;
              const label = new Date(day + "T12:00:00Z").toLocaleDateString("fr-BE", {
                day: "numeric",
                month: "short",
              });
              return (
                <div key={day} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full flex flex-col justify-end" style={{ height: "68px" }}>
                    <div
                      className={`w-full rounded-t transition-colors ${
                        isToday ? "bg-blue-500" : "bg-blue-300"
                      }`}
                      style={{ height: `${Math.max(pct, 3)}%` }}
                      title={`${views} views · ${visitors} visitors`}
                    />
                  </div>
                  <span
                    className={`font-sans leading-tight ${
                      isToday ? "text-blue-600 font-semibold" : "text-gray-400"
                    }`}
                    style={{ fontSize: "9px" }}
                  >
                    {label}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-gray-300 font-sans mt-3">
            Hover a bar for details. Height is proportional to the busiest day.
          </p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded p-6 mb-10">
          <p className="text-sm text-gray-500">No pageview data available yet.</p>
        </div>
      )}

      {/* ── Top pages + Devices ────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        {/* Top pages */}
        <div className="bg-white border border-gray-200 rounded p-6">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4 font-sans">
            Top pages — last 7 days
          </h2>
          {topPages.length > 0 ? (
            <div className="space-y-3">
              {topPages.map(({ url, views, visitors }) => {
                const path = displayPath(url);
                const pct =
                  topPages[0].views > 0 ? (views / topPages[0].views) * 100 : 0;
                return (
                  <div key={url}>
                    <div className="flex items-center justify-between text-xs mb-1 gap-2">
                      <span
                        className="font-mono text-gray-700 truncate"
                        style={{ maxWidth: "55%" }}
                        title={path}
                      >
                        {path}
                      </span>
                      <span className="text-gray-400 shrink-0">
                        <span className="font-medium text-gray-700">
                          {views.toLocaleString()}
                        </span>{" "}
                        views ·{" "}
                        <span className="font-medium text-gray-700">
                          {visitors.toLocaleString()}
                        </span>{" "}
                        uniq
                      </span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5">
                      <div
                        className="h-1.5 rounded-full bg-blue-400"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-gray-400">No data yet.</p>
          )}
        </div>

        {/* Device breakdown */}
        <div className="bg-white border border-gray-200 rounded p-6">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4 font-sans">
            Devices — last 7 days
          </h2>
          {devices.length > 0 ? (
            <div className="space-y-3">
              {devices.map(({ device, users }) => {
                const pct =
                  totalDeviceUsers > 0 ? (users / totalDeviceUsers) * 100 : 0;
                return (
                  <div key={device}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="text-gray-700">
                        {DEVICE_LABEL[device] ?? device}
                      </span>
                      <span className="text-xs text-gray-400 font-mono">
                        {users.toLocaleString()} · {pct.toFixed(0)}%
                      </span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div
                        className="h-2 rounded-full bg-purple-400"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-gray-400">No data yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}

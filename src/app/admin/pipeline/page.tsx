import { createServerClient } from "@/lib/supabase/server";
import PipelinePanel from "@/components/admin/PipelinePanel";

export const dynamic = "force-dynamic";

const DEFAULT_CONFIG = {
  schedule: { time: "07:26", timezone: "Europe/Brussels" },
  pipeline: { articlesPerDay: 4, minArticlesRequired: 4, topicRepetitionWeight: 5 },
  posting: {
    mode: "specific" as const,
    firstPostTime: "09:00",
    intervalMinutes: 130,
    randomMin: 60,
    randomMax: 180,
    specificTimes: ["09:00", "11:10", "13:20", "15:30"],
  },
  rssFeeds: [
    { name: "La Libre", url: "https://www.lalibre.be/arc/outboundfeeds/rss/?outputType=xml", enabled: true },
    { name: "DH Net", url: "https://www.dhnet.be/arc/outboundfeeds/rss/?outputType=xml", enabled: true },
    { name: "L'Avenir", url: "https://www.lavenir.net/arc/outboundfeeds/rss/?outputType=xml", enabled: true },
  ],
  images: {
    enabled: false,
    relevanceThreshold: 5,
    generationStyle: "photorealistic editorial news photo, professional lighting, no text overlay, no logo",
    costLog: {} as Record<string, number>,
  },
};

export default async function PipelinePage() {
  const supabase = createServerClient();
  const { data } = await supabase
    .from("pipeline_config")
    .select("config, updated_at")
    .eq("id", 1)
    .single();

  const rawConfig = data?.config ?? {};
  const config = {
    ...DEFAULT_CONFIG,
    ...rawConfig,
    pipeline: {
      ...DEFAULT_CONFIG.pipeline,
      ...(rawConfig.pipeline ?? {}),
    },
    posting: {
      ...DEFAULT_CONFIG.posting,
      ...(rawConfig.posting ?? {}),
      specificTimes: Array.isArray(rawConfig.posting?.specificTimes) && rawConfig.posting.specificTimes.length > 0
        ? rawConfig.posting.specificTimes
        : DEFAULT_CONFIG.posting.specificTimes,
    },
    rssFeeds: Array.isArray(rawConfig.rssFeeds) && rawConfig.rssFeeds.length > 0
      ? rawConfig.rssFeeds
      : DEFAULT_CONFIG.rssFeeds,
    images: {
      ...DEFAULT_CONFIG.images,
      ...(rawConfig.images ?? {}),
    },
  };
  const updatedAt = data?.updated_at ?? null;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-serif text-2xl font-bold text-gray-900">Pipeline</h1>
          {updatedAt && (
            <p className="text-xs text-gray-400 mt-1">
              Dernière mise à jour : {new Date(updatedAt).toLocaleString("fr-BE", { timeZone: "Europe/Brussels" })}
            </p>
          )}
        </div>
      </div>
      <PipelinePanel initialConfig={config} />
    </div>
  );
}

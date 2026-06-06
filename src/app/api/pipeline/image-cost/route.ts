import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.ARTICLES_API_SECRET;
  return !!secret && req.headers.get("authorization") === `Bearer ${secret}`;
}

// POST /api/pipeline/image-cost
// Called by the pipeline after each successful AI image generation.
// Increments the daily counter in pipeline_config.config.images.costLog.
export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { date } = await req.json() as { date: string };
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
  }

  const supabase = createServerClient();

  // Fetch current config
  const { data, error } = await supabase
    .from("pipeline_config")
    .select("config")
    .eq("id", 1)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Config not found" }, { status: 404 });
  }

  // Increment daily counter
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const config = data.config as any;
  const images = config.images ?? {};
  const costLog: Record<string, number> = images.costLog ?? {};
  costLog[date] = (costLog[date] ?? 0) + 1;

  // Prune entries older than 40 days to prevent unbounded growth
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 40);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  for (const key of Object.keys(costLog)) {
    if (key < cutoffStr) delete costLog[key];
  }

  const updatedConfig = { ...config, images: { ...images, costLog } };

  const { error: updateError } = await supabase
    .from("pipeline_config")
    .update({ config: updatedConfig })
    .eq("id", 1);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, date, count: costLog[date] });
}

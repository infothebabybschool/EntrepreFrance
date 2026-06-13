import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.ARTICLES_API_SECRET;
  return !!secret && req.headers.get("authorization") === `Bearer ${secret}`;
}

const TABLE: Record<string, string> = {
  scrape: "pipeline_scrape_cache",
  selection: "pipeline_selection_cache",
  ready: "pipeline_ready_cache",
};

// POST /api/pipeline/cache — pipeline writes state to Supabase
export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { type, ...data } = body;

  if (!TABLE[type]) {
    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  }

  const supabase = createServerClient();
  const { error } = await supabase
    .from(TABLE[type])
    .upsert({ id: 1, ...data, updated_at: new Date().toISOString() });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

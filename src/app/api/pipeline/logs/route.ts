import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.ARTICLES_API_SECRET;
  return !!secret && req.headers.get("authorization") === `Bearer ${secret}`;
}

// POST /api/pipeline/logs — pipeline appends log entries
export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { entries } = await req.json();
  if (!Array.isArray(entries) || entries.length === 0) {
    return NextResponse.json({ error: "entries must be a non-empty array" }, { status: 400 });
  }

  const supabase = createServerClient();
  const { error } = await supabase.from("pipeline_logs").insert(
    entries.map((e: { scope: string; message: string; is_error?: boolean }) => ({
      scope: e.scope,
      message: e.message,
      is_error: e.is_error ?? false,
    }))
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Keep only the last 300 rows
  try { await supabase.rpc("trim_pipeline_logs"); } catch {}

  return NextResponse.json({ ok: true });
}

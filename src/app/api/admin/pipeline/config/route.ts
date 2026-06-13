import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createServerClient } from "@/lib/supabase/server";

// GET /api/admin/pipeline/config — admin reads current config
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("pipeline_config")
    .select("config, updated_at")
    .eq("id", 1)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Config not found" }, { status: 404 });
  }

  return NextResponse.json({ config: data.config, updated_at: data.updated_at });
}

// POST /api/admin/pipeline/config — admin saves config
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { config } = await req.json();
  if (!config) return NextResponse.json({ error: "config is required" }, { status: 400 });

  const supabase = createServerClient();
  const { data: saved, error } = await supabase
    .from("pipeline_config")
    .update({ config, updated_at: new Date().toISOString() })
    .eq("id", 1)
    .select("config")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!saved) return NextResponse.json({ error: "Row not found" }, { status: 404 });

  return NextResponse.json({ ok: true, config: saved.config });
}

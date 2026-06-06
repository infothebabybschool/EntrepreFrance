import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createServerClient } from "@/lib/supabase/server";

// GET /api/admin/pipeline/data?section=scrape|selection|ready|logs
export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const section = new URL(req.url).searchParams.get("section");
  const supabase = createServerClient();

  if (section === "scrape") {
    const { data } = await supabase
      .from("pipeline_scrape_cache")
      .select("scraped_at, total, articles, history, updated_at")
      .eq("id", 1)
      .single();
    return NextResponse.json({ data: data ?? null });
  }

  if (section === "selection") {
    const { data } = await supabase
      .from("pipeline_selection_cache")
      .select("selected_at, total, articles, updated_at")
      .eq("id", 1)
      .single();
    return NextResponse.json({ data: data ?? null });
  }

  if (section === "ready") {
    const { data } = await supabase
      .from("pipeline_ready_cache")
      .select("generated_at, total, articles, updated_at")
      .eq("id", 1)
      .single();
    return NextResponse.json({ data: data ?? null });
  }

  if (section === "logs") {
    const { data } = await supabase
      .from("pipeline_logs")
      .select("id, created_at, is_error, scope, message")
      .order("id", { ascending: false })
      .limit(80);
    return NextResponse.json({ data: (data ?? []).reverse() });
  }

  return NextResponse.json({ error: "Invalid section" }, { status: 400 });
}

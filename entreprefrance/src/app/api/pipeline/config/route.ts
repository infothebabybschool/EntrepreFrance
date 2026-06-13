import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.ARTICLES_API_SECRET;
  return !!secret && req.headers.get("authorization") === `Bearer ${secret}`;
}

// GET /api/pipeline/config — pipeline reads its config from Supabase
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("pipeline_config")
    .select("config")
    .eq("id", 1)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Config not found" }, { status: 404 });
  }

  return NextResponse.json({ config: data.config });
}

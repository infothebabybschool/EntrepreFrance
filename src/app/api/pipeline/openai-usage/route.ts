import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.ARTICLES_API_SECRET;
  return !!secret && req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { date, model, images_count } = await req.json();
  if (!date || typeof images_count !== "number") {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const supabase = createServerClient();
  const { error } = await supabase.from("openai_usage").insert({
    date,
    model: model ?? "dall-e-3",
    images_count,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

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

  const { date, scope, input_tokens, output_tokens } = await req.json();
  if (!date || typeof input_tokens !== "number" || typeof output_tokens !== "number") {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const supabase = createServerClient();
  const { error } = await supabase.from("claude_usage").insert({
    date,
    scope: scope ?? "claude",
    input_tokens,
    output_tokens,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

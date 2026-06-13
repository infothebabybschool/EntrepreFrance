import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createServerClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { articleId } = await req.json();
  if (!articleId || typeof articleId !== "string") {
    return NextResponse.json({ error: "articleId required" }, { status: 400 });
  }

  const supabase = createServerClient();

  const { error } = await supabase
    .from("user_reading_history")
    .upsert(
      { clerk_id: userId, article_id: articleId, read_at: new Date().toISOString() },
      { onConflict: "clerk_id,article_id" }
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createServerClient } from "@/lib/supabase/server";
import { ADMIN_USER_IDS } from "@/lib/admin";

export async function GET() {
  const supabase = createServerClient();
  const { data } = await supabase
    .from("site_settings")
    .select("byline")
    .eq("id", 1)
    .single();

  return NextResponse.json({ settings: data?.byline ?? null });
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId || !ADMIN_USER_IDS.includes(userId)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const settings = await req.json();
  const supabase = createServerClient();

  const { error } = await supabase
    .from("site_settings")
    .upsert({ id: 1, byline: settings });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

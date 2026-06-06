import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ADMIN_USER_IDS } from "@/lib/admin";
import { createServerClient } from "@/lib/supabase/server";

export async function GET() {
  const { userId } = await auth();
  if (!userId || !ADMIN_USER_IDS.includes(userId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = createServerClient();
  const { data, error } = await supabase.storage
    .from("article-images")
    .list("", { limit: 1000 });

  if (error) {
    return NextResponse.json({ totalMb: null, fileCount: 0 });
  }

  const files = data ?? [];
  const totalBytes = files.reduce((sum, f) => sum + ((f.metadata as { size?: number })?.size ?? 0), 0);
  const totalMb = parseFloat((totalBytes / (1024 * 1024)).toFixed(2));

  return NextResponse.json({ totalMb, fileCount: files.length });
}

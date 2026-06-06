import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.ARTICLES_API_SECRET;
  return !!secret && req.headers.get("authorization") === `Bearer ${secret}`;
}

// PATCH /api/pipeline/commands/[id] — pipeline marks a command as done or failed
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { status } = await req.json();
  if (status !== "done" && status !== "failed") {
    return NextResponse.json({ error: "status must be 'done' or 'failed'" }, { status: 400 });
  }

  const supabase = createServerClient();
  const { error } = await supabase
    .from("pipeline_commands")
    .update({ status, executed_at: new Date().toISOString() })
    .eq("id", params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

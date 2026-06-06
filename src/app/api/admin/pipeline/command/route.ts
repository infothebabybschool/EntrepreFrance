import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createServerClient } from "@/lib/supabase/server";

const VALID_COMMANDS = [
  "run_pipeline",
  "scrape_now",
  "post_now",
  "refresh_selection",
  "add_to_selection",
  "clear_selection",
  "generate_all",
  "generate_article",
  "clear_ready",
  "post_article",
  "mark_posted",
  "update_schedule",
  "reschedule_articles",
  "clear_scrape",
  "update_article",
] as const;

// POST /api/admin/pipeline/command — admin triggers a pipeline command
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { command, payload } = await req.json();
  if (!VALID_COMMANDS.includes(command)) {
    return NextResponse.json(
      { error: `command must be one of: ${VALID_COMMANDS.join(", ")}` },
      { status: 400 }
    );
  }

  const supabase = createServerClient();
  const { error } = await supabase
    .from("pipeline_commands")
    .insert({ command, status: "pending", payload: payload ?? null });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

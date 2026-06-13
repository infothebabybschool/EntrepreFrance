import { NextRequest, NextResponse } from "next/server";
import { sendPipelineAlert } from "@/lib/resend";

// POST /api/pipeline/alert
// Called by the Render pipeline when a run fails. Sends an alert email to ADMIN_EMAIL.
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const secret = process.env.ARTICLES_API_SECRET;

  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { subject?: unknown; message?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { subject, message } = body;
  if (!subject || typeof subject !== "string") {
    return NextResponse.json({ error: "subject is required" }, { status: 400 });
  }
  if (!message || typeof message !== "string") {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  try {
    await sendPipelineAlert(subject, message);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

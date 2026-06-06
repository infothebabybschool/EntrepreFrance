import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { sendWelcomeEmail } from "@/lib/resend";

// POST /api/newsletter/subscribe
// Public — single opt-in. Inserts subscriber with confirmed=true
// and immediately sends a welcome email via Resend.
export async function POST(req: NextRequest) {
  let body: { email?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const email = body.email;

  if (!email || typeof email !== "string") {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }

  // Basic email format check
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
  }

  const supabase = createServerClient();

  const { error } = await supabase.from("newsletter_subscribers").insert({
    email: email.toLowerCase().trim(),
    confirmed: true,
  });

  if (error) {
    // Unique constraint violation — already subscribed
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "Cette adresse email est déjà inscrite." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Send welcome email — non-blocking (don't fail the response if email fails)
  try {
    await sendWelcomeEmail(email.toLowerCase().trim());
  } catch (emailError) {
    console.error("Failed to send welcome email:", emailError);
  }

  return NextResponse.json({ success: true }, { status: 201 });
}

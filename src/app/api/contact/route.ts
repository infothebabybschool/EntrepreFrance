import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

function getResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

export async function POST(req: NextRequest) {
  const { name, email, subject, message } = await req.json() as {
    name?: string; email?: string; subject?: string; message?: string;
  };

  if (!name || !email || !message) {
    return NextResponse.json({ error: "Champs requis manquants" }, { status: 400 });
  }

  const to = process.env.CONTACT_EMAIL ?? "newsletter@bepaper.be";
  const resend = getResend();

  if (resend) {
    try {
      await resend.emails.send({
        from: "BEpaper Contact <newsletter@bepaper.be>",
        to,
        replyTo: email,
        subject: `[BEpaper Contact] ${subject ?? "Message"}`,
        html: `
          <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; color: #1a1a1a;">
            <div style="background: #0f1f3d; padding: 20px; text-align: center;">
              <h1 style="color: #fff; font-size: 22px; margin: 0;">BEpaper — Message reçu</h1>
            </div>
            <div style="padding: 24px;">
              <table style="width: 100%; border-collapse: collapse; font-family: system-ui, sans-serif; font-size: 14px;">
                <tr><td style="padding: 8px 0; color: #6b7280; width: 100px;">Nom</td><td style="padding: 8px 0; font-weight: 600;">${name}</td></tr>
                <tr><td style="padding: 8px 0; color: #6b7280;">Email</td><td style="padding: 8px 0;"><a href="mailto:${email}" style="color: #c8102e;">${email}</a></td></tr>
                <tr><td style="padding: 8px 0; color: #6b7280;">Sujet</td><td style="padding: 8px 0;">${subject ?? "—"}</td></tr>
              </table>
              <div style="margin-top: 16px; padding: 16px; background: #f9fafb; border-left: 3px solid #c8102e;">
                <p style="margin: 0; font-family: system-ui, sans-serif; font-size: 14px; line-height: 1.7; white-space: pre-wrap;">${message}</p>
              </div>
            </div>
          </div>
        `,
      });
    } catch (err) {
      console.error("Contact email failed:", err);
      // Don't fail the request — still return 200
    }
  }

  return NextResponse.json({ ok: true });
}

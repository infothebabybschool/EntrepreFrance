import { Resend } from "resend";

function getResend(): Resend {
  if (!process.env.RESEND_API_KEY) throw new Error("RESEND_API_KEY is not set");
  return new Resend(process.env.RESEND_API_KEY);
}

export async function sendPipelineAlert(subject: string, message: string): Promise<void> {
  const to = process.env.ADMIN_EMAIL;
  if (!to) throw new Error("ADMIN_EMAIL is not set");
  const resend = getResend();
  await resend.emails.send({
    from: "BEpaper Pipeline <no-reply@bepaper.be>",
    to,
    subject: `[BEpaper] ${subject}`,
    html: `
      <div style="font-family: monospace; max-width: 680px; margin: 0 auto; color: #1a1a1a;">
        <div style="background-color: #7f1d1d; padding: 16px 24px;">
          <h1 style="color: #fff; font-size: 18px; margin: 0;">⚠️ BEpaper Pipeline Alert</h1>
        </div>
        <div style="padding: 24px; background: #fafafa; border: 1px solid #e5e7eb;">
          <p style="margin: 0 0 16px 0; font-size: 15px;"><strong>${subject}</strong></p>
          <pre style="background: #1e1e1e; color: #d4d4d4; padding: 16px; border-radius: 4px;
                      font-size: 12px; white-space: pre-wrap; word-break: break-all;">${message}</pre>
          <p style="margin: 16px 0 0 0; font-size: 12px; color: #6b7280;">
            ${new Date().toISOString()} — check
            <a href="https://bepaper.vercel.app/admin/pipeline">admin panel</a> for details.
          </p>
        </div>
      </div>
    `,
  });
}

export async function sendWelcomeEmail(email: string): Promise<void> {
  const resend = getResend();
  await resend.emails.send({
    from: "BEpaper <newsletter@bepaper.be>",
    to: email,
    subject: "Bienvenue dans la newsletter BEpaper",
    html: `
      <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; color: #1a1a1a;">
        <div style="background-color: #0f1f3d; padding: 24px; text-align: center;">
          <h1 style="color: #ffffff; font-size: 28px; margin: 0;">BEpaper</h1>
          <p style="color: #c8d4e8; margin: 8px 0 0 0; font-size: 13px; letter-spacing: 1px; text-transform: uppercase;">
            L'actualité belge en français
          </p>
        </div>
        <div style="padding: 32px 24px;">
          <h2 style="font-size: 22px; margin-top: 0;">Bienvenue !</h2>
          <p style="line-height: 1.7; color: #333;">
            Merci de vous être abonné(e) à la newsletter <strong>BEpaper</strong>.
            Vous recevrez nos prochains articles directement dans votre boîte mail.
          </p>
          <p style="line-height: 1.7; color: #333;">
            En attendant, retrouvez toute l'actualité belge sur notre site.
          </p>
          <a href="https://bepaper.be"
             style="display: inline-block; margin-top: 16px; padding: 12px 24px;
                    background-color: #c8102e; color: #fff; text-decoration: none;
                    font-family: system-ui, sans-serif; font-size: 14px; border-radius: 4px;">
            Lire les derniers articles
          </a>
        </div>
        <div style="padding: 16px 24px; border-top: 1px solid #e5e7eb;
                    font-size: 12px; color: #9ca3af; font-family: system-ui, sans-serif;">
          Vous recevez cet email car vous vous êtes inscrit(e) sur BEpaper.
          Pour vous désabonner, répondez à cet email avec l'objet "désabonnement".
        </div>
      </div>
    `,
  });
}

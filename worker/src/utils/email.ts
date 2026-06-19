import nodemailer from "nodemailer";

function createTransporter() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT ?? "587");
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  return nodemailer.createTransport({
    host, port, secure: port === 465,
    auth: { user, pass },
  });
}

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  const transporter = createTransporter();
  const from = process.env.SMTP_FROM ?? process.env.SMTP_USER ?? "noreply@purerss.local";
  if (!transporter) {
    console.log("[EMAIL DEV] Reset demande pour: " + to + " - configurer SMTP pour envoyer l'email");
    return;
  }
  await transporter.sendMail({
    from, to,
    subject: "PureRSS — Réinitialisation de mot de passe",
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <h2 style="color:#58a6ff">Réinitialisation de mot de passe</h2>
        <p>Vous avez demandé à réinitialiser votre mot de passe PureRSS.</p>
        <p>Cliquez sur le bouton ci-dessous (valable 1h) :</p>
        <a href="${resetUrl}" style="display:inline-block;padding:12px 24px;background:#58a6ff;color:#0d1117;border-radius:6px;text-decoration:none;font-weight:600">Réinitialiser le mot de passe</a>
        <p style="color:#8b949e;font-size:12px;margin-top:24px">Si vous n'avez pas fait cette demande, ignorez cet email.</p>
      </div>
    `,
  });
}

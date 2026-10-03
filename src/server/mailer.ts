/**
 * Adaptador de e-mail — ADR-001 §7.
 * Backend "console" no sandbox (log estruturado); "resend" quando RESEND_API_KEY existe.
 * Nenhum dado de LEAD é enviado por e-mail/log — apenas comunicação com usuários do tenant.
 */
export type MailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export type MailResult = {
  backend: "resend" | "console";
  id: string | null;
};

async function sendViaResend(msg: MailMessage): Promise<MailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("sendViaResend chamado sem RESEND_API_KEY");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.MAIL_FROM ?? "Play Google Scraper <onboarding@resend.dev>",
      to: [msg.to],
      subject: msg.subject,
      text: msg.text,
      html: msg.html,
    }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Resend falhou (${res.status}): ${detail.slice(0, 300)}`);
  }
  const data = (await res.json()) as { id?: string };
  return { backend: "resend", id: data.id ?? null };
}

function sendViaConsole(msg: MailMessage): MailResult {
  // Log estruturado — backend do sandbox. E-mail do destinatário é do usuário
  // do tenant (não é PII de lead capturada).
  console.info(
    `[mailer:console] to=${msg.to} subject="${msg.subject}"\n${msg.text}`
  );
  return { backend: "console", id: null };
}

export async function sendMail(msg: MailMessage): Promise<MailResult> {
  if (process.env.RESEND_API_KEY) {
    try {
      return await sendViaResend(msg);
    } catch (err) {
      console.error("[mailer:resend] falhou, caindo para console:", err);
    }
  }
  return sendViaConsole(msg);
}

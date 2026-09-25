import type { HandoffParams } from "./handoff";

const DOMAIN = "mail.nathanarthur.com";

export type Mail = { from: string; to: string; replyTo: string; subject: string; text: string };

/** The plain-text notification Nathan gets for a Handoff. Visitor text is never rendered as HTML (ADR 0003). */
export function handoffEmail(p: HandoffParams, to: string): Mail {
  const oneLine = p.message.replace(/\s+/g, " ");
  const transcript = p.turns.length
    ? p.turns.map((t) => `Visitor: ${t.question}\n\nBot: ${t.answer}`).join("\n\n---\n\n")
    : "(No questions asked before this message.)";
  return {
    from: `natbot <handoff@${DOMAIN}>`,
    to,
    replyTo: p.email,
    subject: `Handoff: ${oneLine.length > 60 ? `${oneLine.slice(0, 60)}…` : oneLine}`,
    text: [
      p.message,
      `From: ${p.email} (reply to this email to answer them)`,
      `Recent conversation:\n\n${transcript}`,
      `Conversation ${p.conversation}, ${p.sentAt}`,
    ].join("\n\n======\n\n"),
  };
}

export async function sendMail(apiKey: string, mail: Mail): Promise<void> {
  const form = new FormData();
  form.set("from", mail.from);
  form.set("to", mail.to);
  form.set("h:Reply-To", mail.replyTo);
  form.set("subject", mail.subject);
  form.set("text", mail.text);
  const res = await fetch(`https://api.mailgun.net/v3/${DOMAIN}/messages`, {
    method: "POST",
    headers: { Authorization: `Basic ${btoa(`api:${apiKey}`)}` },
    body: form,
    // Shorter than the Workflow step's timeout, which doesn't abort the request itself.
    signal: AbortSignal.timeout(20_000),
  });
  // Only the status: the body can echo the Visitor's address, and Mailgun's own logs keep the details.
  if (!res.ok) throw new Error(`mailgun ${res.status}`);
}

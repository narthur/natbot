import { expect, test, vi } from "vitest";
import { handoffEmail, sendMail } from "./mail";

const params = {
  conversation: "c1",
  message: "Has he used Kafka?\nAnd Flink?",
  email: "recruiter@example.com",
  turns: [{ question: "What is TaskRatchet?", answer: "A productivity app." }],
  sentAt: "2026-09-24T12:00:00.000Z",
};

test("the notification goes to Nathan, replies go to the Visitor, and the body is plain text", () => {
  const mail = handoffEmail(params, "nathan@nathanarthur.com");
  expect(mail).toMatchObject({
    from: "natbot <handoff@mail.nathanarthur.com>",
    to: "nathan@nathanarthur.com",
    replyTo: "recruiter@example.com",
    subject: "Handoff: Has he used Kafka? And Flink?",
  });
  expect(mail.text).toContain("Has he used Kafka?\nAnd Flink?");
  expect(mail.text).toContain("Visitor: What is TaskRatchet?\n\nBot: A productivity app.");
  expect(mail.text).toContain("Conversation c1, 2026-09-24T12:00:00.000Z");
});

test("long messages are cut short in the subject, which never spans lines", () => {
  const { subject } = handoffEmail({ ...params, message: `${"word ".repeat(30)}\r\nBcc: x@y.com`, turns: [] }, "n@n.com");
  expect(subject).not.toMatch(/[\r\n]/);
  expect(subject.length).toBeLessThanOrEqual("Handoff: ".length + 61);
});

test("sendMail posts the fields to Mailgun with the domain key", async () => {
  const fetch = vi.fn(async (_url: string, _init: RequestInit) => new Response("{}"));
  vi.stubGlobal("fetch", fetch);
  await sendMail("key-123", handoffEmail(params, "nathan@nathanarthur.com"));
  const [url, init] = fetch.mock.calls[0] ?? [];
  expect(url).toBe("https://api.mailgun.net/v3/mail.nathanarthur.com/messages");
  expect(init?.method).toBe("POST");
  expect(init?.signal).toBeInstanceOf(AbortSignal);
  expect(new Headers(init?.headers).get("Authorization")).toBe(`Basic ${btoa("api:key-123")}`);
  const form = init?.body as FormData;
  expect(form.get("to")).toBe("nathan@nathanarthur.com");
  expect(form.get("h:Reply-To")).toBe("recruiter@example.com");
  expect(form.get("from")).toBe("natbot <handoff@mail.nathanarthur.com>");
  expect([...form.keys()].sort()).toEqual(["from", "h:Reply-To", "subject", "text", "to"]);
});

test("a Mailgun error throws with the status and body, so the Workflow retries", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("Forbidden", { status: 401 })));
  await expect(sendMail("bad", handoffEmail(params, "n@n.com"))).rejects.toThrow("mailgun 401: Forbidden");
});

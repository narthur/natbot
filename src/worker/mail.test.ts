import { expect, test } from "vitest";
import { handoffEmail } from "./mail";

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

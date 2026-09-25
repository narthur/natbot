import { writeFileSync } from "node:fs";
import { createWorkersAI } from "workers-ai-provider";
import { afterAll, describe, expect, test } from "vitest";
import { answer, MODEL } from "../src/worker/answer";
import { type Case, cases } from "./cases";
import { credentials } from "./credentials";
import { JUDGE_MODEL, judge } from "./judge";

// EVAL_MODEL compares another model against the same cases; EVAL_RUNS repeats each case, since answers vary.
const model = process.env.EVAL_MODEL ?? MODEL;
const runs = Number(process.env.EVAL_RUNS ?? 1);
const workersai = createWorkersAI(credentials());

type Outcome = { text: string; drafts: string[] };
type Result = { case: Case; run: number; outcome: Outcome; failures: string[] };
const results: Result[] = [];

/** Runs the question through the real answer pipeline, with every gate open and only the given history. */
async function ask(c: Case): Promise<Outcome> {
  const turns = [...(c.history ?? [])];
  const res = await answer([{ id: "q", role: "user", parts: [{ type: "text", text: c.question }] }], {
    withinRateLimit: async () => true,
    human: { verified: () => true, verify: async () => true, markVerified: () => {} },
    spendBudget: async () => true,
    history: { recent: (limit) => turns.slice(-limit), record: () => {} },
    model: workersai(model),
  });
  const events = (await res.text())
    .split("\n")
    .filter((line) => line.startsWith("data: {"))
    .map((line) => JSON.parse(line.slice("data: ".length)));
  const error = events.find((e) => e.type === "error");
  if (error) throw new Error(`answer stream failed: ${error.errorText}`);
  return {
    text: events
      .filter((e) => e.type === "text-delta")
      .map((e) => e.delta)
      .join(""),
    drafts: events
      .filter((e) => e.type === "tool-input-available" && e.toolName === "draftHandoff")
      .map((e) => String(e.input?.question ?? "")),
  };
}

async function grade(c: Case, { text, drafts }: Outcome): Promise<string[]> {
  const { draft, draftNot = [], not = [], judge: rubric } = c.expect;
  const failures = [
    ...(draft === true && drafts.length === 0 ? ["expected a draft Handoff, got none"] : []),
    ...(draft === false && drafts.length > 0 ? [`expected no draft Handoff, got ${JSON.stringify(drafts)}`] : []),
    ...draftNot.flatMap((p) => drafts.filter((d) => p.test(d)).map((d) => `draft matches ${p}: ${JSON.stringify(d)}`)),
    ...not.filter((p) => p.test(text)).map((p) => `answer matches ${p}`),
  ];
  if (!rubric) return failures;
  const verdict = await judge(workersai(JUDGE_MODEL), { question: c.question, answer: text, drafted: drafts[0], rubric });
  return verdict.pass ? failures : [...failures, `judge: ${verdict.reason}`];
}

describe.each([...new Set(cases.map((c) => c.category))])("%s", (category) => {
  test.concurrent.each(
    cases.filter((c) => c.category === category).flatMap((c) => Array.from({ length: runs }, (_, run) => ({ c, run }))),
  )("$c.id (run $run)", async ({ c, run }) => {
    // A run that errors (the model or the judge) still lands in the report, as a failure.
    const empty: Outcome = { text: "", drafts: [] };
    const outcome = await ask(c).catch((error) => ({ ...empty, error: String(error) }));
    const failures =
      "error" in outcome ? [`error: ${outcome.error}`] : await grade(c, outcome).catch((error) => [`judge error: ${error}`]);
    results.push({ case: c, run, outcome, failures });
    expect(failures, `answer: ${outcome.text}`).toEqual([]);
  });
});

afterAll(() => {
  const rows = [...new Set(cases.map((c) => c.category))].map((category) => {
    const rs = results.filter((r) => r.case.category === category);
    return `| ${category} | ${rs.filter((r) => r.failures.length === 0).length}/${rs.length} |`;
  });
  const failed = results.filter((r) => r.failures.length > 0);
  const passed = results.length - failed.length;
  const report = [
    "<!-- natbot-eval -->",
    `## Adversarial eval: ${passed}/${results.length} passed`,
    "",
    `Model \`${model}\`, judge \`${JUDGE_MODEL}\`, ${runs} run(s) per case.`,
    "",
    "| Category | Passed |",
    "| --- | --- |",
    ...rows,
    ...(failed.length
      ? [
          "",
          "### Failures",
          "",
          ...failed.map(
            (r) =>
              `- **${r.case.id}** (${r.case.category}): ${r.failures.join("; ")}\n  - Q: ${r.case.question}\n  - A: ${r.outcome.text.replace(/\s+/g, " ").slice(0, 300) || "(no text)"}`,
          ),
        ]
      : []),
  ].join("\n");
  writeFileSync("evals/report.md", `${report}\n`);
  writeFileSync("evals/results.json", JSON.stringify(results, null, 2));
});

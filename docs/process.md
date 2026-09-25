# How natbot was built

natbot was built with [Claude Code](https://claude.com/claude-code), Anthropic's coding agent. [PROMPTS.md](../PROMPTS.md) holds every prompt Nathan typed. Those prompts are short because a lot of standing scaffolding sat around them, shaping what the agent did with each one. That scaffolding doesn't show up in the prompts, so it is described here.

Division of labour: the agent wrote the code, ran the reviews and drove each PR until it was ready to merge. Nathan made the product and design decisions, set every secret himself (they were never pasted into the chat), and merged every PR. A hook stops the agent from merging on its own.

## Standing instructions

A private, global instruction file applies to every Claude Code session on Nathan's machine. The parts that shaped this project:

- **Calibrated help.** The agent judges how well Nathan knows the code being touched. Where he knows it, the agent just acts. Where he may not, it asks one short probe question (marked 🍎), either before acting when the stakes are high or after finishing when the question is only for his learning. Probes may draw on a list of concepts his Anki flashcard reviews show he keeps missing.
- **Question markers.** 🔀 marks a decision that's Nathan's to make; 🍎 marks a probe. Nothing else gets an emoji, so the two can be told apart at a glance.
- **Grilling.** Design interviews ask one question at a time, each with a recommended answer.
- **Past decisions on their merits.** When a change contradicts an earlier decision, the agent finds that decision's recorded reasoning and says whether it still holds, rather than arguing from who made it or from consistency.
- **Voice.** Documents are written without referring to their author, and replies skip compliments.
- **Fieldnotes.** A shared Obsidian folder holds a running note for the project: goals, decisions with their reasoning and source, and status. The agent reads it before starting work and updates it afterwards, without being asked. It's private; the repo's [ADRs](adr/) and [CONTEXT.md](../CONTEXT.md) hold the parts that belong with the code.

## Skills

Skills are packaged playbooks the agent loads on demand, invoked by name (`/review-loop`) or when a task matches one.

| Skill | What it did here | Source |
| --- | --- | --- |
| `grill-with-docs` (`grilling` + `domain-modeling`) | Ran the design interviews: the product itself, Handoffs, and the architecture follow-ups. Resolved terms went into the glossary ([CONTEXT.md](../CONTEXT.md)) as they settled, and hard-to-reverse choices became [ADRs](adr/). | local |
| `improve-codebase-architecture` + `codebase-design` | An architecture review that proposed deepening the answer flow into one tested module (PR #11) and led to ADR 0005 on where Turnstile sits. | local |
| `review-loop` | The review every change went through before it was pushed. See below. | [narthur/skills](https://github.com/narthur/skills/tree/main/skills/review/review-loop) |
| `code-analysis` | The deterministic half of review-loop: runs the analyzers that fit the repo (oxlint, Semgrep, gitleaks, markdownlint, accessibility checks and others), applies safe autofixes, and reports the rest. | [narthur/skills](https://github.com/narthur/skills/tree/main/skills/review/code-analysis) |
| `wrangler` | Checks current Wrangler docs and the config schema rather than relying on the model's memory of them. | local |
| `fieldnotes` | The conventions for the shared notes described above. | local |

The page's visual design was explored on a Claude Artifacts design canvas: seven directions (A–G), then a phone version of the chosen one, "F · Ink".

## review-loop and the push gate

Every commit Nathan's agent writes has to pass review-loop before it can be pushed:

1. **Deterministic analysis** (`code-analysis`) over the diff.
2. **Parallel review agents**, each with one focus: project standards, bugs (including things the change should have done but didn't), git history (does this undo a past fix?), code comments, test coverage, a security review, and, for feature work, whether the change does what it set out to do.
3. **Scoring and routing.** An independent model scores each finding. High-confidence, low-risk fixes are applied automatically; anything ambiguous or hard to undo goes to Nathan as a question.
4. **Tests, commit, repeat**, up to three cycles, until a cycle finds nothing to fix.
5. **Evidence.** For changes to behavior, the app is run and checked: Playwright screenshots at desktop and phone sizes, real questions against Workers AI, real Handoffs.

Two files carry what the loop learns from run to run, both kept in the repo's `.git/info` so they never land in commits: a **learnings** file (findings Nathan dismissed, so they aren't raised again, and patterns he wants enforced) and a **threat model** (entry points, trust boundaries and security-relevant facts, each pinned to the file and commit it came from).

A global git **pre-push hook** enforces it: a push of Nathan's own commits is blocked unless review-loop recorded that exact commit as reviewed. A change too small to review, such as the prompt log, can be recorded as *skipped* with a stated reason instead, which the gate accepts but keeps distinct from a review.

When run here, the loop was sized to the change. Small follow-ups got one reviewer, while larger ones got several in parallel.

## Hooks and plugins

Hooks are scripts Claude Code runs at fixed points in a session.

- **Prompt log** ([`.claude/hooks/log-prompt.sh`](../.claude/hooks/log-prompt.sh), in this repo). Appends every prompt to PROMPTS.md.
- **[security-guidance](https://github.com/anthropics/claude-plugins-official/tree/main/plugins/security-guidance) plugin.** Pattern warnings on risky edits, an LLM review of the diff at the end of each turn, and an agentic security review on every `git commit`. That commit review runs as its own Claude session, which is where the automated "Review this change for security vulnerabilities" prompts come from; they're not in PROMPTS.md because nobody typed them.
- **[Ponytail](https://github.com/DietrichGebert/ponytail) plugin.** A "lazy senior developer" mode, applied at session start: use what the platform or an installed dependency already provides, write the smallest change that works, and mark deliberate shortcuts in comments.
- **Guards** (global, on Nathan's machine). These put a human approval step back in front of risky actions, even in the agent's autonomous modes:
  - an **egress guard** on commands that can send data off the machine
  - a **sensitive-file guard** on edits to CI workflows, `.env` files and credentials
  - a **merge guard** on merging pull requests

## Verification outside the agent

- **CI** ([`ci.yml`](../.github/workflows/ci.yml)): build and unit tests on every PR.
- **Adversarial eval** ([`eval.yml`](../.github/workflows/eval.yml)): the 29-case eval against real Workers AI on PRs that could change answers. It posts a report on the PR and chose the production model ([#20](https://github.com/narthur/natbot/pull/20)).
- **Third-party checks on GitHub:** CodeRabbit reviews each PR, and its findings were addressed on the PR. GitGuardian scans for secrets, Socket checks dependencies, and Dependabot keeps them current.

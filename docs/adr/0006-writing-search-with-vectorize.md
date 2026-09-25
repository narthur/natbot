# Nathan's writing is searched through Vectorize; the Profile is not

The bot can search Nathan's published writing: his newsletter and his posts on the Beeminder blog. That is roughly 70 posts and 90k tokens. The whole Profile goes in every prompt (ADR 0002), but sending the writing too would multiply the cost of every answer. So the writing is split into passage-sized chunks, embedded with Workers AI, and stored in Vectorize. The model reaches it through a `searchWriting` tool.

ADR 0002 rejected retrieval for the Profile because a chunk that isn't retrieved looks like a fact that doesn't exist. That risk is smaller here. The Profile is still whole in every prompt, and a missed passage leaves the model where it would be without the writing: the Profile doesn't answer, so it offers a Handoff.

The writing is a second source, below the Profile. The model attributes and dates what it uses from a post and never restates a post as a current fact about Nathan. Where a post and the Profile disagree, the Profile wins. The page lists the posts each search returned, taken from the tool's result, so the Visitor can check the source without relying on the model to cite it.

## Considered options

- **Retrieval on every question**, with passages added to the prompt automatically. Rejected: every answer would pay for passages, including answers the Profile already covers. In an eval experiment it did no better at offering Handoffs than the tool.
- **Indexing from CI on deploy.** Rejected: the index would only be as fresh as the last deploy, and CI would need a Cloudflare token that can write to Vectorize. Instead, a daily cron starts a Workflow inside the Worker.

## Consequences

- Posts that are personal, or job-search updates, are kept out by a list of slugs in `src/worker/writing.ts`, which Nathan reviews. A change takes effect on the next index run (`wrangler workflows trigger natbot-index`).
- The Beeminder posts open with an introduction the blog's editors wrote. Each post is listed with the first sentence that is Nathan's, and indexing starts there.
- A question can take up to three model calls: a search, a draft, then the answer.
- Evals build the same index in memory from the live posts, so they need no Vectorize access.

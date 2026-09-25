import { instrumentWorkflowWithSentry } from "@sentry/cloudflare";
import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep, type WorkflowStepConfig } from "cloudflare:workers";
import { createWorkersAI } from "workers-ai-provider";
import { sentryOptions } from "./sentry";
import { chunk, EMBEDDING_MODEL, embedChunks, fetchPosts, hash, type Manifest, postKey, staleIds } from "./writing";

const MANIFEST_KEY = "manifest";

/**
 * Brings the writing index up to date (issue #28): embeds new and changed Posts, deletes vectors for Posts that are
 * gone. Runs daily from the cron trigger, or by hand with `wrangler workflows trigger natbot-index`.
 */
class WritingIndexWorkflow extends WorkflowEntrypoint<Env> {
  async run(_event: WorkflowEvent<unknown>, step: WorkflowStep) {
    const retry: WorkflowStepConfig = { retries: { limit: 3, delay: "1 minute", backoff: "exponential" }, timeout: "5 minutes" };
    const posts = await step.do("fetch posts", retry, fetchPosts);
    const before = await step.do("read manifest", async () => (await this.env.WRITING_INDEX.get<Manifest>(MANIFEST_KEY, "json")) ?? {});
    const model = createWorkersAI({ binding: this.env.AI, gateway: { id: "natbot" } }).textEmbedding(EMBEDDING_MODEL);

    const after: Manifest = {};
    for (const post of posts) {
      const h = await hash(post);
      const known = before[postKey(post)];
      after[postKey(post)] =
        known?.hash === h
          ? known
          : await step.do(`index ${postKey(post)}`, retry, async () => {
              const chunks = chunk(post);
              const vectors = await embedChunks(model, chunks);
              await this.env.WRITING.upsert(
                chunks.map(({ id, ...metadata }, i) => ({ id, values: vectors[i] ?? [], metadata })),
              );
              return { hash: h, ids: chunks.map((c) => c.id) };
            });
    }

    const stale = staleIds(before, after);
    if (stale.length) await step.do("delete stale vectors", retry, async () => void (await this.env.WRITING.deleteByIds(stale)));
    await step.do("save manifest", retry, () => this.env.WRITING_INDEX.put(MANIFEST_KEY, JSON.stringify(after)));
    return { posts: posts.length, indexed: Object.keys(after).filter((k) => after[k] !== before[k]).length, deleted: stale.length };
  }
}

// A run that fails for good leaves the index as it was; the error reaches Sentry.
const InstrumentedWritingIndexWorkflow = instrumentWorkflowWithSentry(sentryOptions, WritingIndexWorkflow);
export { InstrumentedWritingIndexWorkflow as WritingIndexWorkflow };

import { type EmbeddingModel, embedMany } from "ai";

/**
 * Nathan's published writing, which the model can search (issue #28, ADR 0006): his newsletter and his Beeminder
 * blog posts. Posts are quoted with their date and link, and the Profile wins over them.
 */

export const FEED = "https://nathanarthur.com/rss.xml";
// Chosen for separating related from unrelated text best of the Workers AI embedding models tried.
export const EMBEDDING_MODEL = "@cf/qwen/qwen3-embedding-0.6b";
// Qwen3 embeddings expect queries, but not documents, to carry an instruction.
const QUERY_PREFIX = "Instruct: Given a question about Nathan Arthur, find passages of his writing that answer it\nQuery: ";
// Enough for a question that spans a few posts; each passage adds to every later model call's input.
export const SEARCH_RESULTS = 5;
// Relevant passages scored 0.40-0.66 on sample questions, unrelated ones under 0.37.
export const MIN_SCORE = 0.4;
// About 300 tokens: a few paragraphs, enough to quote in context, small enough to stay on one topic.
const CHUNK_CHARS = 1200;

/**
 * Newsletter posts to index, by slug: ones about work that a recruiter-facing bot can quote. A new post stays out
 * until it's added here, so a personal or job-search post is never indexed by default. Nathan reviews this list; a
 * change takes effect on the next index run.
 */
export const INCLUDED = new Set([
  "hills-to-die-on",
  "words-in-mouths",
  "why-im-leaving-rendercom",
  "the-limits-of-vibe-coding",
  "github-cli-alias-to-prep-git-for",
  "tips-for-effective-skill-design",
  "finding-clients-in-the-age-of-ai",
  "minimax-m27-openais-symphony-etc",
  "business-incentives-of-ai-token-pricing",
  "i-am-no-longer-a-programmer",
  "taskratchet-database-switch-making",
  "state-of-the-workflow-ai-for-client",
  "writing-with-ai-responsibly",
  "skills-bills-and-aligning-incentives",
  "vibe-kanban-claude-code-skills-dotfiles",
  "experimenting-with-vibe-kanban",
  "my-ai-illustration-workflow",
  "new-buzz-functionality-terminal-screenshots",
  "claude-cowork-links-roundup",
  "solution-for-large-branches-gitbutler",
  "iterating-on-a-pr-extraction-workflow",
  "fast-pr-feedback-review-with-saved",
  "i-cant-wait-for-remix-3",
  "publishing-my-dotfiles",
  "digital-employees",
  "choosing-a-laptop-updating-buzz-etc",
  "adding-sentry-and-neon-to-taskratchet",
  "ai-as-slot-machine-programming",
  "taskratchet-bugs-cursor-2-and-rails",
  "taskratchet-on-cloudflare-cursor",
  "buzz-updates-monorepos-and-ai-dev",
  "buzz-a-terminal-interface-for-beeminder",
  "terminal-first-dev-and-a-few-interesting",
  "spec-driven-dev-tuis-etc",
  "link-roundup-taskratchet-api-update",
  "labor-day-update-link-roundup",
  "ai-for-code-review-coderabbit",
  "toward-ai-friendly-software-architecture",
  "links-measuring-ais-impact-on-productivity",
  "ai-for-coding-collaborate-or-delegate",
  "future-changes-to-taskratchet",
  "agentic-coding-tool-failure-modes",
  "the-tools-im-using",
  "on-writing-publicly",
  "ai-after-tdd-pt-3-preserving-risk",
  "ai-after-tdd-keeping-test-coverage",
  "is-test-driven-development-dead",
  "ensuring-code-quality-in-the-age-of-ai",
  "will-ai-make-us-all-managers",
  "limiting-fixed-bid-contract-risk",
  "zed-vs-vs-code-cursor",
  "ai-for-business-data-using-ai-coding-tools-responsibly",
  "issue-0",
]);

/**
 * Nathan's Beeminder blog posts. Each opens with an introduction Beeminder's editors wrote, so indexing starts at
 * the first sentence that is his. "cbt" (Beeminder vs CBT) is left out as personal.
 * ponytail: a fixed list, since he rarely posts there; a new post needs adding here with its first sentence.
 */
export const BEEMINDER_POSTS = [
  { slug: "taskratchet", title: "Announcing TaskRatchet: Like Beeminder for Your Todo List", date: "2020-06-22", start: "So many tasks, so little time." },
  { slug: "astroblog", title: "Ex WordPress Ad Astro Per Narthurius", date: "2023-09-06", start: "WordPress is the de facto standard" },
];

export type Source = "newsletter" | "beeminder";
export type Post = { source: Source; slug: string; title: string; date: string; url: string; text: string };
/** One searchable piece of a Post. Its id is stable (Vectorize caps ids at 64 bytes, so the slug goes last), so re-indexing a Post overwrites its old chunks. */
export type Chunk = Omit<Post, "text"> & { id: string; text: string };
/** A search result, as the model and the page see it. */
export type Hit = { title: string; date: string; url: string; source: Source; text: string };

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const decode = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) =>
    e[0] === "#"
      ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? Number.parseInt(e.slice(2), 16) : Number(e.slice(1)))
      : (ENTITIES[e.toLowerCase()] ?? m),
  );

/** Readable text from HTML: one block element per paragraph, tags and scripts dropped. */
export function htmlToText(html: string): string {
  return decode(
    html
      .replace(/<(script|style|figure)[\s\S]*?<\/\1>/gi, "")
      .replace(/<\/?(p|div|h[1-6]|li|ul|ol|blockquote|pre|br|tr)\b[^>]*>/gi, "\n\n")
      .replace(/<[^>]+>/g, ""),
  )
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n\n");
}

const tag = (item: string, name: string) =>
  item.match(new RegExp(`<${name}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${name}>`))?.[1] ?? "";

/** The newsletter's posts, from its RSS feed (which carries every issue in full). */
export function parseFeed(xml: string): Post[] {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, item]) => {
    const url = tag(item, "link");
    return {
      source: "newsletter" as const,
      slug: url.replace(/\/+$/, "").split("/").at(-1) ?? url,
      title: decode(tag(item, "title")),
      date: new Date(tag(item, "pubDate")).toISOString().slice(0, 10),
      url,
      // content:encoded holds escaped HTML.
      text: htmlToText(decode(tag(item, "content:encoded"))),
    };
  });
}

/** A Beeminder post's text from its published page, starting at Nathan's first sentence. */
export function beeminderText(html: string, start: string): string {
  const text = htmlToText(html);
  const from = text.indexOf(start);
  // The post's tag list follows it.
  const to = text.indexOf("\n\nTags:", from);
  if (from < 0) throw new Error("beeminder post changed: start sentence not found");
  if (to < 0) throw new Error("beeminder post changed: tag list not found");
  return text.slice(from, to).trim();
}

async function get(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": "natbot (ask.nathanarthur.com)" }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);
  return res.text();
}

/**
 * Every Post to index, fetched live: the included newsletter posts and the Beeminder posts. A Beeminder post that can't be fetched or read is
 * listed in `failed` (by postKey) instead of failing the rest; the newsletter feed failing fails the whole fetch.
 */
export async function fetchPosts(): Promise<{ posts: Post[]; failed: string[] }> {
  const feed = parseFeed(await get(FEED));
  // An empty feed is a broken response, not a newsletter with no posts: indexing it would delete every vector.
  if (!feed.length) throw new Error("newsletter feed has no posts");
  const newsletter = feed.filter((p) => INCLUDED.has(p.slug));
  const beeminder = await Promise.allSettled(
    BEEMINDER_POSTS.map(async ({ slug, title, date, start }) => {
      const url = `https://blog.beeminder.com/${slug}/`;
      return { source: "beeminder" as const, slug, title, date, url, text: beeminderText(await get(url), start) };
    }),
  );
  const failed = BEEMINDER_POSTS.filter((_, i) => beeminder[i]?.status === "rejected").map((p) => `beeminder:${p.slug}`);
  for (const r of beeminder) if (r.status === "rejected") console.error("couldn't read a beeminder post", r.reason);
  return { posts: [...newsletter, ...beeminder.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []))], failed };
}

/** A Post split at paragraph breaks into chunks of about CHUNK_CHARS; a longer paragraph stays whole. */
export function chunk(post: Post): Chunk[] {
  const pieces: string[] = [];
  for (const para of post.text.split("\n\n")) {
    const last = pieces.at(-1);
    if (last !== undefined && last.length + para.length < CHUNK_CHARS) pieces[pieces.length - 1] = `${last}\n\n${para}`;
    else pieces.push(para);
  }
  const { text: _text, ...meta } = post;
  return pieces.map((text, i) => ({ ...meta, id: `${post.source[0]}:${i}:${post.slug}`.slice(0, 64), text }));
}

/** What gets embedded for a chunk: its Post's title carries context the passage alone may lack. */
const document = (c: Chunk) => `${c.title}\n\n${c.text}`;

export async function embedChunks(model: EmbeddingModel, chunks: Chunk[]): Promise<number[][]> {
  return (await embedMany({ model, values: chunks.map(document) })).embeddings;
}

/** The nearest chunks to a vector, best first, with cosine scores. Vectorize in production, in memory in the eval. */
export type Nearest = (vector: number[], topK: number) => Promise<{ score: number; chunk: Chunk }[]>;

/** Chunks as Vectorize records: the id, and the rest of the Chunk as metadata, which vectorizeNearest reads back. */
export const toVectors = (chunks: Chunk[], vectors: number[][]): VectorizeVector[] =>
  chunks.map(({ id, ...metadata }, i) => ({ id, values: vectors[i] ?? [], metadata }));

/** Search over Vectorize, whose records toVectors wrote. */
export const vectorizeNearest =
  (index: VectorizeIndex): Nearest =>
  async (vector, topK) =>
    (await index.query(vector, { topK, returnMetadata: "all" })).matches.map((m) => ({
      score: m.score,
      chunk: { ...(m.metadata as Omit<Chunk, "id">), id: m.id },
    }));

const cosine = (a: number[], b: number[]) =>
  a.reduce((s, x, i) => s + x * (b[i] ?? 0), 0) / Math.hypot(...a) / Math.hypot(...b);

/** Search over chunks held in memory: the eval's stand-in for Vectorize. */
export const inMemoryNearest =
  (chunks: Chunk[], vectors: number[][]): Nearest =>
  async (vector, topK) =>
    chunks
      .map((chunk, i) => ({ score: cosine(vector, vectors[i] ?? []), chunk }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

/**
 * Passages of Nathan's writing relevant to any of `queries`, searched together: the best SEARCH_RESULTS passages
 * overall, each once, best first.
 */
export async function searchWriting(queries: string[], model: EmbeddingModel, nearest: Nearest): Promise<Hit[]> {
  const { embeddings } = await embedMany({ model, values: queries.map((q) => QUERY_PREFIX + q) });
  const matches = (await Promise.all(embeddings.map((e) => nearest(e, SEARCH_RESULTS))))
    .flat()
    .filter((m) => m.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score);
  return matches
    .filter((m, i) => matches.findIndex((n) => n.chunk.id === m.chunk.id) === i)
    .slice(0, SEARCH_RESULTS)
    .map(({ chunk: { title, date, url, source, text } }) => ({ title, date, url, source, text }));
}

/** What's in the index: each Post's content hash and the ids of its vectors, keyed by source and slug. */
export type Manifest = Record<string, { hash: string; ids: string[] }>;

export const postKey = (p: Post) => `${p.source}:${p.slug}`;

/** A Post's content hash. The model is part of it, so changing models re-embeds everything. */
export async function hash(post: Post): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify([EMBEDDING_MODEL, post.title, post.date, post.url, post.text]));
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * The new manifest, with each Post that couldn't be read this run keeping what's indexed for it rather than being
 * deleted. A Post is either read or failed, never both; if it were both, this run's entry would win.
 */
export const keepFailed = (before: Manifest, indexed: Manifest, failed: string[]): Manifest => ({
  ...Object.fromEntries(failed.flatMap((k) => (before[k] ? [[k, before[k]]] : []))),
  ...indexed,
});

/** Vector ids the old manifest has that the new one doesn't: Posts that were removed or taken off INCLUDED, and chunks a shorter Post no longer has. */
export function staleIds(before: Manifest, after: Manifest): string[] {
  const kept = new Set(Object.values(after).flatMap((e) => e.ids));
  return Object.values(before).flatMap((e) => e.ids.filter((id) => !kept.has(id)));
}

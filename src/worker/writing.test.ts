import { MockEmbeddingModelV4 } from "ai/test";
import { afterEach, expect, test, vi } from "vitest";
import {
  beeminderText,
  type Chunk,
  chunk,
  EXCLUDED,
  fetchPosts,
  hash,
  htmlToText,
  inMemoryNearest,
  keepFailed,
  type Manifest,
  MIN_SCORE,
  parseFeed,
  type Post,
  searchWriting,
  staleIds,
  toVectors,
  vectorizeNearest,
} from "./writing";


const feed = `<?xml version="1.0"?><rss><channel><title>Narthur Online</title>
<item><title>Is Test-Driven Development Dead?</title><link>https://nathanarthur.com/writing/is-tdd-dead</link>
<pubDate>Sun, 20 Sep 2026 10:16:00 GMT</pubDate><content:encoded>&lt;figure&gt;&lt;img src=&quot;x.webp&quot;&gt;&lt;/figure&gt;
&lt;p&gt;Tests &amp;amp; AI.&lt;/p&gt;&lt;p&gt;It&amp;#8217;s   &lt;em&gt;complicated&lt;/em&gt;.&lt;/p&gt;</content:encoded></item>
</channel></rss>`;

test("the feed's posts come out as plain text, with a date and slug", () => {
  expect(parseFeed(feed)).toEqual([
    {
      source: "newsletter",
      slug: "is-tdd-dead",
      title: "Is Test-Driven Development Dead?",
      date: "2026-09-20",
      url: "https://nathanarthur.com/writing/is-tdd-dead",
      text: "Tests & AI.\n\nIt’s complicated.",
    },
  ]);
});

test("htmlToText keeps paragraphs and list items apart and drops scripts", () => {
  expect(htmlToText("<p>One<br>two</p><script>x()</script><ul><li>a</li><li>b &lt;c&gt;</li></ul>")).toBe("One\n\ntwo\n\na\n\nb <c>");
});

test("a Beeminder post starts at Nathan's first sentence, after the editors' introduction, and stops at its tags", () => {
  const page = "<h1>Title</h1><p>Nathan (aka narthur) wrote this for us.</p><p>So many tasks, so little time.</p><p>More.</p><div>Tags: <ul><li>meta</li></ul></div>";
  expect(beeminderText(page, "So many tasks")).toBe("So many tasks, so little time.\n\nMore.");
  expect(() => beeminderText(page, "missing")).toThrow("start sentence not found");
  expect(() => beeminderText("<p>So many tasks.</p>", "So many tasks")).toThrow("tag list not found");
});

test("job-search updates and personal posts are excluded", () => {
  expect(EXCLUDED.has("the-job-search-begins")).toBe(true);
  expect(EXCLUDED.has("surfing-your-motivation")).toBe(true);
});

const post: Post = { source: "newsletter", slug: "p", title: "T", date: "2026-01-01", url: "https://x/p", text: "" };

test("chunks join paragraphs up to the size limit, with stable ids", () => {
  const para = "x".repeat(500);
  const chunks = chunk({ ...post, text: [para, para, para, "short"].join("\n\n") });
  expect(chunks.map((c) => c.text.length)).toEqual([1002, 507]);
  expect(chunks.map((c) => c.id)).toEqual(["n:0:p", "n:1:p"]);
  expect(chunk({ ...post, slug: "s".repeat(80) })[0]?.id).toHaveLength(64);
});

test("search keeps passages above MIN_SCORE, best first, without their ids", async () => {
  const model = new MockEmbeddingModelV4({ doEmbed: async () => ({ embeddings: [[1, 0]], warnings: [] }) });
  const c = (id: string): { score: number; chunk: Chunk } => ({ score: 0, chunk: { ...post, id, text: id } });
  const hits = await searchWriting("q", model, async (_v, k) => {
    expect(k).toBe(5);
    return [{ ...c("good"), score: MIN_SCORE + 0.1 }, { ...c("weak"), score: MIN_SCORE - 0.01 }];
  });
  expect(hits).toEqual([{ title: "T", date: "2026-01-01", url: "https://x/p", source: "newsletter", text: "good" }]);
});

test("stale ids are the ones the new manifest dropped: removed posts and chunks a post lost", () => {
  const before: Manifest = { "n:a": { hash: "1", ids: ["a0", "a1"] }, "n:gone": { hash: "2", ids: ["g0"] } };
  const after: Manifest = { "n:a": { hash: "3", ids: ["a0"] } };
  expect(staleIds(before, after)).toEqual(["a1", "g0"]);
});

afterEach(() => vi.unstubAllGlobals());

/** Serves the feed and each Beeminder post's page from memory. */
function stubSite(feedXml: string) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      url.endsWith("rss.xml")
        ? new Response(feedXml)
        : new Response(`<p>So many tasks, so little time.</p><p>WordPress is the de facto standard.</p><div>Tags: x</div>`),
    ),
  );
}

test("fetchPosts drops excluded newsletter posts and keeps the Beeminder posts", async () => {
  stubSite(feed.replace("<item>", "<item><title>Job</title><link>https://nathanarthur.com/writing/the-job-search-begins</link><pubDate>Sun, 20 Sep 2026 10:16:00 GMT</pubDate><content:encoded>x</content:encoded></item><item>"));
  const { posts, failed } = await fetchPosts();
  expect(posts.map((p) => `${p.source}:${p.slug}`)).toEqual(["newsletter:is-tdd-dead", "beeminder:taskratchet", "beeminder:astroblog"]);
  expect(failed).toEqual([]);
});

test("a Beeminder post that can't be read is reported as failed without failing the rest", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      url.endsWith("rss.xml")
        ? new Response(feed)
        : url.includes("astroblog")
          ? new Response("gone", { status: 404 })
          : new Response("<p>So many tasks, so little time.</p><div>Tags: x</div>"),
    ),
  );
  const { posts, failed } = await fetchPosts();
  expect(posts.map((p) => p.slug)).toEqual(["is-tdd-dead", "taskratchet"]);
  expect(failed).toEqual(["beeminder:astroblog"]);
  expect(error).toHaveBeenCalledWith("couldn't read a beeminder post", expect.any(Error));
});

test("chunks written with toVectors come back from vectorizeNearest unchanged", async () => {
  const chunks = chunk({ ...post, text: "one" });
  const records = toVectors(chunks, [[1, 0]]);
  const index = {
    query: async () => ({ matches: records.map((r) => ({ id: r.id, score: 0.9, metadata: r.metadata })), count: 1 }),
  } as unknown as VectorizeIndex;
  expect(await vectorizeNearest(index)([1, 0], 5)).toEqual([{ score: 0.9, chunk: chunks[0] }]);
});

test("inMemoryNearest ranks by cosine similarity", async () => {
  const [a, b] = [chunk({ ...post, slug: "a", text: "a" }), chunk({ ...post, slug: "b", text: "b" })].flat();
  const nearest = inMemoryNearest([a!, b!], [[1, 0], [0, 1]]);
  expect((await nearest([0.1, 1], 2)).map((m) => m.chunk.slug)).toEqual(["b", "a"]);
});

test("an empty feed fails the fetch rather than looking like a newsletter with no posts", async () => {
  stubSite("<rss><channel></channel></rss>");
  await expect(fetchPosts()).rejects.toThrow("newsletter feed has no posts");
});

test("a Post's hash changes with its content and nothing else", async () => {
  const p: Post = { ...post, text: "a" };
  expect(await hash(p)).toBe(await hash({ ...p }));
  for (const change of [{ text: "b" }, { title: "U" }, { date: "2026-01-02" }, { url: "https://x/q" }]) {
    expect(await hash({ ...p, ...change })).not.toBe(await hash(p));
  }
});

test("a Post that failed to read keeps its entry, so its vectors aren't stale; a removed one is still stale", () => {
  const before: Manifest = { "beeminder:a": { hash: "1", ids: ["a0"] }, "beeminder:gone": { hash: "2", ids: ["g0"] } };
  const after = keepFailed(before, {}, ["beeminder:a", "beeminder:new"]);
  expect(after).toEqual({ "beeminder:a": before["beeminder:a"] });
  expect(staleIds(before, after)).toEqual(["g0"]);
});

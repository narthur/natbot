import { MockEmbeddingModelV4 } from "ai/test";
import { expect, test } from "vitest";
import {
  beeminderText,
  type Chunk,
  chunk,
  EXCLUDED,
  htmlToText,
  type Manifest,
  MIN_SCORE,
  parseFeed,
  type Post,
  searchWriting,
  staleIds,
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

import { expect, test, vi } from "vitest";
import { verifyTurnstile } from "./turnstile";

const siteverify = (body: unknown) => vi.fn(async (_url: string, _init: RequestInit) => Response.json(body));

test("a token Cloudflare accepts passes", async () => {
  const fetch = siteverify({ success: true });
  vi.stubGlobal("fetch", fetch);
  expect(await verifyTurnstile("secret", "token")).toBe(true);
  expect(String(fetch.mock.calls[0]?.[1].body)).toBe("secret=secret&response=token");
});

test("a rejected, missing, or unverifiable token fails", async () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal("fetch", siteverify({ success: false, "error-codes": ["timeout-or-duplicate"] }));
  expect(await verifyTurnstile("secret", "token")).toBe(false);
  expect(console.warn).toHaveBeenCalledWith("turnstile rejected a token", ["timeout-or-duplicate"]);

  const fetch = siteverify({ success: true });
  vi.stubGlobal("fetch", fetch);
  expect(await verifyTurnstile("secret", undefined)).toBe(false);
  expect(fetch).not.toHaveBeenCalled();

  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("network down");
    }),
  );
  expect(await verifyTurnstile("secret", "token")).toBe(false);
  expect(console.error).toHaveBeenCalled();
});

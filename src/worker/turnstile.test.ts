import { expect, test, vi } from "vitest";
import { ACTION, HOSTNAME, SITEVERIFY, verifyTurnstile } from "./turnstile";

const siteverify = (body: unknown, status = 200) =>
  vi.fn(async (_url: string, _init: RequestInit) => Response.json(body, { status }));
const accepted = { success: true, hostname: HOSTNAME, action: ACTION };

test("a token Cloudflare accepts for this page passes", async () => {
  const fetch = siteverify(accepted);
  vi.stubGlobal("fetch", fetch);
  expect(await verifyTurnstile("secret", "token")).toBe(true);
  expect(fetch.mock.calls[0]?.[0]).toBe(SITEVERIFY);
  expect(fetch.mock.calls[0]?.[1].method).toBe("POST");
  expect(String(fetch.mock.calls[0]?.[1].body)).toBe("secret=secret&response=token");
});

test("a valid token from another page or action fails", async () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.stubGlobal("fetch", siteverify({ ...accepted, hostname: "nathanarthur.com" }));
  expect(await verifyTurnstile("secret", "token")).toBe(false);
  vi.stubGlobal("fetch", siteverify({ ...accepted, action: "subscribe" }));
  expect(await verifyTurnstile("secret", "token")).toBe(false);
  expect(console.warn).toHaveBeenCalledWith("turnstile token came from another page", {
    hostname: HOSTNAME,
    action: "subscribe",
  });
});

test("Cloudflare's test keys pass without a hostname or action", async () => {
  vi.stubGlobal("fetch", siteverify({ success: true, hostname: "example.com", metadata: { result_with_testing_key: true } }));
  expect(await verifyTurnstile("1x0000000000000000000000000000000AA", "XXXX.DUMMY.TOKEN.XXXX")).toBe(true);
});

test("a rejected, missing, oversized, or unverifiable token fails", async () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal("fetch", siteverify({ success: false, "error-codes": ["timeout-or-duplicate"] }));
  expect(await verifyTurnstile("secret", "token")).toBe(false);
  expect(console.warn).toHaveBeenCalledWith("turnstile rejected a token", ["timeout-or-duplicate"]);

  const fetch = siteverify(accepted);
  vi.stubGlobal("fetch", fetch);
  expect(await verifyTurnstile("secret", undefined)).toBe(false);
  expect(await verifyTurnstile("secret", "x".repeat(2049))).toBe(false);
  expect(fetch).not.toHaveBeenCalled();

  vi.stubGlobal("fetch", siteverify(accepted, 500));
  expect(await verifyTurnstile("secret", "token")).toBe(false);

  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("network down");
    }),
  );
  expect(await verifyTurnstile("secret", "token")).toBe(false);
  expect(console.error).toHaveBeenCalledTimes(2);
});

test("a bad Worker secret is logged as an error, not a visitor failing the check", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal("fetch", siteverify({ success: false, "error-codes": ["invalid-input-secret"] }));
  expect(await verifyTurnstile("wrong", "token")).toBe(false);
  expect(console.error).toHaveBeenCalledWith("turnstile secret is missing or invalid", ["invalid-input-secret"]);
});

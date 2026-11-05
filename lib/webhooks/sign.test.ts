import { describe, it, expect } from "vitest";
import { signPayload, verifySignature, RETRY_DELAYS_SECONDS, MAX_ATTEMPTS } from "./sign";

describe("webhook signatures", () => {
  it("signs timestamp dot body and verifies within the window", () => {
    const body = JSON.stringify({ id: "evt_1", type: "task.created" });
    const now = 1_762_300_000_000;
    const ts = String(Math.floor(now / 1000));
    const sig = signPayload("whsec_test", ts, body);
    expect(sig).toMatch(/^v1=[0-9a-f]{64}$/);
    expect(verifySignature("whsec_test", ts, body, sig, now)).toBe(true);
    expect(verifySignature("whsec_test", ts, body + " ", sig, now)).toBe(false);
    expect(verifySignature("whsec_other", ts, body, sig, now)).toBe(false);
    expect(verifySignature("whsec_test", ts, body, sig, now + 6 * 60_000)).toBe(false);
    expect(verifySignature("whsec_test", ts, body, "v1=short", now)).toBe(false);
  });
  it("retries six times with the documented delays", () => {
    expect(MAX_ATTEMPTS).toBe(6);
    expect(RETRY_DELAYS_SECONDS).toEqual([60, 300, 1800, 7200, 28800, 86400]);
  });
});

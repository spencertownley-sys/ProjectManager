import { createHmac, timingSafeEqual } from "node:crypto";

/*
  Webhook signatures (docs/12 section 2.3): X-TaskParty-Signature: v1=<hex HMAC SHA-256 of "<timestamp>.<raw body>">.
  Receivers rebuild the string with the X-TaskParty-Timestamp header and reject timestamps older than five minutes.
*/

export const SIGNATURE_VERSION = "v1";
export const MAX_SKEW_SECONDS = 5 * 60;

export function signPayload(secret: string, timestamp: string, rawBody: string): string {
  return `${SIGNATURE_VERSION}=${createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex")}`;
}

/** What a receiver does: checks the signature and the timestamp window. */
export function verifySignature(secret: string, timestamp: string, rawBody: string, signature: string, now = Date.now()): boolean {
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(now / 1000 - ts) > MAX_SKEW_SECONDS) return false;
  const expected = signPayload(secret, timestamp, rawBody);
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Retry delays after each failed attempt (docs/12 section 2.4): 1 min, 5 min, 30 min, 2 h, 8 h, 24 h. */
export const RETRY_DELAYS_SECONDS = [60, 5 * 60, 30 * 60, 2 * 3600, 8 * 3600, 24 * 3600] as const;
export const MAX_ATTEMPTS = RETRY_DELAYS_SECONDS.length;
export const DISABLE_AFTER_FAILURES = 20;
export const DELIVERY_TIMEOUT_MS = 10_000;

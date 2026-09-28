import { timingSafeEqual } from "node:crypto";

/*
 * Whether a request carries the scheduled-job secret.
 *
 * Vercel sends CRON_SECRET as a bearer token. The comparison is constant-time
 * so the length and the leading bytes of the secret cannot be measured from
 * response timing, and it fails closed: with no secret configured, nothing is
 * authorised, rather than everything.
 */
export function isAuthorisedCronRequest(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;

  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) return false;

  const expected = Buffer.from(secret, "utf8");
  const presented = Buffer.from(match[1].trim(), "utf8");
  if (expected.byteLength !== presented.byteLength) return false;
  return timingSafeEqual(expected, presented);
}

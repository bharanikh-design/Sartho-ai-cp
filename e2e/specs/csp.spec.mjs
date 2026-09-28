/*
 * The Content-Security-Policy, enforced by a real browser.
 *
 * A policy that blocks the page's own scripts fails in the worst way: the
 * server renders perfectly, the HTML arrives, and nothing on it works. So the
 * checks here are the ones that would catch exactly that — the browser's own
 * violation reports, and proof that the page's scripts actually ran.
 */
import { test as base, expect } from "@playwright/test";
import { sessionCookie } from "../session.mjs";

const test = base.extend({
  context: async ({ context }, runTest) => {
    await context.addCookies([sessionCookie()]);
    await runTest(context);
  },
});

/* Every complaint the browser makes about the policy, in the words it uses. */
function collectViolations(page) {
  const violations = [];
  page.on("console", (message) => {
    const text = message.text();
    if (/Content Security Policy|Refused to (load|execute|apply|connect|frame|create|compile)/i.test(text)) {
      violations.push(text);
    }
  });
  return violations;
}

async function expectEnforcedAndWorking(page, response) {
  const policy = response.headers()["content-security-policy"] ?? "";
  expect(policy, "the policy is on the response").toMatch(/script-src [^;]*'nonce-[A-Za-z0-9+/=]+'/);
  expect(policy).toContain("'strict-dynamic'");
  expect(policy).not.toMatch(/script-src [^;]*'unsafe-inline'/);

  /* Every script tag carries the nonce. A browser blanks the value but keeps the attribute. */
  await expect(page.locator("script[src]:not([nonce])")).toHaveCount(0);

  /*
   * The inline scripts ran: the first of them creates Next's page-data queue,
   * and if the policy had blocked them the page would be a static picture of
   * itself. Its shape changes once hydration consumes it, so only its
   * existence is asserted; each test then proves React is alive by using it.
   */
  await expect.poll(() => page.evaluate(() => typeof self.__next_f !== "undefined")).toBe(true);
}

base.describe("Content Security Policy, signed out", () => {
  base("the sign-in page is policed, hydrates, and draws no violation", async ({ page }) => {
    const violations = collectViolations(page);
    const response = await page.goto("/login");
    await expectEnforcedAndWorking(page, response);

    /*
     * A client component answering a click is the proof that React is alive.
     * The privacy choices open on a first visit; choosing closes them, and
     * only running JavaScript can do that.
     */
    const choices = page.getByRole("dialog", { name: "Privacy choices" });
    await expect(choices).toBeVisible();
    await choices.getByRole("button", { name: "Necessary only" }).click();
    await expect(choices).toHaveCount(0);

    expect(violations).toEqual([]);
  });

  base("the health endpoint answers a monitor without a session", async ({ request }) => {
    const response = await request.get("/api/health");
    expect([200, 503]).toContain(response.status());
    const body = await response.json();
    expect(["ok", "degraded"]).toContain(body.status);
    expect(body.checks).toHaveProperty("scheduledJobs");
    /* Not the guard's "sign in again": the route itself answered. */
    expect(body).not.toHaveProperty("error");
  });

  base("a scheduled job is answered by its own secret check, not the session guard", async ({ request }) => {
    const response = await request.get("/api/cron/daily-digest");
    expect(response.status()).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
  });
});

test.describe("Content Security Policy, signed in", () => {
  test("the workspace is policed, hydrates, and draws no violation", async ({ page }) => {
    const violations = collectViolations(page);
    const response = await page.goto("/");
    await expectEnforcedAndWorking(page, response);

    /* The workspace itself arrived, past the "securing your session" shell. */
    await expect(page.locator(".daily-brief")).toBeVisible();

    /*
     * And React is alive: the product tour opens on a first visit and closes
     * only when its click handler runs. It is modal, so it is the one control
     * on this page that is guaranteed reachable.
     */
    const closeTour = page.getByRole("button", { name: "Close product tour" });
    await expect(closeTour).toBeVisible();
    await closeTour.click();
    await expect(closeTour).toHaveCount(0);

    expect(violations).toEqual([]);
  });

  test("a page with a form and client-side state works under the policy", async ({ page }) => {
    const violations = collectViolations(page);
    const response = await page.goto("/career-direction");
    await expectEnforcedAndWorking(page, response);
    await expect(page.getByRole("textbox", { name: "Priority 1" })).toHaveValue("Principal Platform Engineer");
    expect(violations).toEqual([]);
  });
});

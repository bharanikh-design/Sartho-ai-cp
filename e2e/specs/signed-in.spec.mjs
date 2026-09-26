/*
 * Real end-to-end coverage: a real Chromium, driving the real Next server,
 * running the real server components, route handlers and `proxy.ts` auth guard.
 *
 * The only substitution is the Supabase project itself — NEXT_PUBLIC_SUPABASE_URL
 * points at the local mock in e2e/mock-supabase.mjs. No application source is
 * stubbed, patched or conditionally branched for tests.
 */
import { test as base, expect } from "@playwright/test";
import { AUTH_COOKIE_NAME, APP_URL, sessionCookie } from "../session.mjs";

/*
 * The fixture is declared here rather than in a helper module on purpose:
 * Playwright transforms spec files with its own loader, and a helper importing
 * @playwright/test through Node's ESM loader yields a second instance whose
 * `test.describe` the runner refuses.
 */
const test = base.extend({
  context: async ({ context }, use) => {
    await context.addCookies([sessionCookie()]);
    await use(context);
  },
});

test.describe("Career Direction, signed in", () => {
  test("renders the stored suggestion rail and the saved priorities", async ({ page }) => {
    await page.goto("/career-direction");

    /* The guard let us through rather than bouncing to /login. */
    await expect(page).toHaveURL(/\/career-direction$/);
    await expect(page.locator("h1")).toContainText("Let AI open the possibilities");

    /* Suggestions came from the stored set, not from a model call. */
    const rail = page.locator(".direction-suggestion-rail");
    await expect(rail.locator("h3", { hasText: "Director of Platform Engineering" })).toBeVisible();
    await expect(rail.locator("h3", { hasText: "Staff Developer Advocate" })).toBeVisible();

    /* `dismissed` is honoured: the third seeded suggestion is filtered out. */
    await expect(rail.locator("h3", { hasText: "Site Reliability Engineer" })).toHaveCount(0);

    /* The saved target lanes reached the client. */
    await expect(page.getByText("Principal Platform Engineer").first()).toBeVisible();
  });

  test("the page renders from seeded rows, not from an empty state", async ({ page }) => {
    await page.goto("/career-direction");
    /* The header metric counts the two seeded active lanes. */
    await expect(page.locator(".product-system-header")).toContainText("selected priorities");
    await expect(page.locator("body")).not.toContainText("Upload your résumé first");
  });
});

test.describe("Find Roles, signed in", () => {
  test("renders stored matches with working View links", async ({ page }) => {
    await page.goto("/search-plan");

    await expect(page).toHaveURL(/\/search-plan$/);
    await expect(page.getByRole("heading", { name: "Best matches" })).toBeVisible();

    const rows = page.locator("#find-roles .application-row");
    await expect(rows).toHaveCount(2);

    const first = rows.filter({ hasText: "Principal Platform Engineer" });
    await expect(first).toContainText("Atlassian");

    /* The "View" link must point at the advert, open in a new tab, and be safe. */
    const view = first.getByRole("link", { name: /^View/ });
    await expect(view).toHaveAttribute("href", "https://example.test/jobs/principal-platform-engineer");
    await expect(view).toHaveAttribute("target", "_blank");
    await expect(view).toHaveAttribute("rel", /noreferrer/);
  });

  test("clicking View records the interaction against the real route handler", async ({ page, context }) => {
    /* target=_blank — stub the advert so the run never leaves the container. */
    await context.route("https://example.test/**", (route) =>
      route.fulfill({ status: 200, contentType: "text/html", body: "<h1>advert</h1>" }));

    await page.goto("/search-plan");

    const posted = page.waitForRequest((request) =>
      request.url().includes("/api/candidate/interactions") && request.method() === "POST");

    await page
      .locator("#find-roles .application-row", { hasText: "Principal Platform Engineer" })
      .getByRole("link", { name: /^View/ })
      .click();

    const request = await posted;
    expect(JSON.parse(request.postData() ?? "{}")).toMatchObject({
      eventType: "search_result_viewed",
      source: "search",
      title: "Principal Platform Engineer",
    });

    /*
     * The handler answered as an authenticated caller, not with the 401 that
     * proxy.ts returns to a signed-out fetch.
     */
    const response = await request.response();
    expect(response?.status()).not.toBe(401);
  });
});

/* The negative cases use the un-extended fixture: no session cookie at all. */
base.describe("Signed out", () => {
  base("protected pages bounce to /login and the API answers 401", async ({ page, request }) => {
    await page.goto("/career-direction");
    await expect(page).toHaveURL(/\/login\?next=%2Fcareer-direction$/);

    const api = await request.get("/api/journey/status");
    expect(api.status()).toBe(401);
  });

  base("a tampered session cookie is rejected by the real guard", async ({ browser }) => {
    const context = await browser.newContext();
    await context.addCookies([{
      name: AUTH_COOKIE_NAME,
      value: "base64-bm90LWEtc2Vzc2lvbg",
      url: APP_URL,
    }]);
    const page = await context.newPage();
    await page.goto(`${APP_URL}/career-direction`);
    await expect(page).toHaveURL(/\/login/);
    await context.close();
  });
});

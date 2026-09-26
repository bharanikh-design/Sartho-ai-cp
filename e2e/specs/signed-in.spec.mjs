/*
 * Real end-to-end coverage: a real Chromium, driving the real Next server,
 * running the real server components, route handlers and `proxy.ts` auth guard.
 *
 * The only substitution is the Supabase project itself — NEXT_PUBLIC_SUPABASE_URL
 * points at the local mock in e2e/mock-supabase.mjs. No application source is
 * stubbed, patched or conditionally branched for tests.
 */
import { test as base, expect } from "@playwright/test";
import { AUTH_COOKIE_NAME, APP_URL, sessionCookie, sessionCookieValue } from "../session.mjs";

/*
 * The fixture is declared here rather than in a helper module on purpose:
 * Playwright transforms spec files with its own loader, and a helper importing
 * @playwright/test through Node's ESM loader yields a second instance whose
 * `test.describe` the runner refuses.
 */
const test = base.extend({
  /*
   * The second argument is Playwright's "provide this value to the test" hook.
   * It is conventionally named `use`, which eslint-config-next then reports as
   * a misplaced React `use()` call, so it is named `runTest` here instead.
   */
  context: async ({ context }, runTest) => {
    await context.addCookies([sessionCookie()]);
    await runTest(context);
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

    /* The two saved target lanes arrived, in priority order. */
    await expect(page.getByRole("textbox", { name: "Priority 1" })).toHaveValue("Principal Platform Engineer");
    await expect(page.getByRole("textbox", { name: "Priority 2" })).toHaveValue("Head of Developer Experience");
  });

  test("the grounding line counts real approved evidence, not the seed total", async ({ page }) => {
    await page.goto("/career-direction");
    /*
     * Three evidence rows are seeded and one is `pending`, so the page must say
     * two — the whole getCareerWorkspace → filter → render path ran for real.
     */
    await expect(page.locator(".direction-ai-advisor"))
      .toContainText("Grounded in 2 approved career facts across 1 roles");
  });

  test("adding a suggested role moves it into the priority list", async ({ page }) => {
    await page.goto("/career-direction");

    const card = page.locator(".direction-suggestion-card", { hasText: "Director of Platform Engineering" });
    await card.getByRole("button", { name: "Add to my priorities →" }).click();

    /* The card flips to its added state and the role becomes the third priority. */
    await expect(card.getByRole("button", { name: /Added to priorities/ })).toBeDisabled();
    await expect(page.getByRole("textbox", { name: "Priority 3" }))
      .toHaveValue("Director of Platform Engineering");
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

/*
 * The daily briefing. The seed puts the last visit twenty hours ago and the
 * last search one hour ago, so the roles genuinely arrived while the person
 * was away — which is the only circumstance in which the brief is allowed to
 * call them new.
 */
test.describe("The daily briefing", () => {
  /*
   * Asserted on the server-rendered HTML rather than through the browser.
   *
   * The brief is decided on the server, and the page's own heartbeat reports
   * the person present within a second of hydration — so a retrying DOM
   * assertion races the very signal under test and eventually reads "you are
   * still here". Fetching the document is what the brief actually is.
   */
  test("greets the person and reports the real state of their workspace", async ({ request }) => {
    const response = await request.get(`${APP_URL}/`, {
      headers: { Cookie: `${AUTH_COOKIE_NAME}=${sessionCookieValue()}` },
    });
    expect(response.status()).toBe(200);
    const html = await response.text();

    /* Time-of-day greeting, addressed to the person by their first name. */
    expect(html).toMatch(/Good (morning|afternoon|evening), Evie\./);

    /* Counts read off the seeded workspace, not invented. */
    expect(html).toMatch(/2 (new )?roles/);
    expect(html).toContain("1 career fact to reconcile");
  });

  /*
   * The rule that keeps the brief worth reading.
   *
   * By the time this runs the browser has been reporting in for several specs,
   * so the person is present — and a brief that still announced the same two
   * roles as "new" would be lying. It is only allowed to say "new" about
   * something that arrived while they were genuinely away, which is covered
   * exhaustively in lib/dashboard/daily-brief.test.ts.
   */
  test("does not call anything new while the person is still here", async ({ request }) => {
    const response = await request.get(`${APP_URL}/`, {
      headers: { Cookie: `${AUTH_COOKIE_NAME}=${sessionCookieValue()}` },
    });
    const html = await response.text();

    expect(html).toContain("Here is where things stand.");
    expect(html).not.toContain("new roles matched your brief");
  });

  test("renders in the browser with a steer at the end", async ({ page }) => {
    await page.goto("/");
    const brief = page.locator(".daily-brief");
    await expect(brief).toBeVisible();
    await expect(brief.locator("h2")).toContainText("Evie");
    await expect(brief.locator(".daily-brief-closing")).not.toBeEmpty();
  });

  test("every line is a real way into the workspace", async ({ page }) => {
    await page.goto("/");
    const links = page.locator(".daily-brief-list a");
    await expect(links.first()).toBeVisible();

    for (const link of await links.all()) {
      await expect(link).toHaveAttribute("href", /^\/(search-plan|applications|career-truth|interview-prep)/);
    }
  });
});

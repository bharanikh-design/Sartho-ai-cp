/*
 * Every page, every link, every anchor — walked rather than sampled.
 *
 * The existing suite covers six scenarios chosen because each one had a bug.
 * That is worth having and it is not coverage: Résumé Studio, the ATS score,
 * the pipeline and most of the navigation had no test at all, so a control
 * that stopped working anywhere outside those six would be found by a person
 * using the product.
 *
 * This walks the whole signed-in surface and asserts the things that can be
 * checked without knowing what each page means:
 *
 *   - it renders at all, with no server error and no console error
 *   - every internal link on it resolves rather than 404s
 *   - every same-page #anchor has something to scroll to
 *
 * That last one is not hypothetical: two CTAs pointing at an anchor that did
 * not exist shipped, and were found by hand.
 */
import { test as base, expect, request as playwrightRequest } from "@playwright/test";
import { APP_URL, SUPABASE_URL, sessionCookie } from "../session.mjs";

const test = base.extend({
  context: async ({ context }, runTest) => {
    await context.addCookies([sessionCookie()]);
    await runTest(context);
  },
});

/*
 * Put the fixture back before each test, and once more at the end.
 *
 * This file presses every button in the product, which means it writes: it
 * dismisses suggestions, changes statuses, opens and saves things. The mock
 * keeps those writes in memory for the life of its process, and that process
 * is reused across runs locally — so without this, one sweep leaves every
 * later spec reading a fixture that no longer matches the file, and the
 * failure surfaces somewhere else looking like a bug in the page.
 *
 * That is what happened: the sweep dismissed all three seeded career
 * suggestions and two Career Direction specs began failing for reasons that
 * had nothing to do with them.
 */
async function resetFixture() {
  const api = await playwrightRequest.newContext();
  try {
    await api.post(`${SUPABASE_URL}/__reset`);
  } finally {
    await api.dispose();
  }
}

test.beforeEach(resetFixture);
test.afterAll(resetFixture);

/*
 * The signed-in surface. Excluded: /login and /update-password (signed-out by
 * definition), /welcome (a redirect), and the legal pages, which are static
 * and have no controls worth walking.
 */
/*
 * Arriving, and actually waiting to have arrived.
 *
 * `app-shell.tsx` renders "Opening your Sartho workspace / Securing your
 * session…" until the client has established the session, so `goto` resolving
 * means nothing: the DOM at that moment is a spinner and a footer. The first
 * version of this file read the page at `domcontentloaded` and walked thirteen
 * loading screens — every test passed, having examined no application markup
 * at all, which is precisely the kind of green that is worse than a red.
 */
async function openSignedIn(page, path) {
  await page.goto(`${APP_URL}${path}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Securing your session")).toHaveCount(0);
  await expect(page.locator("main, .page-stack").first()).toBeVisible();
}

const PAGES = [
  "/",
  "/analyse",
  "/applications",
  "/career-direction",
  "/career-truth",
  "/extension",
  "/integrations",
  "/interview-prep",
  "/jobs",
  "/journey",
  "/notifications",
  "/resume-studio",
  "/search-plan",
];

for (const path of PAGES) {
  test(`${path} renders without a server or console error`, async ({ page }) => {
    const consoleErrors = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });

    await openSignedIn(page, path);
    /*
     * /jobs is an old address kept alive as a redirect to Opportunities;
     * landing there is its success. Polled rather than read once: the shell
     * is visible before the page segment streams in, and the redirect is
     * applied only when it does, so a single read raced it and lost one run
     * in three.
     */
    const landing = path === "/jobs" ? "/applications" : path;
    await expect.poll(() => new URL(page.url()).pathname, { message: `${path} bounced to ${page.url()}` }).toBe(landing);

    /* Next renders its error boundary as visible text rather than a bad status. */
    const body = (await page.locator("body").innerText()).slice(0, 4000);
    expect(body, `${path} shows an error boundary`).not.toMatch(/Application error|Unhandled Runtime Error|500: Internal/i);
    /*
     * 400 characters, not 40. The shell alone clears 40, which is how the
     * loading screen passed this assertion thirteen times.
     */
    expect(body.trim().length, `${path} rendered little more than the shell`).toBeGreaterThan(400);

    /*
     * Hydration and prop-type failures surface only here. Network noise from
     * the mock is filtered out — it is not the application's doing.
     */
    const real = consoleErrors.filter((text) => !/Failed to load resource|net::ERR_/i.test(text));
    expect(real, `${path} logged console errors`).toEqual([]);
  });
}

test("every internal link across the app resolves", async ({ page }) => {
  /*
   * Collected from every page first, then checked once per unique target, so a
   * link repeated in the nav costs one request rather than thirteen.
   */
  const targets = new Map();
  for (const path of PAGES) {
    await openSignedIn(page, path);
    const hrefs = await page.locator("a[href]").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("href")));
    for (const href of hrefs) {
      if (!href || !href.startsWith("/") || href.startsWith("//")) continue;
      const target = href.split("#")[0] || "/";
      if (!targets.has(target)) targets.set(target, path);
    }
  }

  /*
   * `page.request`, not the `request` fixture, and the difference is the whole
   * test.
   *
   * The fixture carries no cookies, so every request left this app signed out.
   * proxy.ts answers a signed-out request for a guarded route with a 307 to
   * /login, `maxRedirects` follows it, and /login returns 200 — so the check
   * passed for every URL, including one deliberately invented to break it.
   * Thirteen pages of links were verified against a sign-in page.
   *
   * `page.request` shares the browser context's cookie jar, so these arrive
   * authenticated and reach the route itself. Landing on /login anyway now
   * fails rather than passing, which is what caught it.
   */
  const broken = [];
  for (const [target, foundOn] of targets) {
    const response = await page.request.get(`${APP_URL}${target}`, { maxRedirects: 5 });
    const landed = new URL(response.url()).pathname;
    if (response.status() >= 400) {
      broken.push(`${target} (linked from ${foundOn}) -> ${response.status()}`);
    } else if (landed === "/login" && target !== "/login") {
      broken.push(`${target} (linked from ${foundOn}) -> bounced to /login`);
    }
  }
  expect(broken, "internal links that do not resolve").toEqual([]);
});

test("every same-page anchor has something to scroll to", async ({ page }) => {
  /*
   * The failure this exists for: a button labelled "Prepare for interview"
   * whose href was #interview-coach, on a page with no such element. It looks
   * like a working control and does nothing at all.
   */
  const dangling = [];
  for (const path of PAGES) {
    await openSignedIn(page, path);
    const anchors = await page.locator('a[href^="#"]').evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("href")).filter((href) => href && href.length > 1));
    for (const anchor of new Set(anchors)) {
      const id = anchor.slice(1);
      const exists = await page.locator(`[id="${id.replace(/"/g, '\\"')}"]`).count();
      if (!exists) dangling.push(`${path} -> ${anchor}`);
    }
  }
  expect(dangling, "anchors pointing at nothing").toEqual([]);
});

/*
 * Clicking things.
 *
 * The three tests above read the page. None of them presses anything, and
 * "every control on this page does what it looks like it does" is the question
 * that actually gets asked of a product. A button whose handler throws looks
 * identical to one that works until somebody clicks it.
 *
 * Every enabled button on every page is pressed, one per page load so that
 * one click cannot set up the next. What is asserted is deliberately narrow
 * and unambiguous:
 *
 *   - the click raises no uncaught exception
 *   - it does not put Next's error boundary on screen
 *   - it does not bounce the session to /login
 *
 * Not asserted: that the right thing happened. That needs to know what each
 * control means, which is what the scenario specs are for. This is the floor —
 * nothing here is allowed to be broken — and the floor was missing.
 */
const DESTRUCTIVE = /sign out|log out|delete|remove|disconnect|revoke|archive|withdraw|clear|reset|unlink/i;

/*
 * Visible, because a control nobody can see is not a control.
 *
 * Without `:visible` this collected the pipeline rail's overflow arrows
 * (`hidden` until the rail scrolls) and the tour's step buttons, then reported
 * each one as a failure for not being clickable — which is the test being
 * wrong about the product, and exactly the kind of noise that teaches people
 * to ignore a suite.
 *
 * It stays honest about the case that matters: a button that IS visible but
 * sits under an overlay is still matched here, and Playwright fails its click
 * with "intercepts pointer events" rather than a timeout. That one is a bug.
 */
const BUTTONS = "button:not([disabled]):visible";

/*
 * Next's dev overlay injects its own control into every page. It is not the
 * product and it is not there under `next start`.
 */
const NOT_OURS = /Next\.js Dev Tools|Open issues overlay|Collapse issues badge/i;

/*
 * While a modal is open, the only controls a person can reach are inside it —
 * everything behind the backdrop is deliberately unclickable, and pressing it
 * is a test asserting that modals do not work.
 *
 * Scoping to the dialog is also what makes a *second* modal a failure rather
 * than noise: the home page was mounting the product tour twice, and the upper
 * backdrop swallowed every click meant for the one below it.
 */
async function pressableScope(page) {
  const dialog = page.locator('[aria-modal="true"]').last();
  return (await dialog.count()) ? dialog : page;
}

for (const path of PAGES) {
  test(`${path} — every button survives being pressed`, async ({ page }) => {
    await openSignedIn(page, path);

    /*
     * Named first, off one render, then pressed one per reload. Indices alone
     * would drift the moment a click opened a dialog; the name is checked
     * again before each press so a mismatch fails loudly instead of quietly
     * pressing something else.
     */
    const names = await (await pressableScope(page)).locator(BUTTONS).evaluateAll((nodes) =>
      nodes.map((node) => (node.getAttribute("aria-label") ?? node.innerText ?? "").trim().replace(/\s+/g, " ").slice(0, 80)));

    const failures = [];
    for (let index = 0; index < names.length; index += 1) {
      const name = names[index];
      if (DESTRUCTIVE.test(name) || NOT_OURS.test(name)) continue;

      await openSignedIn(page, path);
      const button = (await pressableScope(page)).locator(BUTTONS).nth(index);
      if (!(await button.count())) continue;

      const thrown = [];
      const onError = (error) => thrown.push(error.message);
      page.on("pageerror", onError);

      try {
        await button.click({ timeout: 5_000, trial: false });
        /* Long enough for a handler to throw or a boundary to render. */
        await page.waitForTimeout(400);

        const body = (await page.locator("body").innerText()).slice(0, 4000);
        if (/Application error|Unhandled Runtime Error|500: Internal/i.test(body)) {
          failures.push(`"${name || `button #${index}`}" put an error boundary on screen`);
        }
        if (new URL(page.url()).pathname === "/login") {
          failures.push(`"${name || `button #${index}`}" bounced to /login`);
        }
        if (thrown.length) failures.push(`"${name || `button #${index}`}" threw: ${thrown.join("; ")}`);
      } catch (caught) {
        /* An un-clickable button is a finding too: it is on screen and enabled. */
        /*
         * Three lines, not one. "Timeout 5000ms exceeded" on its own says
         * nothing; the lines under it are where Playwright names the actual
         * obstruction — and that naming is what found the duplicated modal.
         */
        failures.push(`"${name || `button #${index}`}" could not be clicked: ${caught.message.split("\n").slice(0, 3).join(" ").trim()}`);
      } finally {
        page.off("pageerror", onError);
      }
    }

    expect(failures, `${path} controls that failed when pressed`).toEqual([]);
  });
}

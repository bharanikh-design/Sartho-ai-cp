import { defineConfig, devices } from "@playwright/test";

const APP_PORT = Number(process.env.E2E_APP_PORT ?? 3100);
const MOCK_PORT = Number(process.env.MOCK_SUPABASE_PORT ?? 54321);
/*
 * `localhost` for the app: Next 16 only serves /_next/static and the HMR socket
 * to an origin in `allowedDevOrigins`, and 127.0.0.1 is not one by default —
 * the page would render server-side and then never hydrate.
 *
 * `127.0.0.1` for the mock, which is what fixes the auth cookie's name:
 * supabase-js derives it as `sb-${hostname.split(".")[0]}-auth-token`.
 */
const APP_URL = `http://localhost:${APP_PORT}`;
const SUPABASE_URL = `http://127.0.0.1:${MOCK_PORT}`;

/*
 * Two servers, both local: the mock Supabase and the app itself. Chromium is
 * preinstalled, so nothing here downloads a browser.
 */
export default defineConfig({
  testDir: "./specs",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    baseURL: APP_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: `node ${new URL("./mock-server-main.mjs", import.meta.url).pathname}`,
      url: `${SUPABASE_URL}/auth/v1/user`,
      reuseExistingServer: !process.env.CI,
      stdout: "pipe",
      stderr: "pipe",
      env: { MOCK_SUPABASE_PORT: String(MOCK_PORT) },
    },
    {
      /*
       * E2E_SERVER_MODE=start runs the production server instead, which is what
       * CI should do. It needs a build made with the same NEXT_PUBLIC_SUPABASE_URL,
       * because Next inlines NEXT_PUBLIC_* into the client bundle at build time:
       *
       *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 \
       *   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_e2e_placeholder \
       *   npm run build
       */
      command: process.env.E2E_SERVER_MODE === "start"
        ? `npx next start -p ${APP_PORT}`
        : `npx next dev -p ${APP_PORT}`,
      cwd: new URL("..", import.meta.url).pathname,
      url: `${APP_URL}/privacy`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        NEXT_PUBLIC_SUPABASE_URL: SUPABASE_URL,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_e2e_placeholder",
        SUPABASE_SERVICE_ROLE_KEY: "sb_secret_e2e_placeholder",
      },
    },
  ],
});

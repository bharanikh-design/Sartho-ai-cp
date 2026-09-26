import { defineConfig, devices } from "@playwright/test";

const APP_PORT = Number(process.env.E2E_APP_PORT ?? 3100);
const MOCK_PORT = Number(process.env.MOCK_SUPABASE_PORT ?? 54321);
const APP_URL = `http://127.0.0.1:${APP_PORT}`;
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
      command: `npx next dev -p ${APP_PORT}`,
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
        NODE_ENV: "development",
      },
    },
  ],
});

/*
 * Runs the mock Supabase as its own process so Playwright can manage it as a
 * `webServer` — started before the suite, torn down after it.
 *
 * Writes are kept in memory, so restarting the process resets the fixture.
 */
import { createMockSupabase } from "./mock-supabase.mjs";
import { SEED, TEST_USER } from "./seed.mjs";

const port = Number(process.env.MOCK_SUPABASE_PORT ?? 54321);
const verbose = process.env.MOCK_SUPABASE_VERBOSE === "1";

const mock = createMockSupabase({
  seed: SEED,
  user: TEST_USER,
  port,
  onRequest: verbose ? (entry) => console.log(`[mock-supabase] ${entry.method} ${entry.path}${entry.search}`) : undefined,
});

const bound = await mock.listen();
console.log(`[mock-supabase] listening on http://127.0.0.1:${bound}`);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => { void mock.close().then(() => process.exit(0)); });
}

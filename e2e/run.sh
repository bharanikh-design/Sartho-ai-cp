#!/usr/bin/env bash
#
# Runs the end-to-end suite.
#
# The permanent setup is one line — `npm i -D @playwright/test` — after which
# `npx playwright test --config=e2e/playwright.config.mjs` is all you need.
# This script exists because the sandbox this was built in has Playwright
# installed outside the project, and the runner and `@playwright/test` must
# come from the *same* install or the runner rejects every `test.describe`
# with "two different versions of @playwright/test".
#
# Chromium is preinstalled; nothing here downloads a browser.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-/opt/pw-browsers}"

# Prefer a project-local install; fall back to whichever one `@playwright/test`
# actually resolves to, so the CLI and the module can never disagree.
if [ -x "node_modules/.bin/playwright" ] && [ -d "node_modules/@playwright/test" ]; then
  exec node_modules/.bin/playwright test --config=e2e/playwright.config.mjs "$@"
fi

CLI="$(node -e '
  const path = require("node:path");
  const entry = require.resolve("@playwright/test", { paths: [path.join(process.cwd(), "e2e")] });
  const root = entry.slice(0, entry.indexOf("/node_modules/@playwright/test") + "/node_modules".length);
  process.stdout.write(path.join(root, "playwright", "cli.js"));
')"

exec node "$CLI" test --config=e2e/playwright.config.mjs "$@"

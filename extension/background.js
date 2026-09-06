/*
 * The handoff from a job board to Sartho.
 *
 * This used to be a message fired at a tab a fixed 500ms after it finished
 * loading, and the popup closed itself the moment it was sent. Every way that
 * could fail failed silently and looked identical to success:
 *
 *   - React had not mounted yet, so nothing was listening and the job vanished;
 *   - the person was signed out, so the tab was the login page;
 *   - the tab was on sartho.tech rather than www.sartho.tech, where the old
 *     manifest ran no content script at all;
 *   - the tab had been open since before the extension was installed, so it had
 *     no content script either.
 *
 * So the job is no longer thrown at a tab. It is put in a queue that survives
 * navigation, reloads, signing in, and the browser being closed, and it is
 * removed only when Sartho says it has it. Delivery is Sartho's to ask for —
 * the page announces when it is ready, which is the only moment that is
 * actually knowable from in here.
 */

const PENDING_KEY = "sartho.pendingJob";
const ORIGIN_KEY = "sartho.lastOrigin";

const SARTHO_TABS = [
  "http://localhost:3000/*",
  "https://sartho.tech/*",
  "https://www.sartho.tech/*",
];

const DEFAULT_ORIGIN = "https://www.sartho.tech";

/* Where the pipeline lives, and so where a sent role becomes visible. */
const IMPORT_PATH = "/applications#import";

async function lastKnownOrigin() {
  /*
   * Whichever Sartho the person actually uses. The apex and the www host are
   * both real, and opening the one they are not signed in to is a dead end.
   */
  const stored = await chrome.storage.local.get(ORIGIN_KEY);
  const origin = stored[ORIGIN_KEY];
  return typeof origin === "string" && /^https?:\/\//.test(origin) ? origin : DEFAULT_ORIGIN;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "SEND_TO_SARTHO") {
    (async () => {
      try {
        /*
         * Queued before any tab is touched. If everything after this line
         * fails, the role is still delivered the next time Sartho is opened.
         */
        await chrome.storage.local.set({
          [PENDING_KEY]: {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            capturedAt: new Date().toISOString(),
            job: message.payload,
          },
        });

        const tabs = await chrome.tabs.query({ url: SARTHO_TABS });
        if (tabs.length) {
          /* An already-open Sartho, brought to the front. */
          const tab = tabs.find((item) => item.url?.includes("/applications")) ?? tabs[0];
          await chrome.tabs.update(tab.id, { active: true });
          await chrome.windows.update(tab.windowId, { focused: true });

          if (!tab.url?.includes("/applications")) {
            const origin = new URL(tab.url).origin;
            await chrome.tabs.update(tab.id, { url: origin + IMPORT_PATH });
          } else {
            /*
             * Already on the right page: nudge it, in case it has been sitting
             * open since before this job was queued. No reply is expected — the
             * content script may not exist in a tab older than the extension,
             * and the reload below is the answer to that.
             */
            try {
              await chrome.tabs.sendMessage(tab.id, { type: "SARTHO_PENDING" });
            } catch {
              await chrome.tabs.reload(tab.id);
            }
          }
          sendResponse({ ok: true, opened: false });
          return;
        }

        const origin = await lastKnownOrigin();
        await chrome.tabs.create({ url: origin + IMPORT_PATH });
        sendResponse({ ok: true, opened: true });
      } catch (caught) {
        sendResponse({ ok: false, error: caught?.message || "Sartho could not open your pipeline." });
      }
    })();
    return true; // the reply is async
  }

  return undefined;
});

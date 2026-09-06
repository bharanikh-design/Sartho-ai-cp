/*
 * The half of the handoff that lives inside Sartho.
 *
 * A content script shares the page's DOM but not its JavaScript world, so
 * everything here talks to the app through window.postMessage and a data
 * attribute — the two things that actually cross that boundary.
 *
 * That boundary is also why the old presence check never worked: this file set
 * window.__SARTHO_EXTENSION_ACTIVE__, the app read window.__SARTHO_EXTENSION_ACTIVE__,
 * and they were two different windows. The app therefore believed the extension
 * was missing on every single page load, installed or not. Presence is now a
 * data attribute on <html>, which is one shared DOM and cannot drift.
 *
 * Delivery is a conversation, not a shout:
 *
 *   app  → SARTHO_READY      "I am mounted and listening"
 *   here → SARTHO_IMPORT_JOB "then take this one"
 *   app  → SARTHO_IMPORTED   "saved; you can forget it"
 *
 * Only that last message clears the queue. Anything that goes wrong in between
 * — a reload, a signed-out session, a failed save — leaves the role queued for
 * the next time Sartho is open, instead of losing it in silence.
 */

const PENDING_KEY = "sartho.pendingJob";
const ORIGIN_KEY = "sartho.lastOrigin";

/* Visible to the page, unlike a variable in this script's own world. */
document.documentElement.dataset.sarthoExtension = chrome.runtime.getManifest().version;

/*
 * Which Sartho this person actually uses, so a later capture with no tab open
 * does not open the host they are not signed in to.
 */
chrome.storage.local.set({ [ORIGIN_KEY]: window.location.origin });

async function pendingJob() {
  const stored = await chrome.storage.local.get(PENDING_KEY);
  const pending = stored[PENDING_KEY];
  return pending && pending.job ? pending : null;
}

async function offerPendingJob() {
  const pending = await pendingJob();
  if (!pending) return;
  window.postMessage(
    {
      source: "sartho-extension",
      type: "SARTHO_IMPORT_JOB",
      id: pending.id,
      capturedAt: pending.capturedAt,
      payload: pending.job,
    },
    window.location.origin,
  );
}

window.addEventListener("message", (event) => {
  /*
   * Only this page may speak for this page. Without the check, an iframe
   * embedded in the tab could claim a job had been imported and clear the queue.
   */
  if (event.source !== window) return;
  const data = event.data;
  if (!data || data.source !== "sartho-app") return;

  if (data.type === "SARTHO_READY") {
    void offerPendingJob();
    return;
  }

  /*
   * Cleared only for the exact job that was acknowledged. Clearing blindly
   * would drop a second role captured while the first was still saving.
   */
  if (data.type === "SARTHO_IMPORTED" && data.id) {
    void (async () => {
      const pending = await pendingJob();
      if (pending && pending.id === data.id) await chrome.storage.local.remove(PENDING_KEY);
    })();
  }
});

/* A nudge from the popup, for a tab that was already sitting on the page. */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "SARTHO_PENDING") {
    void offerPendingJob();
    sendResponse({ ok: true });
  }
  return undefined;
});

/*
 * Offered once on load as well as on request. Whichever of the two sides is
 * slower to appear triggers the other, so the handoff does not depend on the
 * app and this script mounting in a particular order.
 */
void offerPendingJob();

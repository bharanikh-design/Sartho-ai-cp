// This script runs inside the Sartho Web App (localhost or production)
// It listens for messages from the Chrome Extension background script
// and relays them to the React application via window.postMessage.

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "REQUEST_PROFILE") {
    // We send a message to the React window asking for the profile.
    // Targeted at this origin, not "*", so the request is not broadcast to
    // every frame embedded in the page.
    window.postMessage({ type: "SARTHO_GET_PROFILE" }, window.location.origin);

    // We need to wait for the React app to respond via window message
    const listener = (event) => {
      // Only this page may answer for this page. Without the check, an iframe
      // embedded in the tab can post SARTHO_SEND_PROFILE and dictate what gets
      // typed into an application form.
      if (event.source !== window) return;
      if (event.data?.type === "SARTHO_SEND_PROFILE") {
        window.removeEventListener("message", listener);
        clearTimeout(timeout);
        sendResponse({ profileData: event.data.payload });
      }
    };
    window.addEventListener("message", listener);

    /*
     * No answer means no autofill.
     *
     * This used to fall back, after 1.5 seconds, to a profile hardcoded during
     * the prototype: a real name, a real email address and a real phone number.
     * Nothing in the web app has ever listened for SARTHO_GET_PROFILE, so the
     * timeout won every single time.
     *
     * A refusal is the only safe answer here. Filling a job application with a
     * plausible identity that is not yours is worse than filling nothing, and
     * it is the rule the résumé rewriter already follows: where the truth is
     * not available, leave it visibly absent rather than quietly invented.
     *
     * clearTimeout above matters for the same reason the refusal does — without
     * it, a successful reply is still followed by this second sendResponse.
     */
    const timeout = setTimeout(() => {
      window.removeEventListener("message", listener);
      sendResponse({ profileData: null, error: "Sartho profile not ready. Please open the Sartho dashboard to sync your profile." });
    }, 1500);
    return true; // Keep channel open for async response
  }

  if (message.type === "IMPORT_JOB") {
    console.log("Sartho Extension: Received job data, forwarding to React app...");
    window.postMessage({
      source: "sartho-extension",
      type: "IMPORT_JOB",
      payload: message.payload
    }, window.location.origin);
    sendResponse({ success: true });
  }
});
window.__SARTHO_EXTENSION_ACTIVE__ = true;

// This script runs inside the Sartho Web App (localhost or production)
// It listens for messages from the Chrome Extension background script
// and relays them to the React application via window.postMessage.

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "REQUEST_PROFILE") {
    // We send a message to the React window asking for the profile
    window.postMessage({ type: "SARTHO_GET_PROFILE" }, window.location.origin);
    
    // We need to wait for the React app to respond via window message
    const listener = (event) => {
      if (event.data?.type === "SARTHO_SEND_PROFILE") {
        window.removeEventListener("message", listener);
        sendResponse({ profileData: event.data.payload });
      }
    };
    window.addEventListener("message", listener);
    
    // Timeout if React doesn't respond
    setTimeout(() => {
      window.removeEventListener("message", listener);
      // Fails gracefully instead of injecting hardcoded PII
      sendResponse({ error: "Sartho profile not ready. Please open Sartho dashboard to sync your profile." });
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

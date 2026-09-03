// This script runs inside the Sartho Web App (localhost or production)
// It listens for messages from the Chrome Extension background script
// and relays them to the React application via window.postMessage.

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "IMPORT_JOB") {
    console.log("Sartho Extension: Received job data, forwarding to React app...");
    window.postMessage({
      source: "sartho-extension",
      type: "IMPORT_JOB",
      payload: message.payload
    }, "*");
    sendResponse({ success: true });
  }
});

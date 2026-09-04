// This script runs inside the Sartho Web App (localhost or production)
// It listens for messages from the Chrome Extension background script
// and relays them to the React application via window.postMessage.

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "REQUEST_PROFILE") {
    // We send a message to the React window asking for the profile
    window.postMessage({ type: "SARTHO_GET_PROFILE" }, "*");
    
    // We need to wait for the React app to respond via window message
    const listener = (event) => {
      if (event.data?.type === "SARTHO_SEND_PROFILE") {
        window.removeEventListener("message", listener);
        sendResponse({ profileData: event.data.payload });
      }
    };
    window.addEventListener("message", listener);
    
    // Fallback if React doesn't respond
    setTimeout(() => {
      window.removeEventListener("message", listener);
      // Hardcoded fallback for the prototype just in case React isn't listening yet
      sendResponse({ 
        profileData: {
          firstName: "Bharani",
          lastName: "K",
          email: "bharani@sartho.tech",
          phone: "+1 234 567 8900",
          linkedinUrl: "https://linkedin.com/in/bharani",
          portfolioUrl: "https://sartho.tech"
        }
      });
    }, 1500);
    return true; // Keep channel open for async response
  }

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
window.__SARTHO_EXTENSION_ACTIVE__ = true;

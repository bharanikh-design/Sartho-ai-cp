chrome.runtime.onInstalled.addListener(() => {
  console.log("Sartho AI Extension Installed.");
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "TRIGGER_AUTOFILL") {
    (async () => {
      // Find Sartho tab
      const tabs = await chrome.tabs.query({ url: ["http://localhost:3000/*", "https://www.sartho.tech/*"] });
      if (tabs.length === 0) {
        sendResponse({ success: false, error: "Sartho not open" });
        return;
      }
      
      const sarthoTab = tabs[0];
      
      // Request profile data from Sartho
      chrome.tabs.sendMessage(sarthoTab.id, { type: "REQUEST_PROFILE" }, async (response) => {
        if (response && response.profileData) {
          // Inject autofill.js into the ATS tab if not already there
          await chrome.scripting.executeScript({
            target: { tabId: message.tabId },
            files: ["autofill.js"]
          }).catch(e => console.log("Script already injected or error:", e));

          // Send data to ATS tab
          chrome.tabs.sendMessage(message.tabId, {
            type: "EXECUTE_AUTOFILL",
            payload: response.profileData
          });
          sendResponse({ success: true });
        } else {
          sendResponse({ success: false, error: "Could not get profile data from Sartho" });
        }
      });
    })();
    return true; // async
  }

  if (message.type === "SEND_TO_SARTHO") {
    (async () => {
      // Find an existing Sartho tab or create one
      const tabs = await chrome.tabs.query({ url: ["http://localhost:3000/*", "https://www.sartho.tech/*"] });
      
      let sarthoTab;
      if (tabs.length > 0) {
        sarthoTab = tabs[0];
        await chrome.tabs.update(sarthoTab.id, { active: true });
        await chrome.windows.update(sarthoTab.windowId, { focused: true });
        // If not on the /jobs page, navigate there
        if (!sarthoTab.url.includes('/jobs')) {
          await chrome.tabs.update(sarthoTab.id, { url: 'http://localhost:3000/jobs' });
          // Give it a moment to load
          await new Promise(r => setTimeout(r, 1000));
        }
      } else {
        sarthoTab = await chrome.tabs.create({ url: "http://localhost:3000/jobs" });
        // Wait for tab to finish loading
        await new Promise(resolve => {
          chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
            if (tabId === sarthoTab.id && info.status === 'complete') {
              chrome.tabs.onUpdated.removeListener(listener);
              resolve();
            }
          });
        });
      }

      // Send the data to the content script running in the Sartho tab
      chrome.tabs.sendMessage(sarthoTab.id, {
        type: "IMPORT_JOB",
        payload: message.payload
      });
      
      sendResponse({ success: true });
    })();
    return true; // Keep channel open for async response
  }
});

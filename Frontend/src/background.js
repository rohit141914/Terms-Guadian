import { MSG } from "./constants";

chrome.runtime.onInstalled.addListener(() => {
  console.log("Terms Guardian installed");
});

// Listen for messages from popup or content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === MSG.GET_DISMISSED_DOMAINS) {
    chrome.storage.local.get(null, (items) => {
      const domains = Object.keys(items).filter((key) => items[key] === true);
      sendResponse({ domains });
    });
    return true; // keep channel open for async response
  }

  if (message.type === MSG.RESET_DOMAIN) {
    chrome.storage.local.remove(message.domain, () => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.type === MSG.RESET_ALL_DOMAINS) {
    chrome.storage.local.clear(() => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.type === MSG.SUMMARIZE) {
    fetch(`${import.meta.env.VITE_API_URL}/summarize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: message.content }),
    })
      .then((res) => res.json())
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

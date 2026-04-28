const API = "https://sneakerask-order-polling.onrender.com";
const ALARM_NAME = "sneakerask_poll_alarm";

let isProcessing = false;

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.storage.local.set({ running: false });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "START") {
    startPolling().then(() => sendResponse({ ok: true }));
    return true;
  }

  if (msg.type === "STOP") {
    stopPolling().then(() => sendResponse({ ok: true }));
    return true;
  }

  if (msg.type === "STATUS") {
    chrome.storage.local.get(["running"], (data) => {
      sendResponse({ running: !!data.running });
    });
    return true;
  }
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM_NAME) return;

  const data = await chrome.storage.local.get(["running"]);
  if (!data.running) return;

  await processAllEligibleJobs();
});

async function startPolling() {
  console.log("🚀 Polling started");

  await chrome.storage.local.set({ running: true });

  chrome.alarms.create(ALARM_NAME, {
    periodInMinutes: 1
  });

  await processAllEligibleJobs();
}

async function stopPolling() {
  console.log("🛑 Polling stopped");

  await chrome.storage.local.set({ running: false });
  await chrome.alarms.clear(ALARM_NAME);
}

async function processAllEligibleJobs() {
  if (isProcessing) {
    console.log("⚠️ Already processing, skipping");
    return;
  }

  isProcessing = true;

  try {
    while (true) {
      const data = await chrome.storage.local.get(["running"]);

      if (!data.running) {
        console.log("🛑 Stopped during batch");
        break;
      }

      const didProcess = await processOneJob();

      if (!didProcess) {
        console.log("✅ No more eligible jobs right now");
        break;
      }

      await sleep(750);
    }
  } finally {
    isProcessing = false;
  }
}

async function processOneJob() {
  try {
    console.log("🔄 Checking backend...");

    const res = await fetch(`${API}/next`);
    const job = await res.json();

    if (!job) {
      console.log("⏳ No eligible Airtable records right now");
      return false;
    }

    console.log("📦 Job:", job);

    const tabs = await chrome.tabs.query({
      url: "https://sell.sneakerask.com/products*"
    });

    if (!tabs.length) {
      console.log("❌ SneakerAsk sourcing tab not open");
      return false;
    }

    const tab = tabs[0];

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"]
    });

    await sleep(500);

    const found = await chrome.tabs.sendMessage(tab.id, {
      type: "CHECK_ORDER",
      job
    });

    console.log("📤 Result:", found);

    await fetch(`${API}/result`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        id: job.id,
        found
      })
    });

    return true;
  } catch (err) {
    console.error("❌ Poll error:", err);
    return false;
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

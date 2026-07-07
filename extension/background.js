const API = "https://sneakerask-order-polling.onrender.com";
const ALARM_NAME = "sneakerask_poll_alarm";
const SOURCING_URL = "https://sell.sneakerask.com/products?status=sourcing";

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
        console.log("✅ Batch stopped / no more eligible jobs right now");
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

    const tab = await getOrOpenSourcingTab();

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"]
    });

    await sleep(500);

    const result = await chrome.tabs.sendMessage(tab.id, {
      type: "CHECK_ORDER",
      job
    });

    console.log("📤 Result:", result);

    if (!result || result.status === "ERROR" || result.status === "CONNECTION_ERROR") {
      console.log("⚠️ Browser/SneakerAsk error. NOT sending result to backend:", result);

      await recoverSourcingTab(tab.id);

      return false;
    }

    if (result.status !== "FOUND" && result.status !== "NOT_FOUND") {
      console.log("⚠️ Unknown result. NOT sending result to backend:", result);
      return false;
    }

    await fetch(`${API}/result`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        id: job.id,
        result
      })
    });

    return true;

  } catch (err) {
    console.error("❌ Poll error:", err);
    return false;
  }
}

async function getOrOpenSourcingTab() {
  let tabs = await chrome.tabs.query({
    url: "https://sell.sneakerask.com/products*"
  });

  let tab;

  if (!tabs.length) {
    tab = await chrome.tabs.create({
      url: SOURCING_URL,
      active: true
    });

    await sleep(5000);
    return tab;
  }

  tab = tabs[0];

  if (tab.url !== SOURCING_URL) {
    await chrome.tabs.update(tab.id, {
      url: SOURCING_URL,
      active: true
    });

    await sleep(5000);
  }

  return tab;
}

async function recoverSourcingTab(tabId) {
  console.log("🔄 Recovering SneakerAsk tab...");

  await chrome.tabs.update(tabId, {
    url: SOURCING_URL,
    active: true
  });

  await sleep(8000);

  console.log("⏸️ Recovery done. Waiting for next alarm tick.");
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

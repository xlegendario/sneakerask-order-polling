const API = "https://sneakerask-order-polling.onrender.com";

let running = false;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "START") {
    if (!running) {
      running = true;
      loop();
    }
  }

  if (msg.type === "STOP") {
    running = false;
    console.log("🛑 Stopped");
  }

  if (msg.type === "STATUS") {
    sendResponse({ running });
  }
});

async function loop() {
  console.log("🚀 STARTED");

  while (running) {
    try {
      console.log("🔄 Polling backend...");

      const res = await fetch(`${API}/next`);
      const job = await res.json();

      if (!job) {
        console.log("⏳ No jobs");
        await sleep(5000);
        continue;
      }

      console.log("📦 Job:", job);

      const tabs = await chrome.tabs.query({
        url: "https://sell.sneakerask.com/products*"
      });

      if (!tabs.length) {
        console.log("❌ SneakerAsk tab not open");
        await sleep(3000);
        continue;
      }

      const tab = tabs[0];

      // 🔥 FORCE inject content script
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content.js"]
      });

      await sleep(300);

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

    } catch (err) {
      console.error("❌ ERROR:", err);
    }

    await sleep(2000);
  }

  console.log("🛑 LOOP STOPPED");
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

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
    console.log("🛑 Polling stopped");
  }

  if (msg.type === "STATUS") {
    sendResponse({ running });
  }
});

async function loop() {
  console.log("🚀 Polling started");

  while (running) {
    try {
      const res = await fetch(`${API}/next`);
      const job = await res.json();

      if (!job) {
        console.log("⏳ No jobs");
        await sleep(5000);
        continue;
      }

      const tabs = await chrome.tabs.query({
        url: "https://sell.sneakerask.com/products*"
      });

      if (!tabs.length) {
        console.log("❌ SneakerAsk tab not open");
        await sleep(3000);
        continue;
      }

      const tab = tabs[0];

      const found = await chrome.tabs.sendMessage(tab.id, {
        type: "CHECK_ORDER",
        job
      });

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
      console.error("Loop error:", err);
    }

    await sleep(2000);
  }

  console.log("🛑 Loop exited");
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

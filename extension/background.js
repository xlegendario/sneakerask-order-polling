const API = "https://sneakerask-order-polling.onrender.com";

async function loop() {
  while (true) {
    try {
      const res = await fetch(`${API}/next`);
      const job = await res.json();

      if (!job) {
        console.log("⏳ No jobs, waiting...");
        await sleep(5000);
        continue;
      }

      console.log("🔍 Checking:", job);

      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true
      });

      const found = await chrome.tabs.sendMessage(tab.id, {
        type: "CHECK_ORDER",
        job
      });

      console.log("Result:", found);

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
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

loop();

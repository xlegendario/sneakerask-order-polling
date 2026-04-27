// Prevent double load
if (window.__BOT_LOADED__) {
  console.log("⚠️ Already injected");
} else {
  window.__BOT_LOADED__ = true;
  console.log("🔥 CONTENT SCRIPT ACTIVE");
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  console.log("📩 Message received:", msg);

  if (msg.type === "CHECK_ORDER") {
    processJob(msg.job).then(sendResponse);
    return true;
  }
});

async function processJob(job) {
  const { orderNumber, sku, size } = job;

  console.log("➡️ Processing:", orderNumber, sku, size);

  const input = document.querySelector("input[placeholder*='Search']");

  if (!input) {
    console.log("❌ Search input not found");
    return false;
  }

  input.value = orderNumber;
  input.dispatchEvent(new Event("input", { bubbles: true }));

  await sleep(2000);

  if (document.body.innerText.includes("No Products Found")) {
    console.log("❌ No products");
    return false;
  }

  const rows = document.querySelectorAll("tr");

  for (let row of rows) {
    const text = normalize(row.innerText);

    if (
      text.includes(normalize(sku)) &&
      text.includes(normalize(size))
    ) {
      console.log("✅ MATCH FOUND");
      return true;
    }
  }

  console.log("❌ No match");
  return false;
}

function normalize(str) {
  return str.replace(/\s+/g, "").toLowerCase();
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

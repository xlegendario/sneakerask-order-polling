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

  console.log("➡️ Processing:", orderNumber);

  const input = document.querySelector("input[placeholder*='Search']");

  if (!input) {
    console.log("❌ Search input not found");
    return false;
  }

  // 🔥 STEP 1: CLEAR previous search
  input.value = "";
  input.dispatchEvent(new Event("input", { bubbles: true }));

  // Extra nudge for React
  input.dispatchEvent(new KeyboardEvent("keydown", { key: "Backspace" }));

  await sleep(1000);

  // 🔥 STEP 2: TYPE new order number
  input.value = orderNumber;
  input.dispatchEvent(new Event("input", { bubbles: true }));

  console.log("⌨️ Typed:", orderNumber);

  // 🔥 STEP 3: WAIT for results
  await waitForResults(orderNumber);

  const pageText = document.body.innerText;

  // 🔥 STEP 4: Check "no products"
  if (pageText.includes("No Products Found")) {
    console.log("❌ No products");
    return false;
  }

  // 🔥 STEP 5: Check rows
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

async function waitForResults(orderNumber) {
  for (let i = 0; i < 15; i++) {
    const text = document.body.innerText;

    if (
      text.includes("No Products Found") ||
      text.includes(orderNumber)
    ) {
      return;
    }

    await sleep(500);
  }
}

function normalize(str) {
  return str.replace(/\s+/g, "").toLowerCase();
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

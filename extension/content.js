chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "CHECK_ORDER") {
    processJob(msg.job).then(sendResponse);
    return true;
  }
});

async function processJob(job) {
  const { orderNumber, sku, size } = job;

  console.log("➡️ Processing:", orderNumber, sku, size);

  // 1. Find search input
  const input = findSearchInput();
  if (!input) {
    console.error("Search input not found");
    return false;
  }

  // 2. Enter order number
  input.value = orderNumber;
  input.dispatchEvent(new Event("input", { bubbles: true }));

  // 3. Wait for results to refresh
  await waitForResults(orderNumber);

  const pageText = document.body.innerText;

  // 4. No products case
  if (pageText.includes("No Products Found")) {
    console.log("❌ No products found");
    return false;
  }

  // 5. Scan table rows
  const rows = document.querySelectorAll("tr");

  for (let row of rows) {
    const text = normalize(row.innerText);

    if (
      text.includes(normalizeSku(sku)) &&
      text.includes(normalizeSize(size))
    ) {
      console.log("✅ Match found");
      return true;
    }
  }

  console.log("❌ No matching SKU + Size");
  return false;
}

// ---------------- HELPERS ----------------

function findSearchInput() {
  return document.querySelector("input") || null;
}

async function waitForResults(orderNumber) {
  for (let i = 0; i < 12; i++) {
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

function normalizeSku(sku) {
  return normalize(sku).replace("-", "");
}

function normalizeSize(size) {
  return normalize(size).replace("eu", "");
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

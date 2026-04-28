if (!window.__SNEAKERASK_BOT_LOADED__) {
  window.__SNEAKERASK_BOT_LOADED__ = true;

  console.log("🔥 SneakerAsk content script active");

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "CHECK_ORDER") {
      processJob(msg.job).then(sendResponse);
      return true;
    }
  });
}

async function processJob(job) {
  const { orderNumber, sku, size } = job;

  console.log("➡️ Processing:", orderNumber, sku, size);

  if (window.location.href !== "https://sell.sneakerask.com/products?status=sourcing") {
    console.log("❌ Wrong page:", window.location.href);
    return false;
  }

  const input = document.querySelector("input[placeholder*='Search']");

  if (!input) {
    console.log("❌ Search input not found");
    return false;
  }

  setReactInputValue(input, "");
  input.dispatchEvent(new Event("input", { bubbles: true }));
  await sleep(1000);

  setReactInputValue(input, String(orderNumber));
  input.dispatchEvent(new Event("input", { bubbles: true }));

  console.log("⌨️ Typed:", orderNumber);

  await sleep(1250);

  if (document.body.innerText.includes("No Products Found")) {
    console.log("❌ No products found");
    return false;
  }

  const pageText = normalize(document.body.innerText);

  if (
    pageText.includes(normalize(sku)) &&
    pageText.includes(normalizeSize(size))
  ) {
    console.log("✅ SKU + size found");
    return true;
  }

  console.log("❌ SKU + size not found");
  return false;
}

function setReactInputValue(input, value) {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value"
  ).set;

  setter.call(input, value);
}

function normalize(str) {
  return String(str || "")
    .replace(/\s+/g, "")
    .replace(/-/g, "")
    .toLowerCase();
}

function normalizeSize(size) {
  return normalize(size).replace("eu", "");
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

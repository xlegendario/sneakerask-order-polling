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
  try {
    const { orderNumber, sku, size } = job;

    console.log("➡️ Processing:", orderNumber, sku, size);

    const pageTextBefore = document.body.innerText || "";

    if (hasSneakerAskConnectionError(pageTextBefore)) {
      console.log("⚠️ SneakerAsk connection error detected before typing");
      return { status: "CONNECTION_ERROR" };
    }

    if (window.location.href !== "https://sell.sneakerask.com/products?status=sourcing") {
      console.log("⚠️ Wrong URL:", window.location.href);
      return { status: "ERROR", reason: "Wrong URL" };
    }

    const input = document.querySelector("input[placeholder*='Search']");

    if (!input) {
      console.log("⚠️ Search input not found");
      return { status: "ERROR", reason: "Search input not found" };
    }

    setReactInputValue(input, "");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await sleep(1000);

    setReactInputValue(input, String(orderNumber));
    input.dispatchEvent(new Event("input", { bubbles: true }));

    console.log("⌨️ Typed:", orderNumber);

    await sleep(1500);

    const pageTextAfter = document.body.innerText || "";

    if (hasSneakerAskConnectionError(pageTextAfter)) {
      console.log("⚠️ SneakerAsk connection error detected after typing");
      return { status: "CONNECTION_ERROR" };
    }

    const currentValue = String(input.value || "").trim();

    if (currentValue !== String(orderNumber)) {
      console.log("⚠️ Order number not typed correctly:", currentValue);
      return { status: "ERROR", reason: "Order number not typed correctly" };
    }

    if (pageTextAfter.includes("No Products Found")) {
      console.log("❌ Confirmed no products found");
      return { status: "NOT_FOUND" };
    }

    const normalizedPageText = normalize(pageTextAfter);

    if (
      normalizedPageText.includes(normalize(sku)) &&
      normalizedPageText.includes(normalizeSize(size))
    ) {
      console.log("✅ SKU + size found");
      return { status: "FOUND" };
    }

    console.log("❌ Products found, but SKU + size not found");
    return { status: "NOT_FOUND" };

  } catch (err) {
    console.error("⚠️ Content script error:", err);
    return { status: "ERROR", reason: err.message || "Unknown error" };
  }
}

function hasSneakerAskConnectionError(text) {
  return (
    text.includes("Connection Error") ||
    text.includes("Something went wrong") ||
    text.includes("Please check your connection and try again")
  );
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

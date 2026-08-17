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

    if (
      window.location.href !==
      "https://sell.sneakerask.com/products?status=sourcing"
    ) {
      console.log("⚠️ Wrong URL:", window.location.href);
      return {
        status: "ERROR",
        reason: "Wrong URL"
      };
    }

    const input = document.querySelector(
      "input[placeholder*='Search']"
    );

    if (!input) {
      console.log("⚠️ Search input not found");
      return {
        status: "ERROR",
        reason: "Search input not found"
      };
    }

    // Clear previous order
    setReactInputValue(input, "");
    input.dispatchEvent(new Event("input", { bubbles: true }));

    await sleep(750);

    // Enter new order
    setReactInputValue(input, String(orderNumber));
    input.dispatchEvent(new Event("input", { bubbles: true }));

    console.log("⌨️ Typed:", orderNumber);

    // Give SneakerAsk a moment to START loading
    await sleep(500);

    // Wait until "Loading products..." disappears
    const finishedLoading = await waitUntilProductsFinishedLoading();

    if (!finishedLoading) {
      console.log("⚠️ Products were still loading after timeout");

      return {
        status: "ERROR",
        reason: "Loading products timeout"
      };
    }

    // Small stability delay after loading disappears
    await sleep(300);

    const pageTextAfter = document.body.innerText || "";

    // Check connection error again
    if (hasSneakerAskConnectionError(pageTextAfter)) {
      console.log(
        "⚠️ SneakerAsk connection error detected after loading"
      );

      return {
        status: "CONNECTION_ERROR"
      };
    }

    // Verify correct order number is actually in input
    const currentValue = String(input.value || "").trim();

    if (currentValue !== String(orderNumber)) {
      console.log(
        "⚠️ Order number not typed correctly:",
        currentValue
      );

      return {
        status: "ERROR",
        reason: "Order number not typed correctly"
      };
    }

    // Explicit SneakerAsk no-result state
    if (pageTextAfter.includes("No Products Found")) {
      console.log("❌ Confirmed no products found");

      return {
        status: "NOT_FOUND"
      };
    }

    // Check SKU + Size
    const normalizedPageText = normalize(pageTextAfter);

    if (
      normalizedPageText.includes(normalize(sku)) &&
      normalizedPageText.includes(normalizeSize(size))
    ) {
      console.log("✅ SKU + size found");

      return {
        status: "FOUND"
      };
    }

    console.log(
      "❌ Products loaded, but matching SKU + size not found"
    );

    return {
      status: "NOT_FOUND"
    };

  } catch (err) {
    console.error("⚠️ Content script error:", err);

    return {
      status: "ERROR",
      reason: err.message || "Unknown error"
    };
  }
}

async function waitUntilProductsFinishedLoading() {
  const MAX_WAIT_MS = 30000;
  const CHECK_INTERVAL_MS = 500;

  const startTime = Date.now();

  while (Date.now() - startTime < MAX_WAIT_MS) {
    const pageText = document.body.innerText || "";

    // Connection error while waiting
    if (hasSneakerAskConnectionError(pageText)) {
      console.log("⚠️ Connection error while waiting for products");
      return false;
    }

    if (!pageText.includes("Loading products...")) {
      console.log("✅ Products finished loading");
      return true;
    }

    console.log("⏳ Still loading products...");

    await sleep(CHECK_INTERVAL_MS);
  }

  console.log("⚠️ Loading products timeout after 30 seconds");

  return false;
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

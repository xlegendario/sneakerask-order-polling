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
      console.log("⚠️ SneakerAsk connection error before search");
      return {
        status: "CONNECTION_ERROR",
        reason: "Connection error before search"
      };
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

    const input = document.querySelector("input[placeholder*='Search']");

    if (!input) {
      console.log("⚠️ Search input not found");

      return {
        status: "ERROR",
        reason: "Search input not found"
      };
    }

    // Clear previous search
    setReactInputValue(input, "");
    input.dispatchEvent(new Event("input", { bubbles: true }));

    await sleep(750);

    // Enter current order number
    setReactInputValue(input, String(orderNumber));
    input.dispatchEvent(new Event("input", { bubbles: true }));

    console.log("⌨️ Typed:", orderNumber);

    await sleep(300);

    const currentValue = String(input.value || "").trim();

    if (currentValue !== String(orderNumber)) {
      console.log("⚠️ Order number not typed correctly", {
        expected: String(orderNumber),
        actual: currentValue
      });

      return {
        status: "ERROR",
        reason: "Order number not typed correctly"
      };
    }

    // Wait until the page definitely represents THIS order
    const resultState = await waitForCurrentOrderResults(orderNumber);

    if (resultState === "CONNECTION_ERROR") {
      return {
        status: "CONNECTION_ERROR",
        reason: "Connection error while waiting for results"
      };
    }

    if (resultState === "TIMEOUT") {
      return {
        status: "ERROR",
        reason: "Could not confirm current order results"
      };
    }

    if (resultState === "NO_PRODUCTS") {
      console.log("❌ Confirmed No Products Found:", orderNumber);

      return {
        status: "NOT_FOUND"
      };
    }

    // Current order is confirmed on the page
    const pageTextAfter = document.body.innerText || "";
    const normalizedPageText = normalize(pageTextAfter);

    const normalizedOrder = normalize(orderNumber);
    const normalizedSku = normalize(sku);
    const normalizedSize = normalizeSize(size);

    const orderPresent = normalizedPageText.includes(normalizedOrder);
    const skuPresent = normalizedPageText.includes(normalizedSku);
    const sizePresent = normalizedPageText.includes(normalizedSize);

    console.log("🧪 MATCH DEBUG", {
      orderNumber,
      sku,
      size,
      normalizedOrder,
      normalizedSku,
      normalizedSize,
      orderPresent,
      skuPresent,
      sizePresent
    });

    console.log("📄 PAGE TEXT:", pageTextAfter);

    // Extra safety:
    // even after waitForCurrentOrderResults(), if current order somehow
    // isn't in the page anymore, DO NOT mark Store Fulfilled
    if (!orderPresent) {
      console.log("⚠️ Current order vanished from page before matching");

      return {
        status: "ERROR",
        reason: "Current order not present during final match"
      };
    }

    // Check within the actual matching order row/container first
    const matchingRows = findRowsForOrder(orderNumber);

    console.log(
      `🔎 Matching row count for ${orderNumber}:`,
      matchingRows.length
    );

    for (const row of matchingRows) {
      const rowTextRaw = row.innerText || "";
      const rowText = normalize(rowTextRaw);

      const rowSkuPresent = rowText.includes(normalizedSku);
      const rowSizePresent = rowText.includes(normalizedSize);

      console.log("🧪 ROW DEBUG", {
        orderNumber,
        rowTextRaw,
        rowSkuPresent,
        rowSizePresent
      });

      if (rowSkuPresent && rowSizePresent) {
        console.log("✅ Correct order + SKU + size found");

        return {
          status: "FOUND"
        };
      }
    }

    // Fallback:
    // if row detection misses because SneakerAsk DOM changed,
    // but the entire visible page contains current order + SKU + size,
    // still count it as FOUND.
    if (orderPresent && skuPresent && sizePresent) {
      console.log("✅ Found via full-page fallback");

      return {
        status: "FOUND"
      };
    }

    console.log(
      "❌ Current order confirmed, but matching SKU + size not found"
    );

    return {
      status: "NOT_FOUND"
    };

  } catch (err) {
    console.error("⚠️ Content script error:", err);

    return {
      status: "ERROR",
      reason: err.message || "Unknown content script error"
    };
  }
}

async function waitForCurrentOrderResults(orderNumber) {
  const MAX_WAIT_MS = 30000;
  const CHECK_INTERVAL_MS = 300;

  const startedAt = Date.now();
  const normalizedOrder = normalize(orderNumber);

  let sawLoading = false;

  while (Date.now() - startedAt < MAX_WAIT_MS) {
    const pageText = document.body.innerText || "";
    const normalizedPage = normalize(pageText);

    if (hasSneakerAskConnectionError(pageText)) {
      console.log("⚠️ Connection error while waiting");
      return "CONNECTION_ERROR";
    }

    if (pageText.includes("Loading products...")) {
      if (!sawLoading) {
        console.log("⏳ Loading products...");
      }

      sawLoading = true;
      await sleep(CHECK_INTERVAL_MS);
      continue;
    }

    // Exact explicit empty result
    if (pageText.includes("No Products Found")) {
      console.log("✅ Search finished: No Products Found");
      return "NO_PRODUCTS";
    }

    // Do not trust "loading disappeared" by itself.
    // Current order must actually be present.
    const rows = findRowsForOrder(orderNumber);

    if (
      rows.length > 0 ||
      normalizedPage.includes(normalizedOrder)
    ) {
      console.log(
        `✅ Results confirmed for current order ${orderNumber}`
      );

      // small stability buffer
      await sleep(400);

      return "ORDER_LOADED";
    }

    console.log(
      `⏳ Waiting for results belonging to ${orderNumber}...`
    );

    await sleep(CHECK_INTERVAL_MS);
  }

  console.log(
    `⚠️ Timeout: never confirmed results for order ${orderNumber}`
  );

  return "TIMEOUT";
}

function findRowsForOrder(orderNumber) {
  const wanted = String(orderNumber).trim();

  const selectors = [
    "tr",
    "[role='row']",
    "tbody > *",
    "[class*='row']",
    "[class*='Row']"
  ];

  const elements = Array.from(
    document.querySelectorAll(selectors.join(","))
  );

  return elements.filter((element) => {
    const text = String(element.innerText || "");
    return text.includes(wanted);
  });
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

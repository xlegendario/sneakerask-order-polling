if (window.location.href !== "https://sell.sneakerask.com/products?status=sourcing") {
  console.log("⛔ Not sourcing page");
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "CHECK_ORDER") {
    processJob(msg.job).then(sendResponse);
    return true;
  }
});

async function processJob(job) {
  const { orderNumber, sku, size } = job;

  const input = document.querySelector("input[placeholder*='Search']");
  input.value = orderNumber;
  input.dispatchEvent(new Event("input", { bubbles: true }));

  await sleep(2000);

  if (document.body.innerText.includes("No Products Found")) {
    return false;
  }

  const rows = document.querySelectorAll("tr");

  for (let row of rows) {
    const text = normalize(row.innerText);

    if (
      text.includes(normalize(sku)) &&
      text.includes(normalize(size))
    ) {
      return true;
    }
  }

  return false;
}

function normalize(str) {
  return str.replace(/\s+/g, "").toLowerCase();
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

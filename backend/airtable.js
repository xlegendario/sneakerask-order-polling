const axios = require("axios");

const BASE = process.env.AIRTABLE_BASE_ID;
const TABLE = encodeURIComponent(process.env.AIRTABLE_TABLE);
const API_KEY = process.env.AIRTABLE_API_KEY;

const COOLDOWN_MINUTES = 10;

const api = axios.create({
  baseURL: `https://api.airtable.com/v0/${BASE}/${TABLE}`,
  headers: {
    Authorization: `Bearer ${API_KEY}`,
    "Content-Type": "application/json"
  }
});

async function getNextOrder() {
  const res = await api.get("", {
    params: {
      view: "All Orders (Open Only SneakerAsk)",
      filterByFormula: `AND(
        {Fulfillment Status} = "Outsource",
        FIND("SneakerAsk", ARRAYJOIN({Store Name})) > 0
      )`,
      maxRecords: 50
    }
  });

  const records = res.data.records || [];
  const now = Date.now();

  for (const r of records) {
    const lastPoll = r.fields["LastSneakeraskPoll"];

    if (!lastPoll) {
      return formatJob(r);
    }

    const lastPollTime = new Date(lastPoll).getTime();
    const minutesAgo = (now - lastPollTime) / 1000 / 60;

    console.log(
      `⏱️ ${r.fields["Shopify Order Number"]} last polled ${minutesAgo.toFixed(1)} min ago`
    );

    if (minutesAgo >= COOLDOWN_MINUTES) {
      return formatJob(r);
    }
  }

  return null;
}

function formatJob(r) {
  console.log("📦 Eligible record:", {
    id: r.id,
    orderNumber: r.fields["Shopify Order Number"],
    sku: r.fields["SKU"],
    size: r.fields["Size"],
    lastPoll: r.fields["LastSneakeraskPoll"]
  });

  return {
    id: r.id,
    orderNumber: String(r.fields["Shopify Order Number"] || ""),
    sku: String(r.fields["SKU"] || ""),
    size: String(r.fields["Size"] || "")
  };
}

async function markStoreFulfilled(id) {
  await api.patch(`/${id}`, {
    fields: {
      "Fulfillment Status": "Store Fulfilled"
    }
  });
}

async function markPolled(id) {
  await api.patch(`/${id}`, {
    fields: {
      "LastSneakeraskPoll": new Date().toISOString()
    }
  });
}

module.exports = { getNextOrder, markStoreFulfilled, markPolled };

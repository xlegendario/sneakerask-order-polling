const axios = require("axios");

const BASE = process.env.AIRTABLE_BASE_ID;
const TABLE = encodeURIComponent(process.env.AIRTABLE_TABLE);
const API_KEY = process.env.AIRTABLE_API_KEY;

const COOLDOWN_MINUTES = 15;
const MIN_ORDER_AGE_MINUTES = 30;

const api = axios.create({
  baseURL: `https://api.airtable.com/v0/${BASE}/${TABLE}`,
  headers: {
    Authorization: `Bearer ${API_KEY}`,
    "Content-Type": "application/json"
  }
});

async function getNextOrder() {
  let allRecords = [];
  let offset;

  do {
    const res = await api.get("", {
      params: {
        view: "All Orders (Open Only SneakerAsk)",
        filterByFormula: `AND(
          {Fulfillment Status} = "Outsource",
          FIND("SneakerAsk", ARRAYJOIN({Store Name})) > 0
        )`,
        pageSize: 100,
        ...(offset ? { offset } : {})
      }
    });

    allRecords.push(...(res.data.records || []));
    offset = res.data.offset;
  } while (offset);

  const now = Date.now();

  const eligibleRecords = allRecords
    .map((record) => {
      const lastPoll = record.fields["LastSneakeraskPoll"];

      return {
        record,
        lastPollTime: lastPoll ? new Date(lastPoll).getTime() : null
      };
    })
    .filter((item) => {
      const orderDate = item.record.fields["Order Date"];
      const orderTime = orderDate ? new Date(orderDate).getTime() : null;
    
      if (!orderTime) {
        console.log("⚠️ Skipping record without Order Date:", item.record.id);
        return false;
      }
    
      const orderAgeMinutes = (now - orderTime) / 1000 / 60;
    
      if (orderAgeMinutes < MIN_ORDER_AGE_MINUTES) {
        console.log(
          `⏳ Too new: ${item.record.fields["Shopify Order Number"]} is ${orderAgeMinutes.toFixed(1)} min old`
        );
        return false;
      }
    
      if (!item.lastPollTime) return true;
    
      const minutesAgo = (now - item.lastPollTime) / 1000 / 60;
      return minutesAgo >= COOLDOWN_MINUTES;
    })
    .sort((a, b) => {
      if (!a.lastPollTime && b.lastPollTime) return -1;
      if (a.lastPollTime && !b.lastPollTime) return 1;
      if (!a.lastPollTime && !b.lastPollTime) return 0;

      return a.lastPollTime - b.lastPollTime;
    });

  console.log("📊 Airtable records found:", allRecords.length);
  console.log("✅ Eligible records:", eligibleRecords.length);

  if (!eligibleRecords.length) {
    console.log("⏳ No eligible records right now");
    return null;
  }

  return formatJob(eligibleRecords[0].record);
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

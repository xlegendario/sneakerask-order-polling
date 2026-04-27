const axios = require("axios");

const BASE = process.env.AIRTABLE_BASE_ID;
const TABLE = encodeURIComponent(process.env.AIRTABLE_TABLE);
const API_KEY = process.env.AIRTABLE_API_KEY;

const api = axios.create({
  baseURL: `https://api.airtable.com/v0/${BASE}/${TABLE}`,
  headers: {
    Authorization: `Bearer ${API_KEY}`,
    "Content-Type": "application/json"
  }
});

// Get one Outsource order
async function getNextOrder() {
  const res = await api.get("", {
    params: {
      filterByFormula: `{Fulfillment Status} = "Outsource"`,
      maxRecords: 1
    }
  });

  if (!res.data.records.length) return null;

  const r = res.data.records[0];

  return {
    id: r.id,
    orderNumber: String(r.fields["Shopify Order Number"] || ""),
    sku: String(r.fields["SKU"] || ""),
    size: String(r.fields["Size"] || "")
  };
}

// Update to Store Fulfilled
async function markStoreFulfilled(id) {
  await api.patch(`/${id}`, {
    fields: {
      "Fulfillment Status": "Store Fulfilled"
    }
  });
}

module.exports = { getNextOrder, markStoreFulfilled };

const axios = require("axios");

const BASE = process.env.AIRTABLE_BASE_ID;
const TABLE = encodeURIComponent(process.env.AIRTABLE_TABLE);
const API_KEY = process.env.AIRTABLE_API_KEY;

const COOLDOWN_MINUTES = 15;
const MIN_ORDER_AGE_MINUTES = 30;

const VIEW_NAME = "All Orders (Open Only SneakerAsk)";

const api = axios.create({
  baseURL: `https://api.airtable.com/v0/${BASE}/${TABLE}`,
  headers: {
    Authorization: `Bearer ${API_KEY}`,
    "Content-Type": "application/json"
  }
});

async function getNextOrder() {
  const allRecords = await getAllRecords();
  const now = Date.now();

  const candidates = allRecords
    .map((record) => {
      const orderNumber = record.fields["Shopify Order Number"];
      const orderDateRaw = record.fields["Order Date"];
      const lastPollRaw = record.fields["LastSneakeraskPoll"];

      const orderTime = orderDateRaw ? new Date(orderDateRaw).getTime() : null;
      const lastPollTime = lastPollRaw ? new Date(lastPollRaw).getTime() : null;

      const orderAgeMinutes = orderTime ? (now - orderTime) / 1000 / 60 : null;
      const lastPollAgeMinutes = lastPollTime ? (now - lastPollTime) / 1000 / 60 : null;

      return {
        record,
        orderNumber,
        orderDateRaw,
        lastPollRaw,
        orderTime,
        lastPollTime,
        orderAgeMinutes,
        lastPollAgeMinutes
      };
    })
    .filter((item) => {
      // Must have Order Date
      if (!item.orderTime || Number.isNaN(item.orderTime)) {
        console.log("⚠️ Skip no/invalid Order Date:", item.orderNumber, item.orderDateRaw);
        return false;
      }

      // Order must be at least 30 minutes old
      if (item.orderAgeMinutes < MIN_ORDER_AGE_MINUTES) {
        return false;
      }

      // Empty LastSneakeraskPoll = always eligible after 30 min order age
      if (!item.lastPollTime || Number.isNaN(item.lastPollTime)) {
        return true;
      }

      // Otherwise eligible after cooldown
      return item.lastPollAgeMinutes >= COOLDOWN_MINUTES;
    })
    .sort((a, b) => {
      // Empty LastSneakeraskPoll ALWAYS first
      if (!a.lastPollTime && b.lastPollTime) return -1;
      if (a.lastPollTime && !b.lastPollTime) return 1;

      // If both empty, oldest order first
      if (!a.lastPollTime && !b.lastPollTime) {
        return a.orderTime - b.orderTime;
      }

      // Otherwise oldest poll first
      return a.lastPollTime - b.lastPollTime;
    });

  console.log("📊 Total Airtable records:", allRecords.length);
  console.log("✅ Eligible records:", candidates.length);

  if (!candidates.length) {
    const oldest = allRecords
      .map((r) => {
        const lastPoll = r.fields["LastSneakeraskPoll"];
        return {
          orderNumber: r.fields["Shopify Order Number"],
          lastPoll,
          minutesAgo: lastPoll ? ((now - new Date(lastPoll).getTime()) / 1000 / 60).toFixed(1) : "EMPTY",
          orderDate: r.fields["Order Date"]
        };
      })
      .sort((a, b) => {
        if (a.minutesAgo === "EMPTY") return -1;
        if (b.minutesAgo === "EMPTY") return 1;
        return Number(b.minutesAgo) - Number(a.minutesAgo);
      })
      .slice(0, 10);

    console.log("🧪 Oldest / empty poll debug:", oldest);
    return null;
  }

  const picked = candidates[0];

  console.log("📦 Picked next record:", {
    orderNumber: picked.orderNumber,
    orderAgeMinutes: picked.orderAgeMinutes?.toFixed(1),
    lastPollAgeMinutes: picked.lastPollAgeMinutes?.toFixed(1) || "EMPTY",
    lastPoll: picked.lastPollRaw
  });

  return formatJob(picked.record);
}

async function getAllRecords() {
  let records = [];
  let offset;

  do {
    const res = await api.get("", {
      params: {
        view: VIEW_NAME,
        /*
          Alleen orders die WIJ voor SneakerAsk moeten vullen.

          {Marketplace} = "" is de hele toevoeging, en die is niet cosmetisch.
          Sinds de consignment-flow bestaat draagt SneakerAsk twee petten: de
          winkel waarvoor wij inkopen, en de marktplaats waaraan wij verkopen.
          Beide soorten orders hebben Store Name "SneakerAsk" en komen op
          Outsource terecht.

          Een consignment-order staat per definitie niet op hun sourcing-pagina
          - het is onze verkoop aan hen, niet hun vraag aan ons. Die kwam hier
          dus altijd terug als NOT_FOUND en werd op Store Fulfilled gezet.
          Twee orders zijn daar op 6 september door geraakt, en bij allebei had
          de koper al betaald terwijl er geen paar tegenover stond.
        */
        filterByFormula: `AND(
          {Fulfillment Status} = "Outsource",
          FIND("SneakerAsk", ARRAYJOIN({Store Name})) > 0,
          {Marketplace} = ""
        )`,
        pageSize: 100,
        ...(offset ? { offset } : {})
      }
    });

    records.push(...(res.data.records || []));
    offset = res.data.offset;
  } while (offset);

  return records;
}

function formatJob(r) {
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

module.exports = {
  getNextOrder,
  markStoreFulfilled,
  markPolled
};

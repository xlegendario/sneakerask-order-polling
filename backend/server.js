const express = require("express");
const cors = require("cors");
const { getNextOrder, markStoreFulfilled, markPolled } = require("./airtable");

const app = express();
app.use(cors());
app.use(express.json());

// Health check
app.get("/", (req, res) => {
  res.send("SneakerAsk polling backend running");
});

// Get next job
app.get("/next", async (req, res) => {
  try {
    const job = await getNextOrder();
    res.json(job);
  } catch (err) {
    console.error("GET /next error:", err.message);
    res.status(500).send("error");
  }
});

// Receive result
app.post("/result", async (req, res) => {
  const { id, found } = req.body;

  try {
    if (!found) {
      console.log("❌ Not found → updating Airtable:", id);
      await markStoreFulfilled(id);
    } else {
      console.log("✅ Found → skip");
    }
    
    // 🔥 ALWAYS mark as polled
    await markPolled(id);

    res.sendStatus(200);
  } catch (err) {
    console.error("POST /result error:", err.message);
    res.status(500).send("error");
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

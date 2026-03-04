const express = require("express");
const bodyParser = require("body-parser");
const path = require("path");
const http = require("http");
const WebSocket = require("ws");
const setupDatabase = require("./database");
const MQTTClient = require("./mqttClient");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const TEAM_ID = "y2c_team0125";
const PORT = 3000;

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

let db;
const mqttClient = new MQTTClient(TEAM_ID, wss);

app.use(async (req, res, next) => {
  req.db = db;
  next();
});

wss.on("connection", (ws) => {
  console.log("WebSocket client connected");
});

app.get("/api/cards", async (req, res) => {
  const cards = await req.db.all("SELECT uid, balance FROM cards");
  const cardMap = {};
  cards.forEach((card) => (cardMap[card.uid] = card.balance));
  res.json(cardMap);
});

app.get("/api/products", async (req, res) => {
  const products = await req.db.all("SELECT * FROM products");
  res.json(products);
});

app.get("/api/cards/:uid", async (req, res) => {
  const card = await req.db.get(
    "SELECT uid, balance FROM cards WHERE uid = ?",
    [req.params.uid],
  );

  if (!card) {
    return res.status(404).json({ error: "Card not found" });
  }

  res.json(card);
});

app.get("/api/transactions/:uid", async (req, res) => {
  const transactions = await req.db.all(
    `SELECT t.*, p.name as product_name 
     FROM transactions t
     LEFT JOIN products p ON t.product_id = p.id
     WHERE uid = ? 
     ORDER BY created_at DESC 
     LIMIT 50`,
    [req.params.uid],
  );
  res.json(transactions);
});

app.post("/api/topup", async (req, res) => {
  const { uid, amount } = req.body;

  if (!uid || !amount || amount <= 0) {
    return res
      .status(400)
      .json({ error: "Valid uid and positive amount required" });
  }

  const dbRun = await req.db.exec("BEGIN TRANSACTION");

  try {
    let card = await req.db.get("SELECT balance FROM cards WHERE uid = ?", [
      uid,
    ]);
    let previousBalance = card ? card.balance : 0;
    let newBalance = previousBalance + amount;

    await req.db.run(
      `INSERT INTO cards (uid, balance) VALUES (?, ?)
       ON CONFLICT(uid) DO UPDATE SET balance = ?`,
      [uid, newBalance, newBalance],
    );

    await req.db.run(
      `INSERT INTO transactions (uid, type, amount, previous_balance, new_balance)
       VALUES (?, 'TOPUP', ?, ?, ?)`,
      [uid, amount, previousBalance, newBalance],
    );

    await req.db.exec("COMMIT");

    mqttClient.publishTopup(uid, amount);

    mqttClient.broadcastUpdate();

    res.json({
      uid,
      newBalance,
      message: "Top-up successful",
    });
  } catch (error) {
    await req.db.exec("ROLLBACK");
    console.error("Top-up error:", error);
    res.status(500).json({ error: "Transaction failed" });
  }
});

app.post("/api/pay", async (req, res) => {
  const { uid, product_id, quantity = 1 } = req.body;

  if (!uid || !product_id) {
    return res.status(400).json({ error: "uid and product_id required" });
  }

  const product = await req.db.get("SELECT * FROM products WHERE id = ?", [
    product_id,
  ]);
  if (!product) {
    return res.status(404).json({ error: "Product not found" });
  }

  const totalAmount = product.price * quantity;
  await req.db.exec("BEGIN TRANSACTION");

  try {
    const card = await req.db.get("SELECT balance FROM cards WHERE uid = ?", [
      uid,
    ]);

    if (!card) {
      throw new Error("Card not found");
    }

    if (card.balance < totalAmount) {
      throw new Error("Insufficient balance");
    }

    const previousBalance = card.balance;
    const newBalance = previousBalance - totalAmount;

    await req.db.run("UPDATE cards SET balance = ? WHERE uid = ?", [
      newBalance,
      uid,
    ]);

    await req.db.run(
      `INSERT INTO transactions 
       (uid, type, amount, previous_balance, new_balance, product_id, quantity)
       VALUES (?, 'PAYMENT', ?, ?, ?, ?, ?)`,
      [uid, totalAmount, previousBalance, newBalance, product_id, quantity],
    );

    await req.db.exec("COMMIT");

    mqttClient.publishPayment(uid, totalAmount);

    mqttClient.broadcastUpdate();

    res.json({
      uid,
      newBalance,
      product: product.name,
      quantity,
      totalAmount,
      message: "Payment successful",
    });
  } catch (error) {
    await req.db.exec("ROLLBACK");
    console.error("Payment error:", error);

    res.status(400).json({
      error: error.message || "Payment failed",
      reason: error.message,
    });
  }
});

async function startServer() {
  db = await setupDatabase();
  await mqttClient.connect(db);

  server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`WebSocket server running on ws://localhost:${PORT}`);
  });
}

startServer().catch(console.error);

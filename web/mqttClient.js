const mqtt = require("mqtt");

class MQTTClient {
  constructor(teamId, wss) {
    this.teamId = teamId;
    this.wss = wss;
    this.TOPIC_STATUS = `rfid/${teamId}/card/status`;
    this.TOPIC_TOPUP = `rfid/${teamId}/card/topup`;
    this.TOPIC_PAY = `rfid/${teamId}/card/pay`;
    this.TOPIC_BALANCE = `rfid/${teamId}/card/balance`;

    this.client = null;
    this.db = null;
  }

  async connect(db) {
    this.db = db;
    this.client = mqtt.connect("mqtt://broker.benax.rw");

    this.client.on("connect", () => {
      console.log("MQTT Connected");
      this.client.subscribe([this.TOPIC_STATUS, this.TOPIC_BALANCE], (err) => {
        if (err) console.error("MQTT subscribe error:", err);
      });
    });

    this.client.on("message", (topic, message) => {
      this.handleMessage(topic, message);
    });
  }

  async handleMessage(topic, message) {
    const payload = JSON.parse(message.toString());

    if (topic === this.TOPIC_STATUS) {
      await this.handleCardStatus(payload);
    } else if (topic === this.TOPIC_BALANCE) {
      await this.handleBalanceUpdate(payload);
    }
  }

  async handleCardStatus(payload) {
    const { uid, balance } = payload;

    await this.db.run(
      `INSERT INTO cards (uid, balance) VALUES (?, ?)
       ON CONFLICT(uid) DO UPDATE SET balance = ?`,
      [uid, balance, balance],
    );

    this.broadcastUpdate();

    console.log(`Card detected: ${uid}, Balance: ${balance}`);
  }

  async handleBalanceUpdate(payload) {
    const { uid, new_balance } = payload;

    await this.db.run(`UPDATE cards SET balance = ? WHERE uid = ?`, [
      new_balance,
      uid,
    ]);

    this.broadcastUpdate();
    console.log(`Balance updated: ${uid} → ${new_balance}`);
  }

  publishTopup(uid, amount) {
    const payload = { uid, amount };
    this.client.publish(this.TOPIC_TOPUP, JSON.stringify(payload));
  }

  publishPayment(uid, amount) {
    const payload = { uid, amount };
    this.client.publish(this.TOPIC_PAY, JSON.stringify(payload));
  }

  broadcastUpdate() {
    if (this.wss) {
      this.wss.clients.forEach((client) => {
        if (client.readyState === 1) {
          client.send("refresh");
        }
      });
    }
  }
}

module.exports = MQTTClient;

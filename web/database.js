const sqlite3 = require("sqlite3");
const { open } = require("sqlite");

async function setupDatabase() {
  const db = await open({
    filename: "./wallet.db",
    driver: sqlite3.Database,
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS cards (
      uid TEXT PRIMARY KEY,
      balance INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      price INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uid TEXT NOT NULL,
      type TEXT CHECK(type IN ('TOPUP', 'PAYMENT')),
      amount INTEGER NOT NULL,
      previous_balance INTEGER NOT NULL,
      new_balance INTEGER NOT NULL,
      product_id INTEGER,
      quantity INTEGER,
      status TEXT DEFAULT 'SUCCESS',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (uid) REFERENCES cards(uid),
      FOREIGN KEY (product_id) REFERENCES products(id)
    );

    -- Insert sample products
    INSERT OR IGNORE INTO products (name, price) VALUES
      ('Coffee', 500),
      ('Sandwich', 1500),
      ('Water', 300),
      ('Juice', 800),
      ('Snack', 400);
  `);

  console.log("Database setup complete");
  return db;
}

module.exports = setupDatabase;

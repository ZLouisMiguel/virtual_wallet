let ws;
let products = [];

// WebSocket connection
function connectWebSocket() {
  ws = new WebSocket(`ws://${window.location.host}`);

  ws.onopen = () => {
    document.getElementById("ws-status").textContent =
      "✅ Connected - Live updates active";
    document.getElementById("ws-status").style.background = "#d4edda";
  };

  ws.onclose = () => {
    document.getElementById("ws-status").textContent =
      "❌ Disconnected - Reconnecting...";
    document.getElementById("ws-status").style.background = "#f8d7da";
    setTimeout(connectWebSocket, 3000);
  };

  ws.onmessage = (event) => {
    if (event.data === "refresh") {
      fetchCards();
    }
  };
}

// Fetch all cards
async function fetchCards() {
  try {
    const res = await fetch("/api/cards");
    const cards = await res.json();

    const cardsList = document.getElementById("cards-list");
    cardsList.innerHTML = "";

    Object.entries(cards).forEach(([uid, balance]) => {
      const cardDiv = document.createElement("div");
      cardDiv.className = "card-item";
      cardDiv.innerHTML = `
        <span class="card-uid">${uid}</span>
        <span class="card-balance">${balance.toLocaleString()} RWF</span>
      `;
      cardsList.appendChild(cardDiv);
    });
  } catch (error) {
    console.error("Error fetching cards:", error);
  }
}

// Fetch card details by UID
async function fetchCardDetails(uid) {
  if (!uid) return null;
  try {
    const res = await fetch(`/api/cards/${uid}`);
    if (res.ok) {
      return await res.json();
    }
  } catch (error) {
    console.error("Error fetching card details:", error);
  }
  return null;
}

// Fetch products
async function fetchProducts() {
  try {
    const res = await fetch("/api/products");
    products = await res.json();

    const select = document.getElementById("product");
    select.innerHTML = '<option value="">Select a product</option>';

    products.forEach((product) => {
      const option = document.createElement("option");
      option.value = product.id;
      option.textContent = `${product.name} - ${product.price.toLocaleString()} RWF`;
      select.appendChild(option);
    });
  } catch (error) {
    console.error("Error fetching products:", error);
  }
}

// Calculate total cost
function calculateTotal() {
  const productId = document.getElementById("product").value;
  const quantity = parseInt(document.getElementById("quantity").value) || 1;

  if (productId) {
    const product = products.find((p) => p.id == productId);
    if (product) {
      const total = product.price * quantity;
      document.getElementById("total-cost").textContent =
        `${total.toLocaleString()} RWF`;
      return total;
    }
  }
  document.getElementById("total-cost").textContent = "0 RWF";
  return 0;
}

// Top-up function
async function handleTopup() {
  const uid = document.getElementById("topup-uid").value.trim().toUpperCase();
  const amount = parseInt(document.getElementById("topup-amount").value);
  const resultDiv = document.getElementById("topup-result");

  if (!uid) {
    showResult(resultDiv, "Please enter card UID", "error");
    return;
  }

  if (!amount || amount < 100) {
    showResult(
      resultDiv,
      "Please enter valid amount (minimum 100 RWF)",
      "error",
    );
    return;
  }

  try {
    const res = await fetch("/api/topup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid, amount }),
    });

    const data = await res.json();

    if (res.ok) {
      showResult(
        resultDiv,
        `✅ Top-up successful! New balance: ${data.newBalance.toLocaleString()} RWF`,
        "success",
      );
      document.getElementById("topup-amount").value = "";
      fetchCards();
      updatePreviousBalances();
    } else {
      showResult(resultDiv, `❌ Error: ${data.error}`, "error");
    }
  } catch (error) {
    showResult(resultDiv, "❌ Network error. Please try again.", "error");
  }
}

// Payment function
async function handlePayment() {
  const uid = document.getElementById("pay-uid").value.trim().toUpperCase();
  const productId = document.getElementById("product").value;
  const quantity = parseInt(document.getElementById("quantity").value) || 1;
  const resultDiv = document.getElementById("pay-result");

  if (!uid) {
    showResult(resultDiv, "Please enter card UID", "error");
    return;
  }

  if (!productId) {
    showResult(resultDiv, "Please select a product", "error");
    return;
  }

  try {
    const res = await fetch("/api/pay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid, product_id: productId, quantity }),
    });

    const data = await res.json();

    if (res.ok) {
      showResult(
        resultDiv,
        `✅ Payment successful! New balance: ${data.newBalance.toLocaleString()} RWF`,
        "success",
      );
      document.getElementById("product").value = "";
      document.getElementById("quantity").value = "1";
      calculateTotal();
      fetchCards();
      updatePreviousBalances();
    } else {
      showResult(
        resultDiv,
        `❌ ${data.reason || data.error || "Payment failed"}`,
        "error",
      );
    }
  } catch (error) {
    showResult(resultDiv, "❌ Network error. Please try again.", "error");
  }
}

// Show result message
function showResult(element, message, type) {
  element.textContent = message;
  element.className = `result ${type}`;
  setTimeout(() => {
    element.style.display = "none";
    element.className = "result";
  }, 5000);
}

// Update previous balances
async function updatePreviousBalances() {
  const uidTopup = document
    .getElementById("topup-uid")
    .value.trim()
    .toUpperCase();
  const uidPay = document.getElementById("pay-uid").value.trim().toUpperCase();

  if (uidTopup) {
    const card = await fetchCardDetails(uidTopup);
    if (card) {
      document.getElementById("prev-balance-topup").textContent =
        `${card.balance.toLocaleString()} RWF`;
    }
  }

  if (uidPay) {
    const card = await fetchCardDetails(uidPay);
    if (card) {
      document.getElementById("prev-balance-pay").textContent =
        `${card.balance.toLocaleString()} RWF`;
    }
  }
}

// Event Listeners
document.addEventListener("DOMContentLoaded", () => {
  connectWebSocket();
  fetchCards();
  fetchProducts();
  updatePreviousBalances();

  // Top-up button
  document.getElementById("topup-btn").addEventListener("click", handleTopup);

  // Pay button
  document.getElementById("pay-btn").addEventListener("click", handlePayment);

  // UID input changes
  document
    .getElementById("topup-uid")
    .addEventListener("input", updatePreviousBalances);
  document
    .getElementById("pay-uid")
    .addEventListener("input", updatePreviousBalances);

  // Product/quantity changes
  document.getElementById("product").addEventListener("change", calculateTotal);
  document.getElementById("quantity").addEventListener("input", calculateTotal);

  // Refresh every 30 seconds as backup
  setInterval(fetchCards, 30000);
});

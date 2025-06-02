const TelegramBot = require("node-telegram-bot-api");
const fs = require("fs");

const path = "./users.json";

const token = "token TG bot";

const bot = new TelegramBot(token, { polling: true });

const content = fs.readFileSync("users.json", "utf8");
const users = JSON.parse(content);

const userStates = {};
const ordersFile = "orders.json";
let orders = [];
let lastOrderNumber = 0;

if (fs.existsSync(ordersFile)) {
  orders = JSON.parse(fs.readFileSync(ordersFile, "utf8"));
}

if (orders.length > 0) {
  lastOrderNumber = Math.max(
    ...orders.map((o) => parseInt((o.orderNumber || "").replace("№", "")) || 0)
  );
}

// Check access
bot.onText(/\/start/, (msg) => {
  const userId = String(msg.from.id);
  if (users[userId] && users[userId].role === "admin") {
    bot.sendMessage(msg.chat.id, "Admin commands:", {
      reply_markup: {
        keyboard: [["Create order", "View orders"], ["Cancel input"]],
        resize_keyboard: true,
        one_time_keyboard: false,
      },
    });
  } else if (users[userId] && users[userId].role === "worker") {
    bot.sendMessage(msg.chat.id, "Worker commands:", {
      reply_markup: {
        keyboard: [
          ["Task list", "Accept order"],
          ["Complete order", "My orders"],
        ],
        resize_keyboard: true,
        one_time_keyboard: false,
      },
    });
  } else bot.sendMessage(msg.chat.id, "The door is here 👉🚪");
});

// Move bot.onText(/\/neworder/) above bot.on("message") and remove duplication
bot.onText(/\/neworder/, (msg) => {
  const userId = String(msg.from.id);
  if (users[userId] && users[userId].role === "admin") {
    userStates[userId] = {
      state: "askingClientPhoto",
      tempOrder: {},
    };
    bot.sendMessage(msg.chat.id, "Send the order photo or type 'Skip':");
  } else {
    bot.sendMessage(msg.chat.id, "You do not have access to this command!");
  }
});

// Handle user-friendly buttons and user states
bot.on("message", (msg) => {
  const userId = String(msg.from.id);
  const chatId = msg.chat.id;
  // Skip commands
  if (msg.text && msg.text.startsWith("/")) return;

  // For admin
  if (users[userId] && users[userId].role === "admin") {
    if (msg.text === "Create order") {
      bot.processUpdate({
        update_id: Date.now(),
        message: { ...msg, text: "/neworder" },
      });
      return;
    }
    if (msg.text === "View orders") {
      bot.sendMessage(chatId, "Enter command /orderlist №order_number or just enter this command to see the last 10 orders");
      return;
    }
    if (msg.text === "Cancel input") {
      bot.processUpdate({
        update_id: Date.now(),
        message: { ...msg, text: "/cancel" },
      });
      return;
    }
  }
  // For worker
  if (users[userId] && users[userId].role === "worker") {
    if (msg.text === "Task list") {
      bot.processUpdate({
        update_id: Date.now(),
        message: { ...msg, text: "/taskslist" },
      });
      return;
    }
    if (msg.text === "Accept order") {
      bot.sendMessage(chatId, "Enter command /accept №order_number");
      return;
    }
    if (msg.text === "Complete order") {
      bot.sendMessage(chatId, "Enter command /done №order_number");
      return;
    }
    if (msg.text === "My orders") {
      bot.processUpdate({
        update_id: Date.now(),
        message: { ...msg, text: "/acceptedorders" },
      });
      return;
    }
  }

  // Handle user states (userStates)
  const userState = userStates[userId];
  if (!userState) return;

  const order = userState.tempOrder;

  switch (userState.state) {
    case "askingClientPhoto":
      if (msg.photo && msg.photo.length > 0) {
        const fileId = msg.photo[msg.photo.length - 1].file_id;
        order.photo = fileId;
      } else if (msg.document && msg.document.mime_type && msg.document.mime_type.startsWith("image/")) {
        order.photo = msg.document.file_id;
      } else if (msg.text && msg.text.toLowerCase() === "skip") {
        order.photo = null;
      } else {
        bot.sendMessage(chatId, "Please send a photo or type 'Skip'.");
        return;
      }
      userState.state = "askingClientName";
      bot.sendMessage(chatId, "Enter client name:");
      break;
    case "askingClientName":
      order.orderNumber = `№${++lastOrderNumber}`;
      order.clientName = msg.text;
      userState.state = "askingClientPhone";
      bot.sendMessage(chatId, "Enter client phone:");
      break;
    case "askingClientPhone":
      order.phone = msg.text;
      const now = new Date();
      const options = {
        timeZone: "Europe/Kaliningrad",
        hour12: false,
      };
      const formattedDate = now.toLocaleString("en-US", options);
      order.createdAt = formattedDate;
      userState.state = "askingClientItem";
      bot.sendMessage(chatId, "Item(s):");
      break;
    case "askingClientItem":
      order.item = msg.text;
      userState.state = "askingClientSand";
      bot.sendMessage(chatId, "Sand:");
      break;
    case "askingClientSand":
      order.sand = msg.text;
      userState.state = "askingClientPrimer";
      bot.sendMessage(chatId, "Primer:");
      break;
    case "askingClientPrimer":
      order.primer = msg.text;
      userState.state = "askingClientColor";
      bot.sendMessage(chatId, "Color:");
      break;
    case "askingClientColor":
      order.color = msg.text;
      userState.state = "askingClientColorStructure";
      bot.sendMessage(chatId, "Paint structure:");
      break;
    case "askingClientColorStructure":
      order.colorStructure = msg.text;
      userState.state = "askingClientScotch";
      bot.sendMessage(chatId, "Tape:");
      break;
    case "askingClientScotch":
      order.scotch = msg.text;
      order.status = "Waiting for worker";
      orders.push(order);
      fs.writeFileSync(ordersFile, JSON.stringify(orders, null, 2));
      delete userStates[userId];
      bot.sendMessage(chatId, `Order saved ✅\nNumber: ${order.orderNumber}`);
      break;
  }
});

function formatOrder(order) {
  return `
🔹 ${order.orderNumber}
👤 Client: ${order.clientName}
📞 Phone: ${order.phone}
📦 Item: ${order.item}
🏖 Sand: ${order.sand}
🧱 Primer: ${order.primer}
🎨 Color: ${order.color}
🧩 Structure: ${order.colorStructure}
🩹 Tape: ${order.scotch} 
📈 Order status: ${order.status}
🕒 Date: ${order.createdAt}`;
}

bot.onText(/\/orderlist(?:\s+(.*))?/, (msg, match) => {
  const userId = String(msg.from.id);
  const chatId = msg.chat.id;

  if (!users[userId] || users[userId].role !== "admin") {
    bot.sendMessage(chatId, "You do not have this command!");
    return;
  }

  const query = match[1]?.trim(); // What after /orderlist

  // If a specific order number is specified
  if (query && query.startsWith("№")) {
    const order = orders.find((o) => o.orderNumber === query);
    if (order) {
      if (order.photo) {
        bot.sendPhoto(chatId, order.photo, { caption: formatOrder(order), parse_mode: 'Markdown' });
      } else {
        bot.sendMessage(chatId, formatOrder(order));
      }
    } else {
      bot.sendMessage(chatId, `Order ${query} not found ❌`);
    }
    return;
  }
  // Show only the last 10 orders
  const lastTenOrders = orders.slice(-10).reverse();
  if (lastTenOrders.length === 0) {
    bot.sendMessage(chatId, "No orders yet.");
    return;
  }
  for (const order of lastTenOrders) {
    if (order.photo) {
      bot.sendPhoto(chatId, order.photo, { caption: formatOrder(order), parse_mode: 'Markdown' });
    } else {
      bot.sendMessage(chatId, formatOrder(order));
    }
  }
});

bot.onText(/\/cancel/, (msg) => {
  const userId = String(msg.from.id);
  const chatId = msg.chat.id;

  if (!users[userId] || users[userId].role !== "admin") {
    bot.sendMessage(chatId, "You do not have this command!");
    return;
  }

  if (userStates[userId]) {
    delete userStates[userId];
    bot.sendMessage(chatId, "Order input cancelled ❌");
  } else {
    bot.sendMessage(chatId, "No active order input to cancel.");
  }
});

// Worker logic

bot.onText(/\/taskslist/, (msg) => {
  const userId = String(msg.from.id);
  const chatId = msg.chat.id;

  if (!users[userId] || users[userId].role !== "worker") {
    bot.sendMessage(chatId, "You do not have this command!");
    return;
  }

  const waitingOrders = orders.filter(
    (order) => order.status === "Waiting for worker"
  );

  if (waitingOrders.length === 0) {
    bot.sendMessage(chatId, "No orders waiting 👷‍♂️");
    return;
  }

  // Send each order separately: if there is a photo — with photo, otherwise text
  for (const order of waitingOrders) {
    const text = `🔹 ${order.orderNumber}\n🎨 Color: ${order.color}\n🌾 Structure: ${order.colorStructure}\n🧱 Primer: ${order.primer}\n🏷️ Tape: ${order.scotch}`;
    if (order.photo) {
      bot.sendPhoto(chatId, order.photo, { caption: text });
    } else {
      bot.sendMessage(chatId, text);
    }
  }
});

bot.onText(/\/accept\s+(№\d+)/, (msg, match) => {
  const userId = String(msg.from.id);
  const chatId = msg.chat.id;

  if (!users[userId] || users[userId].role !== "worker") {
    bot.sendMessage(chatId, "You do not have this command!");
    return;
  }

  const inputNumber = match[1].replace("№", "").trim();
  const order = orders.find(
    (o) => String(o.orderNumber).replace("№", "").trim() === inputNumber
  );

  if (!order) {
    bot.sendMessage(chatId, `❌ Order №${match[1]} not found.`);
    return;
  }

  if (order.status !== "Waiting for worker") {
    bot.sendMessage(
      chatId,
      `⚠️ Order ${order.orderNumber} already accepted or completed.`
    );
    return;
  }

  order.status = "accepted";
  order.nameWorker = users[userId]?.name || "NoName";

  fs.writeFileSync(ordersFile, JSON.stringify(orders, null, 2));
  bot.sendMessage(chatId, `✅ You accepted order ${order.orderNumber}`);
});

bot.onText(/\/acceptedorders/, (msg) => {
  const userId = String(msg.from.id);
  const chatId = msg.chat.id;

  if (!users[userId] || users[userId].role !== "worker") {
    bot.sendMessage(chatId, "You do not have access to this command ❌");
    return;
  }

  const workerName = users[userId]?.name || "NoName";

  const myOrders = orders.filter(
    (o) => o.status === "accepted" && o.nameWorker === workerName
  );

  if (myOrders.length === 0) {
    bot.sendMessage(chatId, "You have no accepted orders 💤");
    return;
  }

  const message = myOrders
    .map(
      (o) =>
        `🔹 ${o.orderNumber}\nColor: ${o.color}\nStructure: ${o.colorStructure}\nPrimer: ${o.primer}\nSand: ${o.sand}`
    )
    .join("\n\n");

  bot.sendMessage(chatId, `📦 Your accepted orders:\n\n${message}`);
});

bot.onText(/\/done\s+(№\d+)/, (msg, match) => {
  const userId = String(msg.from.id);
  const chatId = msg.chat.id;

  if (!users[userId] || users[userId].role !== "worker") {
    bot.sendMessage(chatId, "You do not have this command!");
    return;
  }

  const inputNumber = match[1].replace("№", "").trim();
  const order = orders.find(
    (o) => String(o.orderNumber).replace("№", "").trim() === inputNumber
  );

  if (!order) {
    bot.sendMessage(chatId, `❌ Order №${match[1]} not found.`);
    return;
  }

  if (order.status !== "accepted") {
    bot.sendMessage(chatId, `⚠️ Order ${order.orderNumber} already completed.`);
    return;
  }

  order.status = "completed";
  order.nameWorker = users[userId]?.name || "NoName";

  fs.writeFileSync(ordersFile, JSON.stringify(orders, null, 2));
  bot.sendMessage(chatId, `✅ You have completed order ${order.orderNumber}`);
});

console.log("Bot started and ready to work! 🚀");

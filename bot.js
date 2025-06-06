import TelegramBot from "node-telegram-bot-api";
import axios from "axios";
import fs from "fs";
import dotenv from "dotenv";
dotenv.config();

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
if (!TELEGRAM_TOKEN) {
  throw new Error("TELEGRAM_TOKEN belum di-set di .env");
}

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

// Menyimpan state per user
const userState = {};

/**
 * Membuat header Cloudflare API
 */
function cfHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/javascript",
  };
}

/**
 * Deploy Worker ke Cloudflare
 */
async function deployWorker(accountId, apiToken, workerName, domain) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${workerName}`;
  let code = fs.readFileSync("worker_template.js", "utf8");
  code = code.replace(/example\.com/g, domain);
  return await axios.put(url, code, { headers: cfHeaders(apiToken) });
}

/**
 * List Worker di Cloudflare
 */
async function listWorker(accountId, apiToken) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts`;
  return await axios.get(url, { headers: cfHeaders(apiToken) });
}

/**
 * Hapus Worker Cloudflare
 */
async function deleteWorker(accountId, apiToken, workerName) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${workerName}`;
  return await axios.delete(url, { headers: cfHeaders(apiToken) });
}

// Start command: mulai proses login step by step
bot.onText(/\/start/, (msg) => {
  userState[msg.from.id] = { step: "awaiting_api_token" };
  bot.sendMessage(msg.chat.id, "Masukkan Cloudflare API Token:");
});

// Handler semua pesan masuk (flow login dan menu)
bot.on("message", async (msg) => {
  // Skip jika command, biar tidak dobel handler (kecuali /start)
  if (msg.text && msg.text.startsWith("/") && msg.text !== "/start") return;

  const id = msg.from.id;
  if (!userState[id]) return; // Harus /start dulu

  // Step 1: Input API Token
  if (userState[id].step === "awaiting_api_token") {
    userState[id].apiToken = msg.text.trim();
    userState[id].step = "awaiting_account_id";
    bot.sendMessage(msg.chat.id, "Masukkan Cloudflare Account ID:");
    return;
  }

  // Step 2: Input Account ID
  if (userState[id].step === "awaiting_account_id") {
    userState[id].accountId = msg.text.trim();
    userState[id].step = "awaiting_zone_id";
    bot.sendMessage(msg.chat.id, "Masukkan Cloudflare Zone ID (boleh dikosongkan, ketik - jika ingin skip):");
    return;
  }

  // Step 3: Input Zone ID (opsional)
  if (userState[id].step === "awaiting_zone_id") {
    userState[id].zoneId = msg.text.trim() === "-" ? "" : msg.text.trim();
    userState[id].step = "logged_in";
    // Tampilkan menu utama setelah login selesai
    const opts = {
      reply_markup: {
        keyboard: [
          ["Buat Worker Wildcard"],
          ["List Worker", "Hapus Worker"],
        ],
        resize_keyboard: true,
      },
    };
    bot.sendMessage(msg.chat.id, "Login Cloudflare berhasil! Pilih menu:", opts);
    return;
  }

  // Setelah login, handle menu
  if (userState[id].step === "logged_in") {
    // Buat Worker
    if (msg.text === "Buat Worker Wildcard") {
      bot.sendMessage(
        msg.chat.id,
        "Masukkan nama worker dan domain, format: nama_worker|domain.com"
      );
      userState[id].menu = "awaiting_worker_data";
      return;
    }

    // Proses input worker
    if (userState[id].menu === "awaiting_worker_data" && msg.text.includes("|")) {
      const [worker, domain] = msg.text.split("|");
      try {
        const res = await deployWorker(
          userState[id].accountId,
          userState[id].apiToken,
          worker.trim(),
          domain.trim()
        );
        if (res.data && res.data.success) {
          bot.sendMessage(
            msg.chat.id,
            `Worker '${worker}' untuk domain '${domain}' berhasil dibuat!`
          );
        } else {
          bot.sendMessage(msg.chat.id, "Gagal membuat worker:\n" + JSON.stringify(res.data.errors));
        }
      } catch (e) {
        bot.sendMessage(
          msg.chat.id,
          `Error: ${
            e.response?.data?.errors
              ? JSON.stringify(e.response.data.errors)
              : e.message
          }`
        );
      }
      userState[id].menu = undefined;
      return;
    }

    // List Worker
    if (msg.text === "List Worker") {
      try {
        const res = await listWorker(userState[id].accountId, userState[id].apiToken);
        if (res.data && res.data.success) {
          const workers =
            res.data.result && res.data.result.length
              ? res.data.result.map((w) => w.id).join("\n")
              : "Belum ada worker.";
          bot.sendMessage(msg.chat.id, "Daftar Worker:\n" + workers);
        } else {
          bot.sendMessage(msg.chat.id, "Gagal ambil worker.");
        }
      } catch (e) {
        bot.sendMessage(
          msg.chat.id,
          `Error: ${
            e.response?.data?.errors
              ? JSON.stringify(e.response.data.errors)
              : e.message
          }`
        );
      }
      return;
    }

    // Hapus Worker
    if (msg.text === "Hapus Worker") {
      bot.sendMessage(msg.chat.id, "Ketik nama worker yang mau dihapus:");
      userState[id].menu = "awaiting_worker_delete";
      return;
    }

    // Proses hapus worker
    if (userState[id].menu === "awaiting_worker_delete") {
      try {
        const res = await deleteWorker(
          userState[id].accountId,
          userState[id].apiToken,
          msg.text.trim()
        );
        if (res.data && res.data.success) {
          bot.sendMessage(
            msg.chat.id,
            `Worker '${msg.text.trim()}' berhasil dihapus!`
          );
        } else {
          bot.sendMessage(msg.chat.id, "Gagal hapus worker:\n" + JSON.stringify(res.data.errors));
        }
      } catch (e) {
        bot.sendMessage(
          msg.chat.id,
          `Error: ${
            e.response?.data?.errors
              ? JSON.stringify(e.response.data.errors)
              : e.message
          }`
        );
      }
      userState[id].menu = undefined;
      return;
    }
  }
});

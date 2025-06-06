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
const userState = {};

function cfHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/javascript",
  };
}

async function deployWorker(accountId, apiToken, workerName, domain, wildcard) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${workerName}`;
  let code = fs.readFileSync("worker_template.js", "utf8");
  code = code.replace(/example\.com/g, domain)
             .replace(/WILDCARD_PLACEHOLDER/g, wildcard);
  return await axios.put(url, code, { headers: cfHeaders(apiToken) });
}

async function listWorker(accountId, apiToken) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts`;
  return await axios.get(url, { headers: cfHeaders(apiToken) });
}

async function deleteWorker(accountId, apiToken, workerName) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${workerName}`;
  return await axios.delete(url, { headers: cfHeaders(apiToken) });
}

bot.onText(/\/start/, (msg) => {
  userState[msg.from.id] = { step: "awaiting_api_token" };
  bot.sendMessage(msg.chat.id, "Masukkan Cloudflare API Token:");
});

bot.on("message", async (msg) => {
  if (msg.text && msg.text.startsWith("/") && msg.text !== "/start") return;

  const id = msg.from.id;
  if (!userState[id]) return;

  if (userState[id].step === "awaiting_api_token") {
    userState[id].apiToken = msg.text.trim();
    userState[id].step = "awaiting_account_id";
    bot.sendMessage(msg.chat.id, "Masukkan Cloudflare Account ID:");
    return;
  }

  if (userState[id].step === "awaiting_account_id") {
    userState[id].accountId = msg.text.trim();
    userState[id].step = "awaiting_zone_id";
    bot.sendMessage(msg.chat.id, "Masukkan Cloudflare Zone ID (boleh dikosongkan, ketik - jika ingin skip):");
    return;
  }

  if (userState[id].step === "awaiting_zone_id") {
    userState[id].zoneId = msg.text.trim() === "-" ? "" : msg.text.trim();
    userState[id].step = "logged_in";
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

  // Step by step flow for creating a worker
  if (userState[id].step === "logged_in") {
    // Mulai proses pembuatan worker
    if (msg.text === "Buat Worker Wildcard") {
      userState[id].making_worker_step = 1;
      bot.sendMessage(msg.chat.id, "Masukkan nama worker:");
      return;
    }

    // Step 1: Input nama worker
    if (userState[id].making_worker_step === 1) {
      userState[id].workerName = msg.text.trim();
      userState[id].making_worker_step = 2;
      bot.sendMessage(msg.chat.id, "Masukkan domain (misal: example.com):");
      return;
    }

    // Step 2: Input domain
    if (userState[id].making_worker_step === 2) {
      userState[id].domain = msg.text.trim();
      userState[id].making_worker_step = 3;
      bot.sendMessage(msg.chat.id, "Masukkan wildcard yang akan dipasang (misal: *.example.com):");
      return;
    }

    // Step 3: Input wildcard, lalu deploy worker
    if (userState[id].making_worker_step === 3) {
      userState[id].wildcard = msg.text.trim();
      userState[id].making_worker_step = 0; // Reset state
      try {
        const res = await deployWorker(
          userState[id].accountId,
          userState[id].apiToken,
          userState[id].workerName,
          userState[id].domain,
          userState[id].wildcard
        );
        if (res.data && res.data.success) {
          bot.sendMessage(
            msg.chat.id,
            `✅ Worker berhasil dibuat!\n\nNama Worker: ${userState[id].workerName}\nDomain: ${userState[id].domain}\nWildcard: ${userState[id].wildcard}`
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
      // Hapus data worker agar flow bisa diulang
      delete userState[id].workerName;
      delete userState[id].domain;
      delete userState[id].wildcard;
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

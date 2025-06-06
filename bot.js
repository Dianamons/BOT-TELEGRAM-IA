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

const userCfg = {};

function cfHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/javascript",
  };
}

async function deployWorker(accountId, apiToken, workerName, domain) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${workerName}`;
  let code = fs.readFileSync("worker_template.js", "utf8");
  code = code.replace(/example\.com/g, domain);
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
  bot.sendMessage(
    msg.chat.id,
    "Masukkan Cloudflare API Token & Account ID (pisahkan pakai |):\nCF_API:<token>|<account_id>"
  );
});

bot.onText(/^CF_API:/, (msg) => {
  try {
    const [, raw] = msg.text.split("CF_API:");
    const [token, accid] = raw.trim().split("|");
    userCfg[msg.from.id] = { apiToken: token.trim(), accountId: accid.trim() };
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
  } catch {
    bot.sendMessage(
      msg.chat.id,
      "Format salah! Contoh: CF_API:<token>|<account_id>"
    );
  }
});

bot.onText(/^Buat Worker Wildcard$/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    "Masukkan nama worker dan domain, format: nama_worker|domain.com"
  );
});

bot.on("message", async (msg) => {
  if (
    msg.text &&
    msg.text.includes("|") &&
    !msg.text.startsWith("CF_API:")
  ) {
    const cfg = userCfg[msg.from.id];
    if (!cfg) {
      bot.sendMessage(
        msg.chat.id,
        "Belum login Cloudflare. Kirim: CF_API:<token>|<account_id>"
      );
      return;
    }
    try {
      const [worker, domain] = msg.text.split("|");
      const res = await deployWorker(
        cfg.accountId,
        cfg.apiToken,
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
      bot.sendMessage(msg.chat.id, `Error: ${e.response?.data?.errors ? JSON.stringify(e.response.data.errors) : e.message}`);
    }
  }

  if (msg.text === "List Worker") {
    const cfg = userCfg[msg.from.id];
    if (!cfg) {
      bot.sendMessage(
        msg.chat.id,
        "Belum login Cloudflare. Kirim: CF_API:<token>|<account_id>"
      );
      return;
    }
    try {
      const res = await listWorker(cfg.accountId, cfg.apiToken);
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
      bot.sendMessage(msg.chat.id, `Error: ${e.response?.data?.errors ? JSON.stringify(e.response.data.errors) : e.message}`);
    }
  }

  if (msg.text === "Hapus Worker") {
    bot.sendMessage(msg.chat.id, "Ketik nama worker yang mau dihapus:");
    userCfg[msg.from.id].deleteMode = true;
    return;
  }

  if (
    msg.text &&
    userCfg[msg.from.id] &&
    userCfg[msg.from.id].deleteMode &&
    !["Buat Worker Wildcard", "List Worker", "Hapus Worker"].includes(msg.text)
  ) {
    const cfg = userCfg[msg.from.id];
    try {
      const res = await deleteWorker(cfg.accountId, cfg.apiToken, msg.text.trim());
      if (res.data && res.data.success) {
        bot.sendMessage(
          msg.chat.id,
          `Worker '${msg.text.trim()}' berhasil dihapus!`
        );
      } else {
        bot.sendMessage(msg.chat.id, "Gagal hapus worker:\n" + JSON.stringify(res.data.errors));
      }
      cfg.deleteMode = false;
    } catch (e) {
      bot.sendMessage(msg.chat.id, `Error: ${e.response?.data?.errors ? JSON.stringify(e.response.data.errors) : e.message}`);
      cfg.deleteMode = false;
    }
  }
});

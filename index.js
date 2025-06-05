require("dotenv").config();
const { Telegraf, Markup } = require("telegraf");
const axios = require("axios");

// Telegram Bot Token dan Hugging Face Token dari ENV
const BOT_TOKEN = process.env.BOT_TOKEN;
const HF_TOKEN = process.env.HF_TOKEN; // ambil di huggingface.co/settings/tokens

if (!BOT_TOKEN) throw new Error("BOT_TOKEN belum di-set di .env atau Railway Variables");
if (!HF_TOKEN) throw new Error("HF_TOKEN belum di-set di .env atau Railway Variables");

// Model default, bisa diganti model lain dari HuggingFace yang support text generation
const HF_MODEL = process.env.HF_MODEL || "HuggingFaceH4/zephyr-7b-beta";

const bot = new Telegraf(BOT_TOKEN);

const mainMenu = Markup.inlineKeyboard([
  [Markup.button.callback("🧠 Ganti Model", "ganti_model")],
  [Markup.button.url("🔑 Dapatkan HF Token", "https://huggingface.co/settings/tokens")],
]);

// Menyimpan model per user (RAM, bukan database)
const userModels = new Map();

// Start dan bantuan
bot.start((ctx) => {
  ctx.reply(
    `🤖 *Bot AI Telegram - Hugging Face*\n\n` +
    `Langsung chat apa aja, bot akan membalas pakai model AI open source dari Hugging Face!\n\n` +
    `Model default: \`${HF_MODEL}\`\n\n` +
    `Ketik /model [nama_model] untuk ganti model (misal: \`/model mistralai/Mistral-7B-Instruct-v0.2\`)\n\n` +
    `Butuh token? Klik tombol di bawah!`,
    { parse_mode: "Markdown", ...mainMenu }
  );
});

bot.help((ctx) => {
  ctx.reply(
    "Perintah utama:\n" +
    "/model [nama_model] - Ganti model HF (misal: /model meta-llama/Llama-2-7b-chat-hf)\n" +
    "/model - Lihat model yang sedang dipakai\n" +
    "Langsung chat apa saja, bot akan jawab!\n\n" +
    "Token dapat di: https://huggingface.co/settings/tokens"
  );
});

// Ganti model via command
bot.command("model", (ctx) => {
  const args = ctx.message.text.split(" ").slice(1).join(" ").trim();
  if (!args) {
    const cur = userModels.get(ctx.from.id) || HF_MODEL;
    ctx.reply(`Model saat ini: \`${cur}\`\n\nUntuk ganti, pakai format: /model [nama_model]`);
    return;
  }
  userModels.set(ctx.from.id, args);
  ctx.reply(`Model AI untuk kamu diganti ke: \`${args}\``);
});

// Ganti model via menu
bot.action("ganti_model", (ctx) => {
  ctx.answerCbQuery();
  ctx.reply(
    "Ketik perintah ini untuk ganti model:\n\n/model [nama_model]\n\n" +
    "Contoh:\n/model mistralai/Mistral-7B-Instruct-v0.2\n/model meta-llama/Llama-2-7b-chat-hf"
  );
});

// Chat handler
bot.on("text", async (ctx) => {
  if (ctx.message.text.startsWith("/")) return; // skip command

  const model = userModels.get(ctx.from.id) || HF_MODEL;
  ctx.replyWithChatAction("typing");

  try {
    const prompt = ctx.message.text;
    const response = await axios.post(
      `https://api-inference.huggingface.co/models/${model}`,
      { inputs: prompt, options: { wait_for_model: true } },
      {
        headers: { Authorization: `Bearer ${HF_TOKEN}` },
        timeout: 60000,
      }
    );

    // Parsing jawaban
    let output = "";
    if (Array.isArray(response.data)) {
      output = response.data[0]?.generated_text || "❌ Jawaban kosong.";
    } else if (typeof response.data === "object" && response.data.generated_text) {
      output = response.data.generated_text;
    } else if (response.data.error) {
      output = `❌ Error dari API HF: ${response.data.error}`;
    } else {
      output = "❌ Tidak dapat memproses jawaban AI.";
    }

    // Batas panjang Telegram
    if (output.length > 3900) output = output.slice(0, 3900) + "\n\n...(jawaban dipotong)";

    ctx.reply(output);
  } catch (e) {
    let msg = e.response?.data?.error || e.message;
    ctx.reply(`❌ Gagal mendapatkan jawaban dari AI.\nError: ${msg}`);
  }
});

bot.launch();
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));

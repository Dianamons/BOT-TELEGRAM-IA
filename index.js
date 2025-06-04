require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const BOT_TOKEN = process.env.BOT_TOKEN;

const bot = new Telegraf(BOT_TOKEN);

// Simpan API key user (pakai Map, bisa diganti database)
const userKeys = new Map();
// Simpan riwayat chat user (dummy, 5 pesan terakhir per user)
const userChats = new Map();

const mainMenu = Markup.inlineKeyboard([
  [
    Markup.button.callback('🔑 Set Gemini API Key', 'set_api'),
    Markup.button.callback('🗑️ Hapus API', 'hapus_api'),
  ],
  [
    Markup.button.url('📄 Panduan', 'https://aistudio.google.com/app/apikey'),
    Markup.button.callback('📝 Riwayat Chat', 'riwayat_chat'),
  ]
]);

// Welcome dan menu utama
bot.start((ctx) => {
  ctx.reply(
    `👋 *Selamat datang di Gemini Bot!*\n\n` +
    `Bot AI Telegram berbasis Google Gemini. Silakan pilih menu di bawah ini:\n\n` +
    `🔑 *Set Gemini API Key*: Masukkan atau ganti API key kamu\n` +
    `🗑️ *Hapus API*: Hapus API key yang tersimpan\n` +
    `📄 *Panduan*: Cara membuat API key Gemini (Google)\n` +
    `📝 *Riwayat Chat*: Lihat 5 chat AI terakhir kamu\n\n` +
    `Setelah API key disimpan, kamu bisa langsung chat apa saja!`,
    { parse_mode: 'Markdown', ...mainMenu }
  );
});

// Tombol Set API Key
bot.action('set_api', (ctx) => {
  ctx.answerCbQuery();
  ctx.reply(
    'Masukkan API Key Gemini kamu (format: AI...)\n' +
    'Panduan: https://aistudio.google.com/app/apikey'
  );
});

// Tombol Hapus API Key
bot.action('hapus_api', (ctx) => {
  userKeys.delete(ctx.from.id);
  ctx.answerCbQuery();
  ctx.reply('API Key kamu sudah dihapus. Masukkan lagi lewat menu jika ingin pakai bot.');
});

// Tombol Riwayat Chat
bot.action('riwayat_chat', (ctx) => {
  ctx.answerCbQuery();
  const history = userChats.get(ctx.from.id) || [];
  if (history.length === 0) {
    ctx.reply('Belum ada riwayat chat.');
  } else {
    ctx.reply(
      '*Riwayat 5 chat terakhir:*\n\n' +
      history.map((h, i) => `*${i+1}.* ${h}`).join('\n'),
      { parse_mode: 'Markdown' }
    );
  }
});

// Simpan API Key Gemini (format AI... dengan minimal 30 char, bisa disesuaikan)
bot.hears(/^AI[\w-]{30,}/, (ctx) => {
  userKeys.set(ctx.from.id, ctx.message.text.trim());
  ctx.reply('API Key Gemini kamu sudah disimpan! Sekarang kamu bisa mulai bertanya ke AI.');
});

// Handler chat ke Gemini
bot.on('text', async (ctx) => {
  if (ctx.message.text.startsWith('/')) return;
  if (ctx.message.text.startsWith('AI')) return;

  const apiKey = userKeys.get(ctx.from.id);
  if (!apiKey) {
    ctx.reply(
      'Kamu belum memasukkan API Key Gemini!\nKlik tombol di bawah ini untuk memasukkan API Key.',
      mainMenu
    );
    return;
  }

  // Simpan chat user (riwayat)
  const chatHist = userChats.get(ctx.from.id) || [];
  if (chatHist.length >= 5) chatHist.shift();
  chatHist.push(ctx.message.text);
  userChats.set(ctx.from.id, chatHist);

  // Kirim ke Gemini
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });
    const result = await model.generateContent(ctx.message.text);
    const answer = result?.response?.text()?.trim();

    if (answer) {
      ctx.reply(answer);
    } else {
      ctx.reply('❌ Gagal mendapatkan jawaban dari Gemini. Coba lagi atau cek API Key kamu.');
    }
  } catch (e) {
    ctx.reply(
      `❌ Gagal mendapatkan jawaban dari Gemini.\n*Error:* ${e.message}\n\nSilakan cek API Key atau limit akun kamu.`,
      { parse_mode: 'Markdown' }
    );
  }
});

// Jalankan bot
bot.launch();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

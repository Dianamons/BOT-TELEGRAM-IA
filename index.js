require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const { Configuration, OpenAIApi } = require('openai');

const BOT_TOKEN = process.env.BOT_TOKEN;

const bot = new Telegraf(BOT_TOKEN);

// Simpan API key user (pakai Map, bisa diganti database)
const userKeys = new Map();
// Simpan riwayat chat user (dummy, 5 pesan terakhir per user)
const userChats = new Map();

const mainMenu = Markup.inlineKeyboard([
  [
    Markup.button.callback('🔑 Set API Key', 'set_api'),
    Markup.button.callback('🗑️ Hapus API', 'hapus_api'),
  ],
  [
    Markup.button.url('📄 Panduan', 'https://platform.openai.com/api-keys'),
    Markup.button.callback('📝 Riwayat Chat', 'riwayat_chat'),
  ]
]);

// Welcome dan menu utama
bot.start((ctx) => {
  ctx.reply(
    `👋 *Selamat datang di IA Bot!*\n\n`
    + `Bot AI Telegram. Silakan pilih menu di bawah ini:\n\n`
    + `🔑 *Set API Key*: Masukkan atau ganti API key kamu\n`
    + `🗑️ *Hapus API*: Hapus API key yang tersimpan\n`
    + `📄 *Panduan*: Cara membuat API key OpenAI\n`
    + `📝 *Riwayat Chat*: Lihat 5 chat AI terakhir kamu\n\n`
    + `Setelah API key disimpan, kamu bisa langsung chat apa saja!`,
    { parse_mode: 'Markdown', ...mainMenu }
  );
});

// Tombol Set API Key
bot.action('set_api', (ctx) => {
  ctx.answerCbQuery();
  ctx.reply(
    'Silakan masukkan API Key OpenAI kamu (format: sk-xxxx...).\n'
    + 'Panduan: https://platform.openai.com/api-keys'
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

// Simpan API Key (cek format sk-xxx)
bot.hears(/^sk-[a-zA-Z0-9]{20,}/, (ctx) => {
  userKeys.set(ctx.from.id, ctx.message.text.trim());
  ctx.reply('API Key kamu sudah disimpan! Sekarang kamu bisa mulai bertanya ke AI.');
});

// Handler chat ke AI
bot.on('text', async (ctx) => {
  // Abaikan perintah & input yang bukan pertanyaan AI
  if (ctx.message.text.startsWith('/')) return;
  if (ctx.message.text.startsWith('sk-')) return;

  const apiKey = userKeys.get(ctx.from.id);
  if (!apiKey) {
    ctx.reply(
      'Kamu belum memasukkan API Key!\nKlik tombol di bawah ini untuk memasukkan API Key.',
      mainMenu
    );
    return;
  }

  // Simpan chat user (riwayat)
  const chatHist = userChats.get(ctx.from.id) || [];
  if (chatHist.length >= 5) chatHist.shift();
  chatHist.push(ctx.message.text);
  userChats.set(ctx.from.id, chatHist);

  // Kirim ke OpenAI
  try {
    const configuration = new Configuration({ apiKey });
    const openai = new OpenAIApi(configuration);

    const res = await openai.createChatCompletion({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: ctx.message.text }]
    });

    const answer = res.data.choices[0].message.content.trim();

    ctx.replyWithMarkdownV2(
      '```\n' + escapeMarkdown(answer) + '\n```'
    );
  } catch (e) {
    ctx.reply(
      `❌ Gagal mendapatkan jawaban dari AI.\n*Error:* ${e.message}\n\nSilakan cek API Key atau limit akun kamu.`,
      { parse_mode: 'Markdown' }
    );
  }
});

// Helper: escape karakter spesial MarkdownV2
function escapeMarkdown(text) {
  return text
    .replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
}

// Jalankan bot
bot.launch();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

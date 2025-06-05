const { Telegraf, Markup, session } = require('telegraf');
require('dotenv').config();
const axios = require('axios');
const fs = require('fs');

// In-memory session (untuk demo, ganti DB untuk produksi!)
const userSessions = {};

const bot = new Telegraf(process.env.BOT_TOKEN);

// Middleware session per user
bot.use((ctx, next) => {
  const userId = ctx.from.id;
  ctx.session = userSessions[userId] = userSessions[userId] || {};
  return next();
});

// STEP 1: Login
bot.start((ctx) => {
  ctx.session = {}; // reset session
  ctx.reply('👋 Selamat datang! Silakan login dengan mengirim API Token Cloudflare Anda:');
  ctx.session.state = 'awaiting_token';
});

bot.on('text', async (ctx) => {
  const { state } = ctx.session;
  if (state === 'awaiting_token') {
    ctx.session.apiToken = ctx.message.text.trim();
    ctx.reply('Masukkan Account ID Cloudflare Anda:');
    ctx.session.state = 'awaiting_account_id';
    return;
  }
  if (state === 'awaiting_account_id') {
    ctx.session.accountId = ctx.message.text.trim();
    ctx.reply('Masukkan Zone ID Cloudflare Anda:');
    ctx.session.state = 'awaiting_zone_id';
    return;
  }
  if (state === 'awaiting_zone_id') {
    ctx.session.zoneId = ctx.message.text.trim();
    ctx.session.state = null;
    ctx.reply('✅ Login berhasil!\n\nMenu:', Markup.keyboard([
      ['Buat Worker', 'Daftar Worker', 'Hapus Worker']
    ]).resize());
    return;
  }
  // Buat Worker
  if (state === 'awaiting_worker_name') {
    ctx.session.workerName = ctx.message.text.trim();
    ctx.reply('Masukkan nama domain (contoh: domain.com):');
    ctx.session.state = 'awaiting_domain';
    return;
  }
  if (state === 'awaiting_domain') {
    ctx.session.domain = ctx.message.text.trim();
    // Replace domain di worker.js template
    let workerCode = fs.readFileSync('./worker.js', 'utf8');
    workerCode = workerCode.replace(/___DOMAIN___/g, ctx.session.domain);
    // Upload ke Cloudflare
    ctx.reply('⏳ Mengupload worker...');
    try {
      await axios.put(
        `https://api.cloudflare.com/client/v4/accounts/${ctx.session.accountId}/workers/scripts/${ctx.session.workerName}`,
        workerCode,
        {
          headers: {
            'Authorization': `Bearer ${ctx.session.apiToken}`,
            'Content-Type': 'application/javascript'
          }
        }
      );
      ctx.reply(`✅ Worker "${ctx.session.workerName}" berhasil dibuat!`, Markup.keyboard([
        ['Tambah Wildcard', 'List Wildcard', 'Hapus Wildcard'],
        ['Menu Utama']
      ]).resize());
      ctx.session.state = null;
    } catch (err) {
      ctx.reply('❌ Gagal upload worker: ' + (err.response?.data?.errors?.[0]?.message || err.message));
      ctx.session.state = null;
    }
    return;
  }
  // Tambah Wildcard
  if (state === 'awaiting_wildcard') {
    const pattern = ctx.message.text.trim();
    ctx.reply('⏳ Menambahkan wildcard route...');
    try {
      await axios.post(
        `https://api.cloudflare.com/client/v4/zones/${ctx.session.zoneId}/workers/routes`,
        {
          pattern,
          script: ctx.session.workerName
        },
        {
          headers: {
            'Authorization': `Bearer ${ctx.session.apiToken}`,
            'Content-Type': 'application/json'
          }
        }
      );
      ctx.reply(`✅ Wildcard "${pattern}" berhasil ditambahkan!`);
    } catch (err) {
      ctx.reply('❌ Gagal tambah wildcard: ' + (err.response?.data?.errors?.[0]?.message || err.message));
    }
    ctx.session.state = null;
    return;
  }
});

// Menu utama & tombol
bot.hears('Buat Worker', (ctx) => {
  ctx.reply('Masukkan nama worker yang ingin dibuat:');
  ctx.session.state = 'awaiting_worker_name';
});
bot.hears('Daftar Worker', async (ctx) => {
  ctx.reply('⏳ Mengambil daftar worker...');
  try {
    const resp = await axios.get(
      `https://api.cloudflare.com/client/v4/accounts/${ctx.session.accountId}/workers/scripts`,
      { headers: { 'Authorization': `Bearer ${ctx.session.apiToken}` } }
    );
    const workers = resp.data.result;
    if (workers.length === 0) return ctx.reply('Belum ada worker.');
    ctx.reply('Daftar Worker:\n' + workers.map(w => '- ' + w.id).join('\n'));
  } catch (err) {
    ctx.reply('❌ Gagal mengambil daftar worker');
  }
});
bot.hears('Hapus Worker', async (ctx) => {
  ctx.reply('⏳ Mengambil daftar worker...');
  try {
    const resp = await axios.get(
      `https://api.cloudflare.com/client/v4/accounts/${ctx.session.accountId}/workers/scripts`,
      { headers: { 'Authorization': `Bearer ${ctx.session.apiToken}` } }
    );
    const workers = resp.data.result;
    if (workers.length === 0) return ctx.reply('Belum ada worker.');
    const buttons = workers.map(w => [Markup.button.callback('Hapus ' + w.id, 'delworker_' + w.id)]);
    ctx.reply('Pilih worker yang akan dihapus:', Markup.inlineKeyboard(buttons));
  } catch (err) {
    ctx.reply('❌ Gagal mengambil daftar worker');
  }
});
bot.action(/^delworker_(.+)$/, async (ctx) => {
  const workerId = ctx.match[1];
  try {
    await axios.delete(
      `https://api.cloudflare.com/client/v4/accounts/${ctx.session.accountId}/workers/scripts/${workerId}`,
      { headers: { 'Authorization': `Bearer ${ctx.session.apiToken}` } }
    );
    ctx.reply(`✅ Worker "${workerId}" dihapus!`);
  } catch (err) {
    ctx.reply('❌ Gagal hapus worker.');
  }
});

// Wildcard menu
bot.hears('Tambah Wildcard', (ctx) => {
  ctx.reply('Masukkan wildcard route (contoh: sub.domain.com/*):');
  ctx.session.state = 'awaiting_wildcard';
});
bot.hears('List Wildcard', async (ctx) => {
  ctx.reply('⏳ Mengambil daftar wildcard...');
  try {
    const resp = await axios.get(
      `https://api.cloudflare.com/client/v4/zones/${ctx.session.zoneId}/workers/routes`,
      { headers: { 'Authorization': `Bearer ${ctx.session.apiToken}` } }
    );
    const routes = resp.data.result;
    if (routes.length === 0) return ctx.reply('Belum ada wildcard.');
    ctx.reply('Daftar Wildcard:\n' + routes.map(r => '- ' + r.pattern).join('\n'));
  } catch (err) {
    ctx.reply('❌ Gagal mengambil daftar wildcard.');
  }
});
bot.hears('Hapus Wildcard', async (ctx) => {
  ctx.reply('⏳ Mengambil daftar wildcard...');
  try {
    const resp = await axios.get(
      `https://api.cloudflare.com/client/v4/zones/${ctx.session.zoneId}/workers/routes`,
      { headers: { 'Authorization': `Bearer ${ctx.session.apiToken}` } }
    );
    const routes = resp.data.result;
    if (routes.length === 0) return ctx.reply('Belum ada wildcard.');
    const buttons = routes.map(r => [Markup.button.callback('Hapus ' + r.pattern, 'delroute_' + r.id)]);
    ctx.reply('Pilih wildcard yang akan dihapus:', Markup.inlineKeyboard(buttons));
  } catch (err) {
    ctx.reply('❌ Gagal mengambil daftar wildcard.');
  }
});
bot.action(/^delroute_(.+)$/, async (ctx) => {
  const routeId = ctx.match[1];
  try {
    await axios.delete(
      `https://api.cloudflare.com/client/v4/zones/${ctx.session.zoneId}/workers/routes/${routeId}`,
      { headers: { 'Authorization': `Bearer ${ctx.session.apiToken}` } }
    );
    ctx.reply('✅ Wildcard dihapus!');
  } catch (err) {
    ctx.reply('❌ Gagal hapus wildcard.');
  }
});

// Menu utama
bot.hears('Menu Utama', (ctx) => {
  ctx.reply('Menu:', Markup.keyboard([
    ['Buat Worker', 'Daftar Worker', 'Hapus Worker']
  ]).resize());
});

// Start bot
bot.launch();

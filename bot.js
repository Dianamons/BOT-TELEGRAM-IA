const { Telegraf, Markup, session } = require('telegraf');
require('dotenv').config();
const axios = require('axios');
const fs = require('fs');

const BOT_TOKEN = process.env.BOT_TOKEN;
const DOMAIN = process.env.WEBHOOK_URL
  ? process.env.WEBHOOK_URL.replace(/^https?:\/\//, '')
  : 'bot-telegram-ia-production.up.railway.app';
const PORT = process.env.PORT || 3000;

const bot = new Telegraf(BOT_TOKEN);
bot.use(session());

// ========== HANDLER LOGIN DAN MENU ==========
bot.start((ctx) => {
  ctx.session = {};
  console.log('START: User', ctx.from.id);
  ctx.reply('👋 Selamat datang! Silakan login dengan mengirim API Token Cloudflare Anda:');
  ctx.session.state = 'awaiting_token';
});

bot.on('text', async (ctx) => {
  if (!ctx.session) ctx.session = {};
  const { state } = ctx.session;
  console.log('ON TEXT:', ctx.from.id, 'STATE:', state);

  if (state === 'awaiting_token') {
    ctx.session.apiToken = ctx.message.text.trim();
    ctx.session.state = 'awaiting_account_id';
    console.log('RECEIVED TOKEN');
    ctx.reply('Masukkan Account ID Cloudflare Anda:');
    return;
  }

  if (state === 'awaiting_account_id') {
    ctx.session.accountId = ctx.message.text.trim();
    ctx.session.state = 'awaiting_zone_id';
    console.log('RECEIVED ACCOUNT ID');
    ctx.reply('Masukkan Zone ID Cloudflare Anda:');
    return;
  }

  if (state === 'awaiting_zone_id') {
    ctx.session.zoneId = ctx.message.text.trim();
    ctx.session.state = null;
    console.log('RECEIVED ZONE ID');
    ctx.reply('✅ Login berhasil!\n\nMenu:', Markup.keyboard([
      ['Buat Worker', 'Daftar Worker', 'Hapus Worker']
    ]).resize());
    return;
  }

  if (state === 'awaiting_worker_name') {
    ctx.session.workerName = ctx.message.text.trim();
    ctx.session.state = 'awaiting_domain';
    console.log('RECEIVED WORKER NAME:', ctx.session.workerName);
    ctx.reply('Masukkan nama domain (contoh: domain.com):');
    return;
  }

  if (state === 'awaiting_domain') {
    ctx.session.domain = ctx.message.text.trim();
    console.log('RECEIVED DOMAIN:', ctx.session.domain);
    let workerCode;
    try {
      workerCode = fs.readFileSync('./worker.js', 'utf8');
      console.log('worker.js found');
    } catch (err) {
      ctx.session.state = null;
      console.error('worker.js NOT FOUND', err);
      ctx.reply('❌ Gagal membaca file worker.js di server.');
      return;
    }
    workerCode = workerCode.replace(/___DOMAIN___/g, ctx.session.domain);

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
      ctx.session.state = null;
      console.log('UPLOAD WORKER SUCCESS');
      ctx.reply(`✅ Worker "${ctx.session.workerName}" berhasil dibuat!`, Markup.keyboard([
        ['Tambah Wildcard', 'List Wildcard', 'Hapus Wildcard'],
        ['Menu Utama']
      ]).resize());
    } catch (err) {
      ctx.session.state = null;
      console.error('UPLOAD WORKER ERROR', err.response?.data || err.message);
      ctx.reply('❌ Gagal upload worker: ' + (err.response?.data?.errors?.[0]?.message || err.message));
    }
    return;
  }

  if (state === 'awaiting_wildcard') {
    const pattern = ctx.message.text.trim();
    console.log('ADDING WILDCARD:', pattern);
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
      console.log('WILDCARD ADDED');
    } catch (err) {
      console.error('ADD WILDCARD ERROR', err.response?.data || err.message);
      ctx.reply('❌ Gagal tambah wildcard: ' + (err.response?.data?.errors?.[0]?.message || err.message));
    }
    ctx.session.state = null;
    return;
  }
});

// ========== MENU WORKER DAN WILDCARD ==========
bot.hears('Buat Worker', (ctx) => {
  if (!ctx.session) ctx.session = {};
  ctx.session.state = 'awaiting_worker_name';
  console.log('MENU: Buat Worker');
  ctx.reply('Masukkan nama worker yang ingin dibuat:');
});

bot.hears('Daftar Worker', async (ctx) => {
  if (!ctx.session) ctx.session = {};
  console.log('MENU: Daftar Worker');
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
    console.error('LIST WORKERS ERROR', err.response?.data || err.message);
  }
});

bot.hears('Hapus Worker', async (ctx) => {
  if (!ctx.session) ctx.session = {};
  console.log('MENU: Hapus Worker');
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
    console.error('LIST WORKERS FOR DELETE ERROR', err.response?.data || err.message);
  }
});

bot.action(/^delworker_(.+)$/, async (ctx) => {
  if (!ctx.session) ctx.session = {};
  const workerId = ctx.match[1];
  console.log('DELETE WORKER:', workerId);
  try {
    await axios.delete(
      `https://api.cloudflare.com/client/v4/accounts/${ctx.session.accountId}/workers/scripts/${workerId}`,
      { headers: { 'Authorization': `Bearer ${ctx.session.apiToken}` } }
    );
    ctx.reply(`✅ Worker "${workerId}" dihapus!`);
  } catch (err) {
    ctx.reply('❌ Gagal hapus worker.');
    console.error('DELETE WORKER ERROR', err.response?.data || err.message);
  }
});

bot.hears('Tambah Wildcard', (ctx) => {
  if (!ctx.session) ctx.session = {};
  ctx.session.state = 'awaiting_wildcard';
  console.log('MENU: Tambah Wildcard');
  ctx.reply('Masukkan wildcard route (contoh: sub.domain.com/*):');
});

bot.hears('List Wildcard', async (ctx) => {
  if (!ctx.session) ctx.session = {};
  console.log('MENU: List Wildcard');
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
    console.error('LIST WILDCARD ERROR', err.response?.data || err.message);
  }
});

bot.hears('Hapus Wildcard', async (ctx) => {
  if (!ctx.session) ctx.session = {};
  console.log('MENU: Hapus Wildcard');
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
    console.error('LIST WILDCARD FOR DELETE ERROR', err.response?.data || err.message);
  }
});

bot.action(/^delroute_(.+)$/, async (ctx) => {
  if (!ctx.session) ctx.session = {};
  const routeId = ctx.match[1];
  console.log('DELETE WILDCARD ROUTE:', routeId);
  try {
    await axios.delete(
      `https://api.cloudflare.com/client/v4/zones/${ctx.session.zoneId}/workers/routes/${routeId}`,
      { headers: { 'Authorization': `Bearer ${ctx.session.apiToken}` } }
    );
    ctx.reply('✅ Wildcard dihapus!');
  } catch (err) {
    ctx.reply('❌ Gagal hapus wildcard.');
    console.error('DELETE WILDCARD ERROR', err.response?.data || err.message);
  }
});

// ========== MENU UTAMA ==========
bot.hears('Menu Utama', (ctx) => {
  if (!ctx.session) ctx.session = {};
  console.log('MENU: Menu Utama');
  ctx.reply('Menu:', Markup.keyboard([
    ['Buat Worker', 'Daftar Worker', 'Hapus Worker']
  ]).resize());
});

// ========== ERROR HANDLING ==========
bot.catch((err, ctx) => {
  console.error('Bot error', err);
  ctx.reply('⚠️ Terjadi error pada bot: ' + err.message);
});

// ========== LAUNCH WEBHOOK ==========
console.log('Bot.js started');
bot.launch({
  webhook: {
    domain: DOMAIN,
    port: PORT,
  }
}).then(() => {
  console.log(`Bot running on webhook at https://${DOMAIN} (port ${PORT})`);
});

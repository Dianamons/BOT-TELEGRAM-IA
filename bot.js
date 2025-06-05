require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const fs = require('fs');
const fetch = require('node-fetch');

const bot = new Telegraf(process.env.BOT_TOKEN);

// Session sederhana (RAM, untuk demo)
const userSessions = {};

// Step handler
const steps = [
  'get_token', 'get_account', 'get_zone', 'get_workername'
];

bot.start((ctx) => {
  userSessions[ctx.from.id] = { step: 0 };
  ctx.reply('🚀 Selamat datang di Bot Cloudflare Worker!\n\nKlik tombol di bawah untuk mulai:',
    Markup.keyboard([['Buat Worker Baru']]).resize()
  );
});

bot.hears('Buat Worker Baru', (ctx) => {
  userSessions[ctx.from.id] = { step: 0 };
  ctx.reply('Masukkan API Token Cloudflare (scope: edit workers):');
});

bot.on('text', async (ctx) => {
  const id = ctx.from.id;
  if (!userSessions[id]) userSessions[id] = { step: 0 };
  const session = userSessions[id];

  // Step 1: API Token
  if (session.step === 0) {
    session.apiToken = ctx.message.text.trim();
    session.step++;
    return ctx.reply('Masukkan Account ID Cloudflare:');
  }
  // Step 2: Account ID
  if (session.step === 1) {
    session.accountId = ctx.message.text.trim();
    session.step++;
    return ctx.reply('Masukkan Zone ID (domain):');
  }
  // Step 3: Zone ID
  if (session.step === 2) {
    session.zoneId = ctx.message.text.trim();
    session.step++;
    return ctx.reply('Masukkan NAMA Worker (tanpa spasi, misal: wildworker):');
  }
  // Step 4: Nama Worker
  if (session.step === 3) {
    session.workerName = ctx.message.text.trim();
    // Deploy worker.js ke Cloudflare
    const code = fs.readFileSync('./worker.js', 'utf8');
    ctx.reply('⏳ Mengupload Worker ke Cloudflare...');
    try {
      const upload = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${session.accountId}/workers/scripts/${session.workerName}`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${session.apiToken}`,
            'Content-Type': 'application/javascript',
          },
          body: code,
        }
      );
      const uploadRes = await upload.json();
      if (!uploadRes.success) {
        session.step = 0;
        return ctx.reply('❌ Gagal upload Worker: ' + (uploadRes.errors && uploadRes.errors[0] && uploadRes.errors[0].message));
      }
      session.step++;
      return ctx.reply('✅ Worker berhasil di-upload!\n\nPilih aksi:', Markup.keyboard([
        ['➕ Tambah Wildcard', '➖ Hapus Wildcard'],
        ['➕ Tambah Worker Baru']
      ]).resize());
    } catch (err) {
      session.step = 0;
      return ctx.reply('❌ Error: ' + err.message);
    }
  }
  // Step 5: Menu setelah Worker dibuat
  if (session.step === 4) {
    if (ctx.message.text === '➕ Tambah Wildcard') {
      session.nextAction = 'add_wildcard';
      return ctx.reply('Masukkan wildcard (misal: *.sub.domain.com):');
    }
    if (ctx.message.text === '➖ Hapus Wildcard') {
      session.nextAction = 'del_wildcard';
      return ctx.reply('Masukkan wildcard yang ingin dihapus (misal: *.sub.domain.com):');
    }
    if (ctx.message.text === '➕ Tambah Worker Baru') {
      session.step = 0;
      return ctx.reply('Masukkan API Token Cloudflare:');
    }
    // Tambah wildcard
    if (session.nextAction === 'add_wildcard') {
      const pattern = ctx.message.text.trim() + '/*';
      ctx.reply('Menambahkan route wildcard...');
      try {
        const route = await fetch(
          `https://api.cloudflare.com/client/v4/zones/${session.zoneId}/workers/routes`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${session.apiToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              pattern,
              script: session.workerName
            }),
          }
        );
        const routeRes = await route.json();
        if (!routeRes.success) {
          return ctx.reply('❌ Gagal tambah wildcard: ' + (routeRes.errors && routeRes.errors[0] && routeRes.errors[0].message));
        }
        session.nextAction = null;
        return ctx.reply('✅ Wildcard route berhasil ditambahkan!');
      } catch (err) {
        return ctx.reply('❌ Error: ' + err.message);
      }
    }
    // Hapus wildcard
    if (session.nextAction === 'del_wildcard') {
      // List all routes to find the id
      ctx.reply('Menghapus wildcard...');
      try {
        // List all routes
        const list = await fetch(
          `https://api.cloudflare.com/client/v4/zones/${session.zoneId}/workers/routes`,
          {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${session.apiToken}`,
            }
          }
        );
        const listRes = await list.json();
        if (!listRes.success) {
          return ctx.reply('❌ Gagal ambil daftar route: ' + (listRes.errors && listRes.errors[0] && listRes.errors[0].message));
        }
        const pattern = ctx.message.text.trim() + '/*';
        const route = listRes.result.find(r => r.pattern === pattern);
        if (!route) return ctx.reply('❌ Route wildcard tersebut tidak ditemukan!');
        // Delete
        const del = await fetch(
          `https://api.cloudflare.com/client/v4/zones/${session.zoneId}/workers/routes/${route.id}`,
          {
            method: 'DELETE',
            headers: {
              Authorization: `Bearer ${session.apiToken}`,
            }
          }
        );
        const delRes = await del.json();
        if (!delRes.success) {
          return ctx.reply('❌ Gagal hapus wildcard: ' + (delRes.errors && delRes.errors[0] && delRes.errors[0].message));
        }
        session.nextAction = null;
        return ctx.reply('✅ Wildcard route berhasil dihapus!');
      } catch (err) {
        return ctx.reply('❌ Error: ' + err.message);
      }
    }
    return ctx.reply('Pilih aksi:', Markup.keyboard([
      ['➕ Tambah Wildcard', '➖ Hapus Wildcard'],
      ['➕ Tambah Worker Baru']
    ]).resize());
  }
});

bot.launch();

# Telegram Bot Cloudflare Worker

Telegram bot untuk membuat, melihat, dan menghapus Cloudflare Worker langsung dari Telegram.

## Fitur

- Login Cloudflare (API Token & Account ID)
- Buat Worker wildcard domain via bot
- List Worker
- Hapus Worker

## Cara Deploy di Railway

1. **Fork/clone repo ini.**
2. **Tambahkan variable environment:**
   - `TELEGRAM_TOKEN` (isi token bot Telegram kamu di Railway dashboard)
3. **Deploy!** Railway otomatis install requirements dan menjalankan bot.
4. **Jalankan bot via Telegram:**
   - Kirim:  
     ```
     CF_API:<api_token>|<account_id>
     ```
   - Pilih menu sesuai kebutuhan.

## File Penting

- **bot.py** — kode utama bot
- **requirements.txt** — dependensi Python
- **worker_template.js** — template Cloudflare Worker
- **.env.example** — contoh file ENV
- **.gitignore** — agar .env tidak terupload ke repo

## Catatan
- Token dan Account ID Cloudflare diinput via chat (tidak di .env, lebih aman).
- Data user hanya disimpan sementara di RAM (untuk production lebih baik pakai DB).

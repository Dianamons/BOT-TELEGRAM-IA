import os
import requests
from aiogram import Bot, Dispatcher, types, executor
from aiogram.types import ReplyKeyboardMarkup, KeyboardButton
from dotenv import load_dotenv

# Load .env
load_dotenv()
TELEGRAM_TOKEN = os.getenv("TELEGRAM_TOKEN")

bot = Bot(token=TELEGRAM_TOKEN)
dp = Dispatcher(bot)

# Simpan data user di memory (untuk production > gunakan DB)
user_cfg = {}

def cf_headers(token):
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/javascript"
    }

def deploy_worker(account_id, api_token, worker_name, domain):
    url = f"https://api.cloudflare.com/client/v4/accounts/{account_id}/workers/scripts/{worker_name}"
    with open("worker_template.js") as f:
        code = f.read().replace("example.com", domain)
    return requests.put(url, headers=cf_headers(api_token), data=code).json()

def list_worker(account_id, api_token):
    url = f"https://api.cloudflare.com/client/v4/accounts/{account_id}/workers/scripts"
    return requests.get(url, headers=cf_headers(api_token)).json()

def delete_worker(account_id, api_token, worker_name):
    url = f"https://api.cloudflare.com/client/v4/accounts/{account_id}/workers/scripts/{worker_name}"
    return requests.delete(url, headers=cf_headers(api_token)).json()

@dp.message_handler(commands=["start"])
async def start(msg: types.Message):
    await msg.reply(
        "Masukkan Cloudflare API Token & Account ID (pisahkan dengan |):\nCF_API:<token>|<account_id>"
    )

@dp.message_handler(lambda m: m.text and m.text.startswith("CF_API:"))
async def save_cf(msg: types.Message):
    try:
        _, raw = msg.text.split("CF_API:")
        token, accid = raw.strip().split("|")
        user_cfg[msg.from_user.id] = {"api_token": token.strip(), "account_id": accid.strip()}
        kb = ReplyKeyboardMarkup(resize_keyboard=True)
        kb.add(KeyboardButton("Buat Worker Wildcard"))
        kb.add(KeyboardButton("List Worker"), KeyboardButton("Hapus Worker"))
        await msg.reply("Login Cloudflare berhasil! Pilih menu:", reply_markup=kb)
    except Exception:
        await msg.reply("Format salah! Contoh: CF_API:<token>|<account_id>")

@dp.message_handler(lambda m: m.text == "Buat Worker Wildcard")
async def buat_worker(msg: types.Message):
    await msg.reply("Masukkan nama worker dan domain, format: nama_worker|domain.com")

@dp.message_handler(lambda m: "|" in m.text and not m.text.startswith("CF_API:"))
async def handle_worker(msg: types.Message):
    cfg = user_cfg.get(msg.from_user.id)
    if not cfg:
        await msg.reply("Belum login Cloudflare. Kirim: CF_API:<token>|<account_id>")
        return
    try:
        worker, domain = msg.text.split("|")
        res = deploy_worker(cfg["account_id"], cfg["api_token"], worker.strip(), domain.strip())
        if res.get("success"):
            await msg.reply(f"Worker '{worker}' untuk domain '{domain}' berhasil dibuat!")
        else:
            await msg.reply(f"Gagal membuat worker: {res.get('errors')}")
    except Exception as e:
        await msg.reply(f"Error: {e}")

@dp.message_handler(lambda m: m.text == "List Worker")
async def list_worker_cmd(msg: types.Message):
    cfg = user_cfg.get(msg.from_user.id)
    if not cfg:
        await msg.reply("Belum login Cloudflare. Kirim: CF_API:<token>|<account_id>")
        return
    res = list_worker(cfg["account_id"], cfg["api_token"])
    if res.get("success"):
        workers = [w["id"] for w in res.get("result",[])]
        await msg.reply("Daftar Worker:\n" + "\n".join(workers) if workers else "Belum ada worker.")
    else:
        await msg.reply("Gagal ambil worker.")

@dp.message_handler(lambda m: m.text == "Hapus Worker")
async def hapus_worker(msg: types.Message):
    await msg.reply("Ketik nama worker yang mau dihapus:")

@dp.message_handler(lambda m: m.text and m.text not in [
    "Buat Worker Wildcard", "List Worker", "Hapus Worker"
])
async def handle_delete(msg: types.Message):
    cfg = user_cfg.get(msg.from_user.id)
    if not cfg:
        await msg.reply("Belum login Cloudflare. Kirim: CF_API:<token>|<account_id>")
        return
    res = delete_worker(cfg["account_id"], cfg["api_token"], msg.text.strip())
    if res.get("success"):
        await msg.reply(f"Worker '{msg.text.strip()}' berhasil dihapus!")
    else:
        await msg.reply(f"Gagal hapus worker: {res.get('errors')}")

if __name__ == "__main__":
    executor.start_polling(dp)

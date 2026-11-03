# Nio - WhatsApp AI Bot

Bot asisten WhatsApp interaktif yang ditenagai oleh **Google Gemini** dan arsitektur **OpenAI-Compatible AI Providers** (mendukung OpenRouter, Ollama/Local AI, Groq, DeepSeek, dll.).

---

## 🚀 Fitur Utama

- 🤖 **Multi-Provider AI Assistant:** Dukungan Google Gemini, OpenRouter.ai, dan Local AI (Ollama).
- 🎙️ **Voice & Audio (TTS):** Microsoft Edge TTS & Voicevox anime voice generator.
- 🎨 **Sticker & Meme Generator:** Pembuatan stiker statis, animasi GIF, stiker quote chat (`.qc`), dan meme (`.smeme` & `.smemegif`).
- 🕌 **Pengingat Sholat:** Notifikasi otomatis waktu sholat per wilayah (WIB).
- 💬 **Interactive Chatting:** Mode ngobrol interaktif (`.chatnio`).
- ⚙️ **Dinamis & Modular:** Manajemen konfigurasi provider AI dan model langsung lewat perintah bot.

---

## 🛠️ Persyaratan Sistem

- [Node.js](https://nodejs.org/) versi 18 atau lebih tinggi
- [FFmpeg](https://ffmpeg.org/) (diperlukan untuk konversi video/GIF ke WebP stiker)
- Akun WhatsApp aktif

---

## 📦 Panduan Instalasi

1. **Clone repository ini:**
   ```bash
   git clone -b public-template https://github.com/Rashfox/RPRO.git
   cd RPRO
   ```

2. **Install dependensi:**
   ```bash
   npm install
   ```

3. **Konfigurasi Environment:**
   Salin file `.env.example` menjadi `.env`:
   ```bash
   cp .env.example .env
   ```
   Buka file `.env` dan sesuaikan nilainya:
   ```env
   GEMINI_API_KEY=your_gemini_api_key_here
   OWNER_NAME=YourName
   OWNER_NUMBER=628xxxxxxxxxx
   OWNER_LID=
   BOT_PREFIX=.
   ```

4. **Jalankan Bot:**
   ```bash
   npm start
   ```

5. **Login ke WhatsApp:**
   - Pilih metode login: **1** untuk Scan QR Code, atau **2** untuk Pairing Code.
   - Sambungkan WhatsApp Anda.

---

## 🤖 Manajemen AI Provider

Sebagai pemilik bot (*owner*), Anda dapat mengelola model dan provider AI langsung dari WhatsApp:

- `.setai` — Menampilkan status provider dan daftar penyedia AI yang aktif.
- `.setai <gemini|openrouter|local>` — Mengganti provider AI yang sedang aktif.
- `.setaimodel [provider] <nama_model>` — Mengatur model AI yang digunakan.
- `.setaikey [provider] <api_key>` — Menyimpan API key untuk provider terkait.
- `.addai <id> <nama> <baseUrl> <model> [apiKey]` — Menambahkan API pihak ketiga baru secara dinamis.

---

## 📂 Struktur Proyek

```text
├── assets/img/              # Aset gambar statis
├── features/                # Modul fitur dan perintah bot
│   ├── ai.js                # Perintah AI formal
│   ├── ai_providers.js      # Runner multi-provider (Gemini / OpenAI API)
│   ├── nio.js               # Persona asisten Nio
│   ├── setai.js             # Manajemen dinamis provider AI
│   └── ...
├── chat_history.template.json # Template database riwayat obrolan
├── contacts.template.json     # Template kontak
├── index.js                 # Titik masuk utama aplikasi (Baileys client)
├── package.json             # Dependensi project
└── .env.example             # Contoh konfigurasi environment
```

---

## 📄 Lisensi

Distributed under the MIT License.

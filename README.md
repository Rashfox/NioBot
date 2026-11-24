# Nio - WhatsApp AI Bot

Bot asisten WhatsApp interaktif yang ditenagai oleh **Google Gemini** dan arsitektur **OpenAI-Compatible AI Providers** (mendukung OpenRouter, Ollama/Local AI, Groq, DeepSeek, dll.).

> 🌐 **[Lihat demo & situs Nio](https://rashfox.github.io/NioBot/)** · **[Baca panduan lengkap](https://rashfox.github.io/NioBot/panduan.html)**

---

## 🚀 Fitur Utama

- 🤖 **Multi-Provider AI Assistant:** Dukungan Google Gemini, OpenRouter.ai, dan Local AI (Ollama).
- 🎙️ **Voice & Audio (TTS):** Microsoft Edge TTS & Voicevox anime voice generator.
- 🎨 **Sticker & Meme Generator:** Pembuatan stiker statis, animasi GIF, stiker quote chat (`.qc`), dan meme (`.smeme` & `.smemegif`).
- 📚 **Pencarian MangaDex:** Cari judul, rekomendasi berdasarkan genre/tag, atau filter berdasarkan jumlah chapter.
- 🌏 **Info Gempa BMKG:** Info gempa terkini dan notifikasi otomatis untuk chat yang berlangganan.
- 🕌 **Pengingat Sholat:** Notifikasi otomatis wilayah Cilacap, hanya untuk chat yang berlangganan.
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
   git clone https://github.com/Rashfox/NioBot.git
   cd NioBot
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

## 📚 Pencarian MangaDex

- `.manga <judul>` — Cari manga berdasarkan judul.
- `.manga tag <genre/tag>` — Rekomendasi maksimal 5 manga terpopuler yang cocok; beberapa tag dapat dipisahkan dengan koma.
- `.manga chapter <jumlah>` — Cari manga dengan jumlah chapter tepat. Pemeriksaan dibatasi ke 30 manga terpopuler karena MangaDex menghitung chapter melalui endpoint agregat.

Hasil ditampilkan sebagai gambar cover dan detail manga, dengan tautan **Baca di MangaDex** yang bisa dibuka langsung.

---

## 🌏 Info Gempa BMKG

- `.gempa` — tampilkan info gempa terbaru dari feed BMKG.
- `.gempa on` — aktifkan notifikasi pembaruan untuk chat saat ini.
- `.gempa off` — berhenti berlangganan di chat saat ini.

Feed BMKG diperiksa setiap menit. Saat bot pertama kali tersambung, feed disinkronkan tanpa mengirim notifikasi lama; notifikasi dikirim untuk pembaruan berikutnya. Informasi berasal dari feed BMKG dan bukan pengganti arahan resmi.

---

## 🕌 Pengingat Sholat

- `.sholat <kota>` — cek jadwal sholat untuk kota tertentu.
- `.sholat on` — berlangganan pengingat otomatis di chat saat ini.
- `.sholat off` — berhenti berlangganan di chat saat ini.
- `.sholat status` — cek status langganan chat saat ini.

Pengingat otomatis mengikuti jadwal wilayah Cilacap dan hanya dikirim ke chat yang memilih berlangganan. Aktifkan perintah di chat pribadi atau grup yang ingin menerima pengingat; bot tidak mengirimkannya ke semua kontak atau grup.

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

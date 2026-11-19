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

- [Node.js](https://nodejs.org/) versi 18 atau lebih tinggi *(disarankan versi LTS v20/v22)*
- [FFmpeg](https://ffmpeg.org/) (diperlukan untuk konversi video/GIF ke WebP stiker)
- Akun WhatsApp aktif

### 📱 Catatan Khusus Pengguna Termux (Android)
Gunakan **Termux versi resmi (F-Droid / GitHub)**, bukan dari Google Play Store. Sebelum *clone* dan `npm install`, pasang paket sistem berikut terlebih dahulu:

```bash
pkg update && pkg upgrade -y
pkg install -y nodejs-lts git ffmpeg libvips clang make python pkg-config

const form = document.querySelector('#demo-form');
const input = document.querySelector('#demo-input');
const messages = document.querySelector('#demo-messages');

function demoReply(command) {
  const normalized = command.trim().toLowerCase();
  if (!normalized) return 'Tulis perintah dulu ya 🌸 Coba .menu atau .ai ide sarapan.';
  if (normalized === '.menu' || normalized === 'menu') {
    return '✨ Menu Nio\n\n.ai <pertanyaan> — tanya AI\n.chatnio — mulai ngobrol\n.tts <teks> — buat pesan suara\n.stiker — buat stiker dari media\n.manga <judul> — cari manga di MangaDex\n.gempa — info gempa terbaru BMKG\n.sholat <kota> — cek jadwal sholat\n.sholat on/off/status — kelola langganan pengingat\n\nLihat panduan untuk daftar perintah lainnya!';
  }
  if (normalized.startsWith('.ai ') || normalized.startsWith('.nio ')) {
    const question = command.trim().replace(/^\.?(?:ai|nio)\s+/i, '');
    return `Ini hanya contoh respons demo untuk: “${question}”\n\nDi bot sebenarnya, jawaban dibuat oleh provider AI yang kamu konfigurasi.`;
  }
  if (normalized.startsWith('.tts')) {
    return '🎙️ Di bot sebenarnya, teks ini akan dibuat menjadi pesan suara. Untuk mencobanya, jalankan Nio dan kirim perintah .tts <teks> di WhatsApp.';
  }
  if (normalized.startsWith('.manga')) {
    return '📚 Cari manga di MangaDex dengan .manga <judul>, .manga tag <genre/tag>, atau .manga chapter <jumlah> di WhatsApp setelah bot berjalan.';
  }
  if (normalized.startsWith('.gempa')) {
    return '🌏 Cek info gempa terbaru BMKG dengan .gempa, atau aktifkan notifikasi otomatis per chat dengan .gempa on / .gempa off di WhatsApp.';
  }
  if (normalized.startsWith('.sholat')) {
    return '🕌 Cek jadwal dengan .sholat <kota>. Gunakan .sholat on untuk menerima pengingat di chat ini, .sholat off untuk berhenti, atau .sholat status untuk mengecek langganan. Pengingat otomatis mengikuti jadwal Cilacap dan hanya dikirim ke chat yang berlangganan.';
  }
  if (normalized.startsWith('.stiker') || normalized.startsWith('.s ')) {
    return '✿ Kirim atau balas gambar/GIF di WhatsApp dengan caption .stiker untuk membuat stiker. Demo browser ini tidak memproses media.';
  }
  return 'Demo ini hanya simulasi beberapa perintah. Coba .menu, .ai ide sarapan, .tts Halo!, atau .sholat Jakarta.';
}

function addMessage(text, className) {
  const message = document.createElement('div');
  message.className = `demo-message ${className}`;
  message.textContent = text;
  messages.append(message);
  messages.scrollTop = messages.scrollHeight;
}

function sendCommand(command) {
  addMessage(command, 'user-message');
  window.setTimeout(() => addMessage(demoReply(command), 'bot-message'), 220);
}

if (form && input && messages) {
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const command = input.value.trim();
    if (!command) return;
    sendCommand(command);
    input.value = '';
  });

  document.querySelectorAll('[data-command]').forEach((button) => {
    button.addEventListener('click', () => {
      input.value = button.dataset.command;
      input.focus();
    });
  });
}

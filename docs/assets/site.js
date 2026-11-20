const form = document.querySelector('#demo-form');
const input = document.querySelector('#demo-input');
const messages = document.querySelector('#demo-messages');

function demoReply(command) {
  const normalized = command.trim().toLowerCase();
  if (!normalized) return 'Tulis perintah dulu ya 🌸 Coba .menu atau .ai ide sarapan.';
  if (normalized === '.menu' || normalized === 'menu') {
    return '✨ Menu Nio\n\n.ai <pertanyaan> — tanya AI\n.chatnio — mulai ngobrol\n.tts <teks> — buat pesan suara\n.stiker — buat stiker dari media\n.sholat <kota> — cek jadwal sholat\n\nLihat panduan untuk daftar perintah lainnya!';
  }
  if (normalized.startsWith('.ai ') || normalized.startsWith('.nio ')) {
    const question = command.trim().replace(/^\.?(?:ai|nio)\s+/i, '');
    return `Ini hanya contoh respons demo untuk: “${question}”\n\nDi bot sebenarnya, jawaban dibuat oleh provider AI yang kamu konfigurasi.`;
  }
  if (normalized.startsWith('.tts')) {
    return '🎙️ Di bot sebenarnya, teks ini akan dibuat menjadi pesan suara. Untuk mencobanya, jalankan Nio dan kirim perintah .tts <teks> di WhatsApp.';
  }
  if (normalized.startsWith('.sholat')) {
    return '🕌 Bot dapat mencari jadwal sholat berdasarkan kota. Demo ini tidak mengambil jadwal langsung; coba .sholat <kota> di WhatsApp setelah bot berjalan.';
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

import 'dotenv/config';
import { makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import pino from 'pino';
import readline from 'readline';
import fs from 'fs';
import { loadCommands, getCommand, commands } from './features/index.js';
import { nio_core, isChatMode, resetChatTimer } from './features/nio.js';
import { readDB, writeDB } from './features/state.js';
import { startPrayerReminder } from './features/sholat.js';
import qrcode from 'qrcode-terminal';

// Setup untuk membaca input nomor dari terminal
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const question = (text) => new Promise((resolve) => rl.question(text, resolve));

// Algoritma Levenshtein Distance untuk mencari kemiripan kata (koreksi typo)
function getLevenshteinDistance(a, b) {
    const matrix = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, // Penggantian huruf
                               Math.min(matrix[i][j - 1] + 1,     // Penambahan huruf
                               matrix[i - 1][j] + 1));            // Penghapusan huruf
            }
        }
    }
    return matrix[b.length][a.length];
}

// Menyimpan nomor di luar fungsi agar bot tidak menanyakan nomor berulang kali saat reconnect
let phoneNumber = '';
let loginMethod = '';
let pairingCodeRequested = false; // Penanda untuk mencegah spam OTP

// Memori "Buku Tamu" untuk melacak siapa saja yang sudah pernah berinteraksi dengan Nio
const dbInit = readDB();
const interactedUsers = new Set(dbInit.interactedUsers || []);

// Setup untuk Contacts lokal (menyimpan nama WA agar tidak perlu Baileys Store yang rawan error)
const contactsFile = './contacts.json';
let contacts = {};
if (fs.existsSync(contactsFile)) {
    try {
        contacts = JSON.parse(fs.readFileSync(contactsFile, 'utf-8'));
    } catch (e) {
        contacts = {};
    }
} else if (fs.existsSync('./contacts.template.json')) {
    try {
        contacts = JSON.parse(fs.readFileSync('./contacts.template.json', 'utf-8'));
        fs.writeFileSync(contactsFile, JSON.stringify(contacts, null, 2));
    } catch (e) {
        contacts = {};
    }
}

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_session');

    // Meminta pilihan login jika belum terdaftar
    if (!state.creds.me && !state.creds.registered) {
        let isValid = false;
        while (!isValid) {
            const method = await question('\nPilih metode login Nio:\n1. Scan QR Code\n2. Pairing Code (Nomor WA)\nPilihan (1/2): ');
            
            if (method === '1') {
                loginMethod = 'qr';
                console.log('Tunggu sebentar, sedang menyiapkan QR Code...');
                isValid = true;
            } else if (method === '2') {
                loginMethod = 'pairing';
                const input = await question('Masukkan nomor WhatsApp (dengan kode negara, contoh: 628xxxx): ');
                phoneNumber = input.replace(/[^0-9]/g, '');
                isValid = true;
            } else {
                console.log('❌ Pilihan tidak valid, silakan ketik angka 1 atau 2.');
            }
        }
    }

    const { version } = await fetchLatestBaileysVersion();
    await loadCommands();

    const sock = makeWASocket({
        version,
        auth: state, 
        logger: pino({ level: 'silent' }),
        browser: ['Mac OS', 'Safari', '10.15.7'] 
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('contacts.upsert', (newContacts) => {
        let updated = false;
        for (const contact of newContacts) {
            if (contact.name || contact.notify) {
                contacts[contact.id] = contact.name || contact.notify;
                updated = true;
            }
        }
        if (updated) {
            fs.writeFileSync(contactsFile, JSON.stringify(contacts, null, 2));
        }
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        // Notifikasi khusus jika pilih metode QR
        if (qr && loginMethod === 'qr') {
            console.log('\n📲 Silakan scan QR Code di bawah ini menggunakan WhatsApp di HP kamu:');
            // Menampilkan QR Code langsung ke terminal
            qrcode.generate(qr, { small: true });
        }

        // Meminta kode pairing HANYA jika pilih metode pairing (opsi 2)
        if (qr && loginMethod === 'pairing' && !sock.authState.creds.me && phoneNumber && !pairingCodeRequested) {
            pairingCodeRequested = true; 
            try {
                const code = await sock.requestPairingCode(phoneNumber);
                console.log(`\n✅ KODE PAIRING ANDA: ${code}`);
                console.log(`Cara Memasukkan Kode:`);
                console.log(`Buka WhatsApp di HP > Perangkat Tertaut > Tautkan Perangkat > Klik "Tautkan dengan nomor telepon saja" (di layar bawah kamera) > Masukkan kodenya.\n⚠️ Catatan: Jika notifikasi tidak muncul, abaikan saja dan langsung ikuti langkah manual di atas.\n`);
            } catch (err) {
                console.log('\n❌ Gagal meminta kode pairing:', err.message);
                pairingCodeRequested = false; 
            }
        }
        
        if (connection === 'close') {
            const statusCode = lastDisconnect.error?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            
            console.log('❌ Koneksi terputus. Error:', lastDisconnect.error?.message || 'Tidak diketahui');
            console.log('🔄 Menghubungkan ulang:', shouldReconnect);
            
            if (shouldReconnect) {
                if (!sock.authState.creds.registered) {
                    pairingCodeRequested = false;
                }
                setTimeout(connectToWhatsApp, 5000); 
            } else {
                console.log('⚠️ Sesi tidak valid atau telah dilogout dari perangkat. Silakan hapus folder "auth_session" dan jalankan ulang (npm start).');
                process.exit(); // <-- Tambahan biar script otomatis mati kalau ke-logout, jadi kamu bisa gampang hapus foldernya
            }
        } else if (connection === 'open') {
            console.log('✅ Bot berhasil terhubung ke WhatsApp!');
            startPrayerReminder(sock);
        }
    });

    // Merespons pesan masuk
    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return; // Abaikan pesan dari diri sendiri atau sistem

        const remoteJid = msg.key.remoteJid;
        if (remoteJid === 'status@broadcast' || remoteJid.endsWith('@newsletter')) return; // Abaikan status WhatsApp dan Saluran (Channels)

        const senderJid = msg.key.participant || remoteJid; // Participant untuk grup, remoteJid untuk private
        const senderNumber = senderJid.split('@')[0];
        
        // Simpan pushName ke file contacts.json secara manual (jauh lebih ringan dari Baileys Store)
        if (msg.pushName && contacts[senderJid] !== msg.pushName) {
            contacts[senderJid] = msg.pushName;
            fs.writeFileSync(contactsFile, JSON.stringify(contacts, null, 2));
        }

        let db = readDB();
        
        // Mengambil nama pengirim dari contacts lokal, lalu fallback ke DB terdaftar, lalu ke pushName, lalu ke nomor
        const senderName = contacts[senderJid] || ((db.users && db.users[senderJid]) ? db.users[senderJid].name : (msg.pushName || senderNumber));
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || msg.message.videoMessage?.caption || '';

        console.log(`📩 Pesan baru dari ${senderJid}: ${text}`);

        // Identifikasi Kreator / Owner
        const ownerNumber = (process.env.OWNER_NUMBER || '6285742916900').replace(/[^0-9]/g, '');
        const ownerLid = process.env.OWNER_LID || '224051700183291';
        const isRash = senderJid.includes(ownerNumber) || (ownerLid && senderJid.includes(ownerLid));
        const isPrivate = !remoteJid.endsWith('@g.us');

        // Fungsi bantuan untuk membalas pesan secara spesifik (mirip dengan m.reply di plugins)
        const reply = async (teks) => {
            await sock.sendMessage(remoteJid, { text: teks }, { quoted: msg });
        };

        // --- KHUSUS RASH: NGOBROL PRIBADI TANPA PREFIX ---
        if (isRash && isPrivate && !text.startsWith('.') && text.trim()) {
            console.log(`💬 Rash ngajak ngobrol: ${text}`);
            const ctxRash = { sock, remoteJid, msg, reply, args: text.trim().split(/ +/), prefix: '', command: 'nio', isExpressive: true, isRash, senderName, senderJid };
            await nio_core(ctxRash);
            return; // Hentikan agar tidak lanjut ke pengecekan command biasa
        }

        // --- MODE NGOBROL (CHAT MODE) ---
        if (isChatMode(remoteJid) && !text.startsWith('.') && text.trim()) {
            console.log(`💬 Mode Ngobrol (${senderName}): ${text}`);
            resetChatTimer(sock, remoteJid);
            const ctxChat = { sock, remoteJid, msg, reply, args: text.trim().split(/ +/), prefix: '', command: 'nio', isExpressive: true, isRash, senderName, senderJid };
            await nio_core(ctxChat);
            return;
        }

        // Sistem Prefix & Deteksi Command
        const prefix = '.'; // Tanda awalan command (bisa diganti jadi !, #, atau /)
        const isCmd = text.startsWith(prefix);
        const firstWord = text.trim().split(/ +/)[0] || '';
        const command = isCmd ? firstWord.slice(prefix.length).toLowerCase() : firstWord.toLowerCase();
        const args = text.trim().split(/ +/).slice(1); // Memisahkan argumen (contoh: .ytmp3 link)

        // Bundle context untuk dikirim ke function module
        const ctx = { sock, remoteJid, msg, reply, args, prefix, command, isRash, senderName, senderJid, contacts };

        // Router Command (Pusat Fitur Bot)
        if (isCmd || command === 'ping') {
            // --- FITUR LAPORAN KE RASH ---
            if (!isRash) {
                // Cek apakah user ini belum pernah berinteraksi sebelumnya
                if (!interactedUsers.has(senderJid)) {
                    interactedUsers.add(senderJid); // Catat nomornya di "Buku Tamu" Nio
                    
                    // Simpan ke database persisten agar tidak kereset saat bot direstart
                    if (!db.interactedUsers) db.interactedUsers = [];
                    if (!db.interactedUsers.includes(senderJid)) {
                        db.interactedUsers.push(senderJid);
                        writeDB(db);
                    }

                    const reportText = `*Rash!* 🥺\nAda temen baru yang main sama Nio nih!\n\n👤 *Dari:* ${senderName} (${senderNumber})\n📍 *Lokasi:* ${isPrivate ? 'Chat Pribadi' : 'Grup'}\n💬 *Pesan Pertama:* ${text}\n\n*Nio udah layanin kok Rash! Puji Nio dong!* 🥰`;
                    try {
                        await sock.sendMessage(RASH_JID, { text: reportText });
                    } catch (e) {
                        console.log("Gagal mengirim laporan ke Rash:", e.message);
                    }
                }
            }

            console.log(`⚙️ Menjalankan command: ${command}`);
            const cmdFn = getCommand(command);
            if (cmdFn) {
                await cmdFn(ctx);
            } else {
                    if (isCmd) {
                        const availableCommands = Array.from(commands.keys());
                        let bestMatch = '';
                        let minDistance = Infinity;

                        for (const cmd of availableCommands) {
                            const dist = getLevenshteinDistance(command, cmd);
                            if (dist < minDistance) {
                                minDistance = dist;
                                bestMatch = cmd;
                            }
                        }

                        // Batas toleransi typo: maksimal selisih 2 huruf
                        if (minDistance > 0 && minDistance <= 2) {
                            await reply(`❌ Perintah *${prefix}${command}* tidak ditemukan.\n\n🤔 Mungkin maksud kamu: *${prefix}${bestMatch}* ?`);
                        }
                    }
            }
        }
    });
}

connectToWhatsApp();
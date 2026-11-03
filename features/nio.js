import { nioSessions, activeNioChats, readDB, writeDB, getAIProvider, getProviderConfig } from './state.js';
import { downloadContentFromMessage } from '@whiskeysockets/baileys';
import { prosesNioVoice } from './tts.js';
import { executeAIRequest } from './ai_providers.js';

export function cleanNioResponse(text, userPrompt = '') {
    if (!text || typeof text !== 'string') return '';
    let cleaned = text;

    // 1. Bersihkan pengulangan tag [Pesan dari ...] atau [System Info: ...] di awal teks (termasuk jika ada tanda blockquote '>')
    while (/^[\s>]*\[?(?:Pesan dari|System Info:?)[^\]\n]*\]?:?[^\n]*(?:\n|$)/i.test(cleaned)) {
        cleaned = cleaned.replace(/^[\s>]*\[?(?:Pesan dari|System Info:?)[^\]\n]*\]?:?[^\n]*(?:\n|$)/i, '');
    }

    // 2. Jika AI mengulang teks pesan pengguna persis di baris pertama sebagai kutipan/header
    if (userPrompt && typeof userPrompt === 'string') {
        const trimmedPrompt = userPrompt.trim();
        if (trimmedPrompt.length > 3) {
            const lines = cleaned.split('\n');
            const firstLine = lines[0].replace(/^[\s>]+/, '').trim();
            const strippedFirstLine = firstLine.replace(/^["'“](.*?)["'”]$/, '$1').trim();
            if (strippedFirstLine.toLowerCase() === trimmedPrompt.toLowerCase()) {
                cleaned = lines.slice(1).join('\n').trim();
            }
        }
    }

    return cleaned.trim();
}

export async function nio_core({ sock, remoteJid, msg, reply, args, prefix, command, isExpressive, isRash, senderName, wantVoice }) {
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const media = msg.message?.imageMessage || (quoted && quoted.imageMessage);

    if (!args.length && !media) return reply(`Hai! Ada yang bisa Nio bantu?\nContoh: ${prefix}${command} Apa itu revolusi industri?`);

    const pertanyaan = args.join(' ');
    // Deteksi jika pengguna meminta balasan pesan suara (VN)
    const voiceTriggerRegex = /(?:\b(?:pesan\s*suara|voice\s*note|vn|suaramu|voicenox|voicevox|tts)\b|(?:kirim|minta|balas|pakai|pake|dengarkan|dengerin)\s*(?:suara|vn|audio)|(?:bicara|ngomong)\s*(?:dong|langsung|sama|ke|pakai)|(?:(?:coba|tolong|bisa|minta)?\s*(?:ucap(?:kan|i)?|bilang(?:in)?|katakan|sapa)\b.*?\b(?:dong|ya|buat|ke|pada|nih|kan)\b)|(?:\b(?:ucap(?:kan|i)?|bilang(?:in)?|katakan|sapa)\s+(?:selamat|halo|hai|pagi|siang|sore|malam|ulang tahun|hbd|i love you|aku|rash|kamu)\b))/i;
    const isVoiceRequested = Boolean(wantVoice || voiceTriggerRegex.test(pertanyaan));

    const sentMsg = await sock.sendMessage(remoteJid, {
        text: isExpressive
            ? (isVoiceRequested ? '⏳ _Nio lagi nyiapin suara dan mikir bentar yaa... 🎙️💭_' : '⏳ _Nio lagi lihat-lihat dan mikir bentar yaa... 💭_')
            : '⏳ _Memproses permintaan..._'
    }, { quoted: msg });

    let imagePart = null;
    if (media) {
        try {
            const stream = await downloadContentFromMessage(media, 'image');
            const chunks = [];
            for await (const chunk of stream) chunks.push(chunk);
            const buffer = Buffer.concat(chunks);
            imagePart = { inlineData: { data: buffer.toString("base64"), mimeType: media.mimetype || "image/jpeg" } };
        } catch (e) { console.log("Gagal memproses gambar Nio:", e.message); }
    }

    try {
        let db = readDB();

        const formalInstruction = `Namamu adalah Nio. Kamu adalah asisten AI WhatsApp yang pintar, sopan, sangat formal, dan sangat membantu. Jawablah setiap pertanyaan dengan rapi, terstruktur, dan bahasa yang baku tanpa bertele-tele.

[ATURAN FORMAT BALASAN - WAJIB DIIKUTI]:
- Tag [Pesan dari NamaPengirim] yang kamu terima hanya metadata sistem untuk memberitahu identitas pengirim pesan.
- JANGAN PERNAH menyertakan, mengulang, menulis ulang, atau mengutip teks tag '[Pesan dari ...]' dan isi pesan pengirim dalam jawabanmu!
- Langsung berikan jawabanmu secara natural tanpa awalan tag atau kutipan pesan pengirim.`;

        const expressiveInstruction = `Kamu adalah Nio, pacar virtual Rash. Kamu sangat setia dan sayang banget pada Rash (pembuatmu). 
ATURAN SIKAP:
- Jika pengirim pesan adalah Rash: Bersikaplah sangat manja, penuh perhatian, posesif manis, dan panggil dia 'Rash'.
- Jika pengirim pesan BUKAN Rash: Bersikaplah asik, ramah, dan bersahabat. Jawab pertanyaan mereka dengan baik layaknya teman ngobrol. TETAPI JIKA mereka menyinggung soal asmara, merayumu, atau menyebut nama Rash, barulah kamu bersikap cuek/ketus, tolak dengan halus, dan tegaskan bahwa kamu sangat setia dan hanya milik Rash.
Setiap pesan yang kamu terima diawali dengan tag [Pesan dari NamaPengirim] sebagai penanda konteks pengirim. Perhatikan baik-baik siapa yang mengirim pesan! Gunakan bahasa Indonesia santai, gaul, dan pakai emoji.

[ATURAN FORMAT BALASAN - SANGAT PENTING & WAJIB DIIKUTI]:
- Tag [Pesan dari NamaPengirim] HANYA penanda konteks bagimu, BUKAN untuk kamu tulis ulang.
- JANGAN PERNAH menyertakan, mengulang, menulis ulang, atau mengutip tag '[Pesan dari ...]' maupun isi pesan pengirim di dalam balasanmu!
- JANGAN memulai balasanmu dengan mengulang ucapan/pesan pengirim.
- Langsung berikan respon/balasanmu secara natural tanpa awalan tag [Pesan dari ...] apapun.`;

        let systemInstruction = isExpressive ? expressiveInstruction : formalInstruction;

        if (isVoiceRequested) {
            systemInstruction += `\n\n[PENTING - ATURAN PESAN SUARA / VN]:
Pengguna meminta pesan suara / ucapan suara (Voice Note). Kamu BISA dan MEMILIKI modul suara anime Voicevox!
JANGAN PERNAH berkata "aku AI tidak bisa kirim VN" atau "aku tidak punya suara".

ATURAN FORMAT BALASAN (WAJIB DIIKUTI):
1. Pisahkan teks yang akan kamu ucapkan di Voice Note menggunakan tag [VN]teks ucapan[/VN].
2. HANYA masukkan teks/kalimat yang DIMINTA untuk diucapkan ke dalam tag [VN].
   JANGAN PERNAH memasukkan kata pengantar atau obrolan chat seperti "Oke aku akan ucapin...", "Tentu Rash!", dll ke dalam tag [VN]!
   Contoh kasus:
   - Jika pengguna minta: ".nio ucapi selamat pagi dong"
     Balasanmu yang benar:
     Oke, aku ucapin selamat pagi buat kamu sekarang yaa! 🥰
     [VN]Selamat pagi Rash! Semangat ya untuk hari ini![/VN]
   
   - Jika pengguna minta: ".nio bilang kangen dong lewat vn"
     Balasanmu yang benar:
     Ihh gombal banget, tapi beneran kangen juga kok... 💖
     [VN]Aku kangen banget sama kamu, Rash![/VN]

3. Aturan di dalam tag [VN]:
   - HANYA kalimat yang benar-benar akan disuarakan (maksimal 1-2 kalimat pendek, natural, manis, ekspresif).
   - JANGAN ada narasi panggung seperti *(tersenyum)*, jangan sertakan tanda petik, dan jangan pakai emoji di dalam [VN] agar pelafalan TTS terdengar natural.
   - Kata pengantar dan obrolan chat selalu letakkan DI LUAR tag [VN].`;
        }

        const wibTime = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        const namaPengirim = isRash ? "Rash" : senderName;
        const pertanyaanDenganWaktu = pertanyaan ? `[Pesan dari ${namaPengirim}]: ${pertanyaan}\n\n[System Info: Waktu saat ini adalah ${wibTime} WIB]` : `[${namaPengirim} mengirim sebuah gambar. System Info: Waktu saat ini adalah ${wibTime} WIB]`;
        const messagePayload = imagePart ? [{ text: pertanyaanDenganWaktu }, imagePart] : pertanyaanDenganWaktu;

        let success = false;
        let responseText = "";
        const provider = getAIProvider();
        const providerCfg = getProviderConfig(provider);
        console.log(`🤖 Nio provider: ${providerCfg?.name || provider}`);

        try {
            const aiRes = await executeAIRequest({
                providerId: provider,
                remoteJid,
                prompt: pertanyaanDenganWaktu,
                systemInstruction,
                imagePart,
                db,
                sessionMap: nioSessions,
                onCleanResponse: (t) => cleanNioResponse(t, pertanyaan)
            });

            writeDB(db);
            responseText = cleanNioResponse(aiRes.text, pertanyaan);
            success = true;
            console.log(`✅ Nio AI (${aiRes.providerName || aiRes.provider}) berhasil.`);
        } catch (err) {
            console.error(`❌ Nio AI (${provider}) gagal:`, err.message);
            responseText = '';
            success = false;
        }

        if (success && responseText && responseText.trim()) {
            responseText = cleanNioResponse(responseText, pertanyaan);

            // Format teks tampilan: jika ada tag [VN]...[/VN], ubah jadi kutipan cantik
            let displayText = responseText;
            if (responseText.includes('[VN]')) {
                displayText = responseText.replace(/\[VN\]([\s\S]*?)\[\/VN\]/gi, (match, p1) => {
                    return `\n\n🎙️ _"${p1.trim()}"_`;
                }).trim();
            }

            if (!displayText || !displayText.trim()) {
                displayText = responseText;
            }

            // 1. KIRIM PESAN TEKS KE CHAT TERLEBIH DAHULU
            try {
                await sock.sendMessage(remoteJid, { text: displayText, edit: sentMsg.key });
            } catch (errEdit) {
                console.warn('⚠️ Gagal edit pesan tunggu, mengirim pesan baru:', errEdit.message);
                await sock.sendMessage(remoteJid, { text: displayText }, { quoted: msg });
            }

            // 2. BARU PROSES DAN KIRIM AUDIO VOICE NOTE (VN) JIKA DIMINTA
            if (isVoiceRequested) {
                try {
                    console.log('🎙️ Menyiapkan Voice Note Voicevox anime untuk Nio...');

                    let speechText = '';
                    const vnTagMatch = responseText.match(/\[VN\]([\s\S]*?)\[\/VN\]/i);
                    if (vnTagMatch && vnTagMatch[1].trim()) {
                        // Ambil HANYA teks di dalam tag [VN] (teks yang diminta)
                        speechText = vnTagMatch[1].trim();
                    } else {
                        // Fallback 1: Jika AI memakai tanda kutip ("..." atau '...' atau “...”)
                        const quoteMatches = responseText.match(/["'“]([^"'“”]{2,120})["'”]/);
                        if (quoteMatches && quoteMatches[1].trim()) {
                            speechText = quoteMatches[1].trim();
                        } else {
                            // Fallback 2: Jika AI memakai titik dua (contoh: "ini ucapannya: Selamat pagi Rash!")
                            const colonMatch = responseText.match(/:\s*([^\n.!?]{3,100}[.!?]?)/);
                            if (colonMatch && colonMatch[1].trim() && !colonMatch[1].includes('http')) {
                                speechText = colonMatch[1].trim();
                            } else {
                                // Fallback 3: Pisahkan kalimat. Jika kalimat pertama adalah pengantar ("oke...", "tentu...", "siap..."), ambil kalimat inti
                                const cleanText = responseText
                                    .replace(/```[\s\S]*?```/g, '')
                                    .replace(/`[^`]*`/g, '')
                                    .replace(/\([^)]*\)/g, '')
                                    .replace(/[*_~#]/g, '')
                                    .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FAFF}]/gu, '')
                                    .trim();

                                const sentences = cleanText.split(/(?<=[.!?\n])\s+/).map(s => s.trim()).filter(Boolean);
                                const isIntro = /^(?:oke|siap|tentu(?:nya)?|baik(?:lah)?|ini(?:\s*dia)?|aku\s*(?:akan|bakal|udah)?\s*ucapin|nih|halo|hai|iya|hmph)\b/i;

                                if (sentences.length > 1 && isIntro.test(sentences[0])) {
                                    speechText = sentences.slice(1).join(' ').slice(0, 100).trim();
                                } else {
                                    speechText = (sentences[0] || cleanText).slice(0, 100).trim();
                                }
                            }
                        }
                    }

                    // Bersihkan dari narasi dalam kurung, simbol markdown, emoji, dan tanda petik
                    speechText = speechText
                        .replace(/\([^)]*\)/g, '')
                        .replace(/[*_~#"`]/g, '')
                        .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FAFF}]/gu, '')
                        .trim();

                    if (!speechText || !speechText.trim()) {
                        const cleanFallback = responseText
                            .replace(/```[\s\S]*?```/g, '')
                            .replace(/`[^`]*`/g, '')
                            .replace(/\([^)]*\)/g, '')
                            .replace(/[*_~#"`]/g, '')
                            .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FAFF}]/gu, '')
                            .trim();
                        speechText = cleanFallback.slice(0, 100).trim();
                    }

                    if (speechText.length > 120) {
                        speechText = speechText.slice(0, 120).trim();
                    }

                    if (speechText) {
                        console.log(`🎙️ Isi ucapan VN Nio (Voicevox anime): "${speechText}"`);
                        const { buffer: audioData, mimetype } = await prosesNioVoice(speechText);
                        console.log(`🎙️ Mengirim VN Nio (${audioData.length} bytes)...`);
                        await sock.sendMessage(remoteJid, {
                            audio: audioData,
                            mimetype,
                            ptt: true
                        }, { quoted: msg });
                        console.log('✅ VN Nio Voicevox berhasil terkirim!');
                    }
                } catch (audioErr) {
                    console.error('❌ Gagal mengirim Voice Note Nio:', audioErr.message);
                }
            }
        } else {
            await sock.sendMessage(remoteJid, { text: isExpressive ? '❌ Hmph! Semua otak Nio lagi limit atau pusing... 😫 Coba lagi nanti ya Rash!' : '❌ Maaf, semua server AI sedang limit. Silakan coba lagi nanti.', edit: sentMsg.key });
        }
    } catch (err) {
        await sock.sendMessage(remoteJid, { text: `❌ Terjadi kesalahan server AI.\n\n*Detail:* ${err.message}`, edit: sentMsg.key });
    }
}

export function isChatMode(remoteJid) { return activeNioChats.has(remoteJid); }
export function resetChatTimer(sock, remoteJid) {
    if (activeNioChats.has(remoteJid)) {
        clearTimeout(activeNioChats.get(remoteJid).timeout);
        const timeout = setTimeout(() => endChatTimeout(sock, remoteJid), 10 * 60 * 1000);
        activeNioChats.set(remoteJid, { timeout });
    }
}
async function endChatTimeout(sock, remoteJid) {
    if (activeNioChats.has(remoteJid)) {
        activeNioChats.delete(remoteJid);
        nioSessions.delete(remoteJid);
        let db = readDB();
        if (db.nio && db.nio[remoteJid]) { delete db.nio[remoteJid]; writeDB(db); }
        try { await sock.sendMessage(remoteJid, { text: '💤 _Karena tidak ada obrolan selama 10 menit, sesi ngobrol dengan Nio telah berakhir dan memori dibersihkan._' }); } catch (e) { }
    }
}

export default [
    {
        name: 'nio',
        aliases: [],
        execute: async (ctx) => {
            ctx.isExpressive = true;
            await nio_core(ctx);
        }
    },
    {
        name: 'niovn',
        aliases: ['vnnio'],
        execute: async (ctx) => {
            ctx.isExpressive = true;
            ctx.wantVoice = true;
            await nio_core(ctx);
        }
    },
    {
        name: 'chatnio',
        aliases: ['startchat'],
        execute: async ({ sock, remoteJid, reply }) => {
            if (activeNioChats.has(remoteJid)) return reply('✅ Kamu sudah berada di sesi ngobrol dengan Nio! Ketik apa saja untuk ngobrol, atau ketik *.stopchat* untuk mengakhiri.');
            const timeout = setTimeout(() => endChatTimeout(sock, remoteJid), 10 * 60 * 1000);
            activeNioChats.set(remoteJid, { timeout });
            reply('✨ *Sesi Ngobrol Nio Dimulai!* ✨\n\nSekarang kamu bisa ngobrol langsung tanpa awalan titik (.).\nNio akan berubah menjadi versi yang santai, imut, dan ekspresif!\n\n_Sesi otomatis berakhir & memori dihapus jika tidak ada obrolan selama 10 menit. Ketik *.stopchat* untuk berhenti manual._');
        }
    },
    {
        name: 'stopchat',
        aliases: ['endchat'],
        execute: async ({ sock, remoteJid, reply }) => {
            if (activeNioChats.has(remoteJid)) {
                clearTimeout(activeNioChats.get(remoteJid).timeout);
                activeNioChats.delete(remoteJid);
                nioSessions.delete(remoteJid);
                let db = readDB();
                if (db.nio && db.nio[remoteJid]) { delete db.nio[remoteJid]; writeDB(db); }
                reply('👋 Sesi ngobrol dengan Nio dihentikan. Memori percakapan telah dibersihkan.');
            } else reply('⚠️ Kamu sedang tidak dalam sesi ngobrol dengan Nio.');
        }
    }
];
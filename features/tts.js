import { exec } from 'child_process';
import fs from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { MsEdgeTTS, OUTPUT_FORMAT, ProsodyOptions } from 'msedge-tts';

const maxChunkLength = 180;

export const ANIME_SPEAKERS = {
    'zundamon': 3,
    'zunda': 3,
    'amama': 1,
    'metan': 2,
    'tsumugi': 8,
    'ritsu': 9,
    'hau': 10,
    'himari': 14
};

// ── DAFTAR SUARA INDONESIA (Microsoft Edge Neural TTS) ───────────────────────
// id-ID-GadisNeural → Cewek muda, natural — dipakai untuk mode standar
// Mode ANIME menggunakan GadisNeural + ProsodyOptions (pitch naik, lebih cepat)
// sehingga terdengar lebih imut dan ekspresif tanpa distorsi robotik FFMPEG.
//
// Alternatif open-source yang bisa dicoba (butuh self-host / API):
//   • Kokoro TTS  — MIT, multilingual, sangat ekspresif (huggingface.co/hexgrad/Kokoro-82M)
//   • Fish Speech  — CC-BY-NC, multilingual incl. ID  (fish.audio / github.com/fishaudio)
//   • StyleTTS2   — MIT, intonasi paling natural       (github.com/yl4579/StyleTTS2)
//   Ketiga model di atas butuh GPU/hosting sendiri; Edge TTS adalah solusi gratis terbaik
//   tanpa setup tambahan.
export const EDGE_VOICE_ID = 'id-ID-GadisNeural'; // standar: natural, fasih ID
export const EDGE_VOICE_ALT = 'id-ID-ArdiNeural';  // fallback cowok

function splitText(text) {
    const words = text.split(/\s+/);
    const chunks = [];
    let chunk = '';
    for (const word of words) {
        if ((chunk + ' ' + word).trim().length > maxChunkLength && chunk) {
            chunks.push(chunk);
            chunk = word;
        } else {
            chunk = `${chunk} ${word}`.trim();
        }
    }
    if (chunk) chunks.push(chunk);
    return chunks;
}

// ── HELPER STREAM EDGE TTS → Buffer ──────────────────────────────────────────
async function streamEdge(voice, text, prosody) {
    const tts = new MsEdgeTTS();
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    return new Promise((resolve, reject) => {
        const { audioStream } = tts.toStream(text, prosody ?? undefined);
        const parts = [];
        audioStream.on('data', d => parts.push(d));
        audioStream.on('end', () => resolve(Buffer.concat(parts)));
        audioStream.on('error', reject);
    });
}

// ── EDGE TTS: Mode STANDAR (natural, untuk !tts) ──────────────────────────────
// Tidak ada pitch-shift — terdengar natural seperti news anchor wanita Indonesia.
export async function prosesEdgeTTS(text, voice = EDGE_VOICE_ID) {
    const chunks = splitText(text);
    const parts = [];
    for (const chunk of chunks) parts.push(await streamEdge(voice, chunk, null));
    return Buffer.concat(parts);
}

// ── EDGE TTS: Mode ANIME/IMUT (untuk !ttsanime & VN Nio) ─────────────────────
// ProsodyOptions: pitch +18% (suara lebih tinggi = imut), rate +8% (lebih giat/energik).
// Jauh lebih baik dari FFMPEG asetrate karena:
//   1. Tidak ada artefak robotik — pitch dinaikkan oleh Microsoft Neural TTS langsung.
//   2. Intonasi kalimat tetap alami (naik-turun) — bukan flat seperti pitch-shift naif.
//   3. Kecepatan bicara sedikit lebih cepat → kesan anime girl yang semangat.
export async function prosesEdgeTTSAnime(text, voice = EDGE_VOICE_ID) {
    const prosody = new ProsodyOptions();
    prosody.pitch = '+20%';   // Pitch dasar dinaikkan
    prosody.rate = '+0%';    // Kecepatan normal (diatur oleh asetrate nanti)
    prosody.volume = '+0%';    // Volume normal agar suaranya lebih soft (khas Sagiri)

    const chunks = splitText(text);
    const parts = [];
    for (const chunk of chunks) parts.push(await streamEdge(voice, chunk, prosody));
    return Buffer.concat(parts);
}

// ── GOOGLE TRANSLATE TTS (Fallback terakhir) ──────────────────────────────────
export async function prosesTTS(text, lang = 'id') {
    const chunks = splitText(text);
    const parts = [];
    for (const chunk of chunks) {
        const url = new URL('https://translate.google.com/translate_tts');
        url.searchParams.set('ie', 'UTF-8');
        url.searchParams.set('tl', lang);
        url.searchParams.set('client', 'tw-ob');
        url.searchParams.set('q', chunk);
        const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (!res.ok) throw new Error(`Google TTS HTTP ${res.status}`);
        parts.push(Buffer.from(await res.arrayBuffer()));
    }
    return Buffer.concat(parts);
}

// ── FFMPEG: Konversi MP3 → Opus WhatsApp PTT ─────────────────────────────────
// isAnimeVoice digunakan untuk menambahkan efek vibrato Vocaloid agar intonasi naik/turun
export async function convertToOpus(inputBuffer, isAnimeVoice = false) {
    const id = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const tempIn = join(tmpdir(), `tts_in_${id}.mp3`);
    const tempOut = join(tmpdir(), `tts_out_${id}.ogg`);

    // Filter Loli/Sagiri: asetrate memudakan suara (formant shift), atempo menormalkan speed, vibrato untuk intonasi
    const filter = isAnimeVoice ? '-af "asetrate=24000*1.22,aresample=24000,atempo=0.8,vibrato=f=4.0:d=0.3"' : '';

    try {
        await fs.writeFile(tempIn, inputBuffer);
        await new Promise((resolve, reject) => {
            exec(`ffmpeg -y -i "${tempIn}" ${filter} -c:a libopus -b:a 48k -ac 1 -vn "${tempOut}"`, err =>
                err ? reject(err) : resolve()
            );
        });
        const opusBuffer = await fs.readFile(tempOut);
        return { buffer: opusBuffer, mimetype: 'audio/ogg; codecs=opus' };
    } catch (e) {
        console.log('⚠️ FFMPEG Opus gagal, fallback MP4:', e.message);
        return { buffer: inputBuffer, mimetype: 'audio/mp4' };
    } finally {
        await fs.unlink(tempIn).catch(() => { });
        await fs.unlink(tempOut).catch(() => { });
    }
}

// ── prosesAnimeVoice: sekarang pakai Edge TTS Anime mode ─────────────────────
// Dipanggil dari nio.js dan sebagai fallback ttsanime.
// Jika Edge TTS gagal → fallback Google TTS tanpa pitch shift (masih lebih baik).
export async function prosesAnimeVoice(text) {
    try {
        const mp3 = await prosesEdgeTTSAnime(text, EDGE_VOICE_ID);
        return convertToOpus(mp3, true); // Aktifkan filter Vocaloid vibrato
    } catch (e) {
        console.warn('⚠️ Edge TTS Anime gagal, fallback Google TTS:', e.message);
        const mp3 = await prosesTTS(text, 'id');
        return convertToOpus(mp3, true);
    }
}

// ── PROSES SUARA ANIME / VOICEVOX UNTUK NIO ──────────────────────────────────
// Prioritas utama: Voicevox Anime Voice (default: Shikoku Metan - waifu imut alami)
// Fallback otomatis: Edge TTS Anime / Google TTS
export async function prosesNioVoice(text, speaker = 'metan') {
    const cleaned = text
        .replace(/\([^)]*\)/g, '')
        .replace(/[*_~#"`]/g, '')
        .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FAFF}]/gu, '')
        .trim();

    const textToSpeak = cleaned.slice(0, 150).trim();
    if (!textToSpeak || !/[a-zA-Z0-9\u3040-\u30ff\u4e00-\u9faf]/.test(textToSpeak)) {
        throw new Error('Teks untuk suara anime kosong atau tidak valid.');
    }

    // 1. Coba Voicevox Cloud (Karakter Anime Manusia / Waifu)
    try {
        console.log(`🎌 [Nio VN] Memproses suara Voicevox (${speaker}): "${textToSpeak}"`);
        const rawMp3 = await prosesAnimeTTS(textToSpeak, speaker);
        const res = await convertToOpus(rawMp3, false);
        console.log('✅ [Nio VN] Suara Voicevox anime berhasil dibuat!');
        return res;
    } catch (e) {
        console.warn('⚠️ [Nio VN] Voicevox gagal, beralih ke fallback anime voice:', e.message);
    }

    // 2. Fallback: Edge TTS Anime / Google TTS
    console.log('🌸 [Nio VN] Fallback ke Edge/Google TTS Anime...');
    return await prosesAnimeVoice(textToSpeak);
}


// ── VOICEVOX ANIME TTS CLOUD (karakter JP spesifik) ──────────────────────────
export async function prosesAnimeTTS(text, speaker = 3) {
    const trimmedText = text.trim().slice(0, 150);
    const speakerId = typeof speaker === 'string' && ANIME_SPEAKERS[speaker.toLowerCase()]
        ? ANIME_SPEAKERS[speaker.toLowerCase()]
        : (typeof speaker === 'number' ? speaker : 3);

    const initUrl = `https://api.tts.quest/v3/voicevox/synthesis?text=${encodeURIComponent(trimmedText)}&speaker=${speakerId}`;
    const initRes = await fetch(initUrl);
    if (!initRes.ok) throw new Error(`Server Voicevox HTTP ${initRes.status}`);

    const initData = await initRes.json();
    if (!initData.success || !initData.audioStatusUrl)
        throw new Error(initData.errorMessage || 'Gagal menginisialisasi Voicevox TTS');

    const { audioStatusUrl: statusUrl, mp3DownloadUrl: mp3Url } = initData;
    let isReady = false;

    for (let i = 0; i < 25; i++) {
        await new Promise(r => setTimeout(r, 800));
        try {
            const s = await (await fetch(statusUrl)).json();
            if (s.isAudioReady) { isReady = true; break; }
            if (s.isAudioError) throw new Error('Server Voicevox gagal memproses audio.');
        } catch (e) {
            if (e.message.includes('Voicevox gagal')) throw e;
        }
    }
    if (!isReady) throw new Error('Sintesis audio Voicevox timeout.');

    const audioRes = await fetch(mp3Url);
    if (!audioRes.ok) throw new Error(`Gagal unduh audio Voicevox (HTTP ${audioRes.status})`);
    return Buffer.from(await audioRes.arrayBuffer());
}

// ── HANDLER PERINTAH BOT ──────────────────────────────────────────────────────
export default [
    {
        // !tts → suara standar GadisNeural (natural, tidak pitch-shift)
        name: 'tts',
        aliases: ['gtts'],
        execute: async ({ sock, remoteJid, msg, reply, args, prefix, command }) => {
            const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            const quotedText = quoted?.conversation || quoted?.extendedTextMessage?.text
                || quoted?.imageMessage?.caption || quoted?.videoMessage?.caption;

            let textToSpeak = args.join(' ').trim() || (quotedText ?? '').trim();
            if (!textToSpeak)
                return reply(`Harap masukkan teks atau balas pesan!\n\n*Contoh:* ${prefix}${command} Halo semuanya!`);

            // Validasi: Nio cuma bisa baca huruf abjad (A-Z), angka, dan huruf Jepang.
            // Huruf Rusia (Cyrillic), Arab, dll akan diubah jadi 'baka' agar tidak error FFMPEG.
            if (!/[a-zA-Z0-9\u3040-\u30ff\u4e00-\u9faf]/.test(textToSpeak)) {
                textToSpeak = "baka";
            }

            const sentMsg = await sock.sendMessage(remoteJid, { text: '⏳ _Sedang membuat suara... 🎙️_' }, { quoted: msg });
            try {
                let mp3;
                try {
                    mp3 = await prosesEdgeTTS(textToSpeak, EDGE_VOICE_ID);
                    console.log('🎙️ TTS: Edge GadisNeural ✅');
                } catch (e) {
                    console.warn('⚠️ Edge TTS gagal, fallback Google TTS:', e.message);
                    mp3 = await prosesTTS(textToSpeak, 'id');
                }
                const { buffer, mimetype } = await convertToOpus(mp3, false);
                await sock.sendMessage(remoteJid, { audio: buffer, mimetype, ptt: true }, { quoted: msg });
                try { await sock.sendMessage(remoteJid, { delete: sentMsg.key }); } catch (_) { }
            } catch (err) {
                console.error('TTS error:', err);
                await sock.sendMessage(remoteJid, { text: `❌ Gagal TTS: ${err.message}`, edit: sentMsg.key });
            }
        }
    },
    {
        // !ttsanime → suara imut anime (Edge GadisNeural + prosody SSML)
        // Opsional: pilih karakter Voicevox JP (zundamon, metan, dll.)
        name: 'ttsanime',
        aliases: ['ttsvoice', 'vn', 'suara'],
        execute: async ({ sock, remoteJid, msg, reply, args, prefix, command }) => {
            const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            const quotedText = quoted?.conversation || quoted?.extendedTextMessage?.text
                || quoted?.imageMessage?.caption || quoted?.videoMessage?.caption;

            let speaker = 'metan'; // Default ke Shikoku Metan (mirip Sagiri, suara natural manusia)
            let textToSpeak = '';

            const isSpecificSpeaker = args.length > 0 && ANIME_SPEAKERS[args[0]?.toLowerCase()];
            if (isSpecificSpeaker) {
                speaker = args[0].toLowerCase();
                textToSpeak = args.slice(1).join(' ').trim();
            } else {
                textToSpeak = args.join(' ').trim();
            }
            if (!textToSpeak) textToSpeak = (quotedText ?? '').trim();

            if (!textToSpeak)
                return reply(`✨ *FITUR SUARA ANIME / WAIFU* ✨\n\nKetik teks atau balas pesan!\n\n*Contoh:*\n- ${prefix}${command} Halo Rash, Nio di sini!\n- ${prefix}${command} metan Konnichiwa!\n\n🎭 *Karakter Voicevox (opsional):* zundamon, amama, metan, tsumugi, ritsu, hau, himari`);

            // Validasi: Nio cuma bisa baca huruf abjad (A-Z), angka, dan huruf Jepang.
            if (!/[a-zA-Z0-9\u3040-\u30ff\u4e00-\u9faf]/.test(textToSpeak)) {
                textToSpeak = "baka";
            }

            const sentMsg = await sock.sendMessage(remoteJid, { text: '⏳ _Nio lagi nyiapin suara imutnya... 🌸_' }, { quoted: msg });

            try {
                let audioData, mimetype;

                // Path 1: Voicevox (Natural Human Anime Voice)
                try {
                    const raw = await prosesAnimeTTS(textToSpeak, speaker);
                    const res = await convertToOpus(raw, false);
                    audioData = res.buffer; mimetype = res.mimetype;
                    console.log(`🎌 Voicevox [${speaker}] ✅`);
                } catch (e) {
                    console.warn('Voicevox gagal, fallback Edge Anime:', e.message);
                }

                // Path 2: Edge TTS GadisNeural + prosody + Loli Filter (Jika Voicevox error)
                if (!audioData) {
                    const res = await prosesAnimeVoice(textToSpeak);
                    audioData = res.buffer; mimetype = res.mimetype;
                }

                await sock.sendMessage(remoteJid, { audio: audioData, mimetype, ptt: true }, { quoted: msg });
                try { await sock.sendMessage(remoteJid, { delete: sentMsg.key }); } catch (_) { }
            } catch (err) {
                console.error('TTS Anime error:', err);
                await sock.sendMessage(remoteJid, { text: `❌ Gagal suara anime: ${err.message}`, edit: sentMsg.key });
            }
        }
    }
];
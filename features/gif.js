import dns from 'node:dns';
import sharp from 'sharp';

dns.setDefaultResultOrder('ipv4first');

// Daftar 58 endpoint GIF resmi dari https://nekos.best/api/v2/endpoints
const GIF_CATEGORIES = [
    'angry', 'baka', 'bite', 'bleh', 'blush', 'bonk', 'bored', 'carry', 'clap',
    'confused', 'cry', 'cuddle', 'dance', 'facepalm', 'feed', 'handhold', 'handshake',
    'happy', 'highfive', 'hug', 'kabedon', 'kick', 'kiss', 'laugh', 'lurk', 'nod',
    'nom', 'nope', 'nya', 'pat', 'peck', 'poke', 'pout', 'punch', 'run', 'salute',
    'shake', 'shoot', 'shrug', 'sip', 'slap', 'sleep', 'smile', 'smug', 'spin',
    'stare', 'tableflip', 'teehee', 'think', 'thumbsup', 'tickle', 'wag', 'wave',
    'wink', 'yawn', 'yeet', 'blowkiss', 'lappillow'
];

// Mapping alias bahasa Indonesia & sinonim
const CATEGORY_ALIASES = {
    peluk: 'hug',
    cium: 'kiss',
    elus: 'pat',
    tampar: 'slap',
    joget: 'dance',
    nangis: 'cry',
    pukul: 'punch',
    tinju: 'punch',
    tendang: 'kick',
    gigit: 'bite',
    colek: 'poke',
    cubit: 'poke',
    tos: 'highfive',
    salaman: 'handshake',
    gandeng: 'handhold',
    suapin: 'feed',
    makan: 'nom',
    minum: 'sip',
    tidur: 'sleep',
    ngantuk: 'yawn',
    kaget: 'shocked',
    shock: 'shocked',
    marah: 'angry',
    senyum: 'smile',
    ketawa: 'laugh',
    lucu: 'laugh',
    dadah: 'wave',
    kedip: 'wink',
    kabur: 'run',
    lari: 'run',
    mikir: 'think',
    gelitik: 'tickle',
    banting: 'tableflip',
    tembak: 'shoot',
    melet: 'bleh',
    ciuman: 'blowkiss',
    pangkuan: 'lappillow',
    bangga: 'smug',
    malu: 'blush',
    bosan: 'bored',
    bingung: 'confused',
    tepuktangan: 'clap',
    hormat: 'salute',
    putar: 'spin',
    ngintip: 'lurk',
    buang: 'yeet'
};

// Teks interaksi khusus jika user mention / balas pesan teman
const ACTION_DESCRIPTIONS = {
    hug: (s, t) => `🤗 *${s}* memeluk erat *${t}*! Uwwu~ 💕`,
    kiss: (s, t) => `💋 *${s}* mencium manis *${t}*! Muachh~ 💖`,
    pat: (s, t) => `🥰 *${s}* mengelus lembut kepala *${t}*! Pintar yaa~ ✨`,
    slap: (s, t) => `💢 *${s}* menampar *${t}*! *PLAKK!* Rasakan itu! 😤`,
    bonk: (s, t) => `🔨 *${s}* memukul kepala *${t}*! *BONK!* Jangan nakal ya! 💥`,
    cuddle: (s, t) => `💕 *${s}* bermanja-manja dan berpelukan dengan *${t}*~ 🌸`,
    bite: (s, t) => `🐱 *${s}* menggigit *${t}*! *Aww!* Nyam~ 🐾`,
    kick: (s, t) => `💥 *${s}* menendang *${t}*! *DUAKK!* Melayang deh~ 🚀`,
    punch: (s, t) => `🥊 *${s}* meninju *${t}*! *BUKK!* Sakit gak tuh? 😵`,
    poke: (s, t) => `👉 *${s}* mencolek-colek *${t}*! Heeeyyy~ 👀`,
    feed: (s, t) => `🍰 *${s}* menyuapi makanan ke *${t}*! Aaaa~ Nyam! 😋`,
    tickle: (s, t) => `😆 *${s}* menggelitik *${t}*! Jangan ketawa terus dong! 🤣`,
    highfive: (s, t) => `✋ *${s}* melakukan toss dengan *${t}*! Mantap! 🔥`,
    handshake: (s, t) => `🤝 *${s}* bersalaman akrab dengan *${t}*! Senang bertemu denganmu~`,
    handhold: (s, t) => `🌸 *${s}* menggandeng tangan *${t}* dengan erat~ 😳✨`,
    blowkiss: (s, t) => `💖 *${s}* meniupkan ciuman cinta untuk *${t}*! Tangkap yaa~ 😘`,
    kabedon: (s, t) => `😳 *${s}* memojokkan *${t}* ke dinding (Kabedon)! Jantung berdebar~ 💓`,
    yeet: (s, t) => `🚀 *${s}* melempar jauh *${t}* ke luar angkasa! *WUUUSSHHH!* ✨`,
    shoot: (s, t) => `🔫 *${s}* menembak *${t}*! *DOR DOR!* Kena tepat di hati! 💘`,
    lappillow: (s, t) => `😴 *${s}* merebahkan kepalanya di pangkuan hangat *${t}*~ Nyaman sekali.. 💤`,
    bleh: (s, t) => `😜 *${s}* meledek *${t}*! Bleehh~ 😝`,
    baka: (s, t) => `😤 *${s}* memarahi *${t}*! Dasar Bakaaa! 💢`,
    dance: (s, t) => `💃 *${s}* mengajak *${t}* berdansa bersama dengan riang gembira! 🎶`,
    smug: (s, t) => `😏 *${s}* tersenyum sombong ke arah *${t}*! Hehe, kalah kan? 💫`,
    blush: (s, t) => `😳 Wajah *${s}* memerah tersipu malu saat melihat *${t}*~ ✨`
};

/**
 * Menyisipkan metadata EXIF ke buffer WebP animasi agar dikenali sebagai stiker WhatsApp.
 */
function addExifToWebp(webpBuffer, packname = 'Stiker Animasi Nio', author = 'Nio') {
    const json = {
        'sticker-pack-id': 'nio-bot-nekos-best',
        'sticker-pack-name': packname,
        'sticker-pack-publisher': author,
        'emojis': ['✨', '🎬', '🌸']
    };
    const exifAttr = Buffer.from([0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00]);
    const jsonBuf = Buffer.from(JSON.stringify(json), 'utf-8');
    const exif = Buffer.concat([exifAttr, jsonBuf]);
    exif.writeUIntLE(jsonBuf.length, 14, 4);

    let chunks = [];
    let pos = 0;
    chunks.push(webpBuffer.subarray(0, 12));
    pos += 12;

    while (pos < webpBuffer.length) {
        const chunkId = webpBuffer.subarray(pos, pos + 4).toString('ascii');
        const chunkSize = webpBuffer.readUInt32LE(pos + 4);
        const fullChunkSize = 8 + chunkSize + (chunkSize % 2);

        if (chunkId === 'VP8X') {
            const vp8x = Buffer.alloc(fullChunkSize);
            webpBuffer.copy(vp8x, 0, pos, pos + fullChunkSize);
            vp8x[8] |= 0x08; // Set EXIF flag
            chunks.push(vp8x);
            const exifChunkHeader = Buffer.alloc(8);
            exifChunkHeader.write('EXIF', 0);
            exifChunkHeader.writeUInt32LE(exif.length, 4);
            chunks.push(exifChunkHeader);
            chunks.push(exif);
            if (exif.length % 2 !== 0) chunks.push(Buffer.from([0]));
        } else if (chunkId !== 'EXIF') {
            chunks.push(webpBuffer.subarray(pos, pos + fullChunkSize));
        }
        pos += fullChunkSize;
    }
    const finalBuffer = Buffer.concat(chunks);
    finalBuffer.writeUInt32LE(finalBuffer.length - 8, 4);
    return finalBuffer;
}

/**
 * Menampilkan pesan menu lengkap stiker animasi GIF dari nekos.best
 */
async function sendGifMenu(sock, remoteJid, msg, prefix) {
    const text = `✨ *MENU STIKER ANIMASI GIF* ✨
_(Powered by Nekos.best API v2)_

Hai! Nio bisa mengirimkan stiker animasi bergerak lucu dari anime sesuai suasana hatimu! 🎬🌸

🎯 *Cara Pakai:*
• *${prefix}gif <kategori>*
  _Contoh: ${prefix}gif hug_
• *${prefix}gif <kategori> @tag*
  _Contoh: ${prefix}gif pat @teman_
• *Perintah langsung:*
  _Contoh: ${prefix}hug, ${prefix}kiss, ${prefix}dance, ${prefix}slap_

━━━━━━━━━━━━━━━━━━━━━
❤️ *Kasih Sayang & Manis:*
• hug • kiss • cuddle • pat • handhold
• blowkiss • lappillow • peck • feed

😄 *Ekspresi & Emosi:*
• happy • smile • laugh • blush • smug
• teehee • wink • cry • pout • angry
• bored • confused • shocked

🐾 *Aktivitas & Gerakan:*
• dance • run • spin • sleep • yawn
• sip • nom • wag • nya • wave
• salute • clap • nod • nope • shrug
• stare • think • lurk • shake

💥 *Interaksi & Iseng:*
• slap • bonk • punch • kick • bite
• poke • tickle • highfive • handshake
• kabedon • yeet • shoot • facepalm
• tableflip • baka • bleh • thumbsup
━━━━━━━━━━━━━━━━━━━━━
💡 *Total:* 58 Kategori Stiker Animasi!
_Ketik nama aksinya langsung atau gunakan ${prefix}gif <nama> ya!_ 🥰`;

    await sock.sendMessage(remoteJid, { text }, { quoted: msg });
}

/**
 * Mengambil GIF dari API nekos.best, mengonversi ke WebP animasi, dan mengirimkan sebagai stiker.
 */
async function handleGifSticker(ctx, targetCategory) {
    const { sock, remoteJid, msg, reply, args, prefix, senderName, contacts } = ctx;

    let cat = (targetCategory || args[0] || '').toLowerCase().trim();

    // Jika tidak ada argumen atau minta menu
    if (!cat || cat === 'menu' || cat === 'help' || cat === 'list') {
        return await sendGifMenu(sock, remoteJid, msg, prefix);
    }

    // Resolusi alias (misal: peluk -> hug, joget -> dance)
    if (CATEGORY_ALIASES[cat]) {
        cat = CATEGORY_ALIASES[cat];
    }

    // Validasi apakah kategori didukung oleh nekos.best
    if (!GIF_CATEGORIES.includes(cat)) {
        return reply(`❌ Kategori *${cat}* tidak ditemukan!\n\nKetik *${prefix}menugif* untuk melihat daftar lengkap 58 kategori stiker animasi yang tersedia.`);
    }

    // Deteksi apakah ada orang yang di-tag / dibalas
    const quoted = msg.message?.extendedTextMessage?.contextInfo;
    const mentionedJid = quoted?.mentionedJid?.[0];
    const quotedParticipant = quoted?.participant;
    const targetJid = mentionedJid || quotedParticipant;

    let targetName = '';
    if (targetJid) {
        const targetNumber = targetJid.split('@')[0];
        targetName = contacts?.[targetJid] || targetNumber;
    }

    await reply(`⏳ _Nio sedang menyiapkan stiker animasi ${cat}..._`);

    try {
        const apiUrl = `https://nekos.best/api/v2/${cat}`;
        const res = await fetch(apiUrl, {
            signal: AbortSignal.timeout(12000),
            headers: {
                'User-Agent': 'RashBot/1.0 (https://github.com/Rash/RPRO)',
                'Accept': 'application/json'
            }
        });

        if (!res.ok) {
            throw new Error(`API error (status ${res.status})`);
        }

        const data = await res.json();
        const item = data.results?.[0];
        if (!item || !item.url) {
            throw new Error('Tidak ada URL GIF dalam respons server.');
        }

        // Unduh GIF
        const gifRes = await fetch(item.url, { signal: AbortSignal.timeout(15000) });
        if (!gifRes.ok) throw new Error(`Gagal mengunduh GIF (status ${gifRes.status})`);
        const gifBuffer = Buffer.from(await gifRes.arrayBuffer());

        // Konversi GIF ke WebP Animasi menggunakan Sharp
        let webpBuffer = await sharp(gifBuffer, { animated: true })
            .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
            .webp({ loop: 0, quality: 50, effort: 4 })
            .toBuffer();

        // Jika ukuran stiker lebih dari 900KB, kompres ulang agar aman di WhatsApp
        if (webpBuffer.length > 900000) {
            webpBuffer = await sharp(gifBuffer, { animated: true })
                .resize(384, 384, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
                .webp({ loop: 0, quality: 35, effort: 4 })
                .toBuffer();
        }

        // Sematkan EXIF metadata
        const packname = `Stiker Animasi: ${cat}`;
        const author = item.anime_name ? `${item.anime_name} • Nio` : 'Nio Bot';
        const finalStickerBuffer = addExifToWebp(webpBuffer, packname, author);

        // Jika ada target yang di-tag/dibalas, kirim teks interaksi manis terlebih dahulu
        if (targetJid && targetName) {
            const getDesc = ACTION_DESCRIPTIONS[cat] || ((s, t) => `✨ *${s}* melakukan aksi *${cat}* ke *${t}*! 🌸`);
            const interactionText = getDesc(senderName, targetName);
            await sock.sendMessage(remoteJid, {
                text: interactionText,
                mentions: [targetJid]
            }, { quoted: msg });
        }

        // Kirim stiker animasi
        await sock.sendMessage(remoteJid, {
            sticker: finalStickerBuffer
        }, { quoted: msg });

    } catch (err) {
        console.error(`Gagal membuat stiker animasi (${cat}):`, err);
        reply(`❌ *cemberut* Yahh, Nio gagal mengambil stiker animasi *${cat}* (${err.message}). Coba lagi nanti ya!`);
    }
}

// Susun array command untuk didaftarkan ke bot
const allCommands = [
    {
        name: 'gif',
        aliases: ['menugif', 'gifmenu', 'listgif', 'anigif', 'nekogif'],
        execute: async (ctx) => {
            // Jika dipanggil via alias menugif/gifmenu/listgif tanpa argumen, langsung tampilkan menu
            if (['menugif', 'gifmenu', 'listgif'].includes(ctx.command)) {
                return await sendGifMenu(ctx.sock, ctx.remoteJid, ctx.msg, ctx.prefix);
            }
            await handleGifSticker(ctx);
        }
    }
];

// Daftarkan semua 58 kategori sebagai shortcut command langsung (misal: .hug, .pat, .kiss, dsb.)
for (const cat of GIF_CATEGORIES) {
    // Cari alias untuk kategori ini (misal: peluk untuk hug)
    const aliases = Object.entries(CATEGORY_ALIASES)
        .filter(([_, target]) => target === cat)
        .map(([alias]) => alias);

    allCommands.push({
        name: cat,
        aliases,
        execute: async (ctx) => {
            await handleGifSticker(ctx, cat);
        }
    });
}

export default allCommands;

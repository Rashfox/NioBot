import sharp from 'sharp';
import { readDB } from './state.js';

// Fungsi Exif agar WhatsApp mendeteksinya sebagai Stiker yang sah
function addExifToWebp(webpBuffer, packname, author) {
    const json = { "sticker-pack-id": "nio-bot", "sticker-pack-name": packname, "sticker-pack-publisher": author, "emojis": ["✨"] };
    const exifAttr = Buffer.from([0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00]);
    const jsonBuf = Buffer.from(JSON.stringify(json), "utf-8");
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
        } else if (chunkId !== 'EXIF') chunks.push(webpBuffer.subarray(pos, pos + fullChunkSize));
        pos += fullChunkSize;
    }
    const finalBuffer = Buffer.concat(chunks);
    finalBuffer.writeUInt32LE(finalBuffer.length - 8, 4);
    return finalBuffer;
}

// Fungsi untuk "membersihkan" teks agar aman dirender di SVG
const escapeXml = (unsafe) => unsafe.replace(/[<>&'"]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','\'':'&apos;','"':'&quot;'}[c]));

export default {
    name: 'qc',
    aliases: ['quote', 'quickchat'],
    execute: async ({ sock, remoteJid, msg, reply, args, prefix, command, senderName, senderJid, contacts }) => {
        let text = args.join(' ');
        let targetJid = senderJid;
        // Prioritaskan nama profil WA (pushName) milik si pengirim command.
        let targetName = msg.pushName || senderName;

        const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const quotedParticipant = msg.message?.extendedTextMessage?.contextInfo?.participant;

        // Jika user menggunakan fitur ini dengan membalas pesan
        if (quotedMsg) {
            if (!text) {
                text = quotedMsg.conversation || quotedMsg.extendedTextMessage?.text || quotedMsg.imageMessage?.caption || quotedMsg.videoMessage?.caption || '';
            }
            
            // Di private chat, membalas pesan lawan bicara kadang membuat participant menjadi undefined
            targetJid = quotedParticipant || (remoteJid.endsWith('@g.us') ? senderJid : remoteJid);

            if (targetJid !== senderJid) {
                const db = readDB();
                const botNumber = sock.user?.id?.split(':')[0];
                
                if (botNumber && targetJid.includes(botNumber)) {
                    targetName = 'Nio';
                } else {
                    // Ambil nama dari contacts lokal, fallback ke DB terdaftar, lalu ke nomor WA
                    targetName = contacts[targetJid] || ((db.users && db.users[targetJid]) ? db.users[targetJid].name : targetJid.split('@')[0]);
                }
            }
        }

        if (!text) return reply(`❌ Masukkan teks atau balas pesan orang lain dengan perintah *${prefix}${command}*\n\nContoh: *${prefix}${command} Halo semua!*`);

        await reply('⏳ _Nio lagi buatin stiker pesannya..._');

        // Ambil foto profil WA user, jika tidak punya/privat, gunakan gambar avatar default
        let avatarUrl;
        try {
            avatarUrl = await sock.profilePictureUrl(targetJid, 'image');
        } catch (e) {
            avatarUrl = 'https://i.ibb.co/3Fh9V6p/avatar-contact.png'; 
        }

        // --- Implementasi Lokal Tanpa API ---
        try {
            // 1. Ambil avatar dan konversi ke format base64 untuk SVG
            const avatarFetch = await fetch(avatarUrl);
            const avatarBuffer = Buffer.from(await avatarFetch.arrayBuffer());
            const avatarBase64 = avatarBuffer.toString('base64');
            const avatarMime = avatarFetch.headers.get('content-type') || 'image/png';

            // 2. Fungsi sederhana untuk memotong teks agar tidak terlalu panjang
            function wrapText(text, maxCharsPerLine) {
                const words = text.split(' ');
                const lines = [];
                let currentLine = '';

                for (const word of words) {
                    if ((currentLine + ' ' + word).length > maxCharsPerLine && currentLine.length > 0) {
                        lines.push(currentLine);
                        currentLine = word;
                    } else {
                        currentLine += (currentLine ? ' ' : '') + word;
                    }
                }
                if (currentLine) lines.push(currentLine);
                return lines;
            }

            const wrappedLines = wrapText(text, 45); // Maksimal ~45 karakter per baris

            // 3. Tentukan layout, warna, dan dimensi dinamis
            const sidePadding = 25;
            const avatarSize = 50;
            const nameHeight = 25;
            const textLineHeight = 22;
            const textTopMargin = 15;

            // Hitung estimasi pixel berdasarkan panjang teks (huruf)
            let maxTextWidth = targetName.length * 11; // Estimasi lebar nama (bold)
            wrappedLines.forEach(line => {
                let lineWidth = line.length * 9; // Estimasi lebar teks biasa
                if (lineWidth > maxTextWidth) maxTextWidth = lineWidth;
            });

            // Hitung lebar dinamis: padding kiri + avatar + jarak + teks terpanjang + padding kanan
            const calculatedWidth = sidePadding + avatarSize + 15 + maxTextWidth + sidePadding;
            // Batasi lebar: minimal 200px, maksimal 512px
            const finalWidth = Math.min(512, Math.max(200, calculatedWidth));

            // Hitung tinggi konten (nama + teks) untuk menentukan tinggi SVG
            const contentBoxHeight = nameHeight + textTopMargin + (wrappedLines.length * textLineHeight);
            const calculatedHeight = sidePadding * 2 + contentBoxHeight;
            // Terapkan tinggi minimum
            const minHeight = 120;
            const finalHeight = Math.max(calculatedHeight, minHeight);

            // Hitung padding atas dinamis untuk menengahkan konten secara vertikal
            const topPadding = (finalHeight - contentBoxHeight) / 2;

            // 4. Buat gambar stiker menggunakan SVG
            const svg = `
                <svg width="${finalWidth}" height="${finalHeight}" xmlns="http://www.w3.org/2000/svg">
                    <defs><clipPath id="c"><circle cx="${sidePadding + avatarSize/2}" cy="${topPadding + avatarSize/2}" r="${avatarSize/2}"/></clipPath></defs>
                                        <rect width="100%" height="100%" fill="#1b1429" rx="15" ry="15"/>
                    <image href="data:${avatarMime};base64,${avatarBase64}" x="${sidePadding}" y="${topPadding}" width="${avatarSize}" height="${avatarSize}" clip-path="url(#c)"/>
                    <text x="${sidePadding + avatarSize + 15}" y="${topPadding + 20}" font-family="sans-serif" font-size="18" font-weight="bold" fill="#34d399">${escapeXml(targetName)}</text>
                    <text y="${topPadding + nameHeight + textTopMargin}" font-family="sans-serif" font-size="16" fill="#ffffff">
                        ${wrappedLines.map((line, i) => `<tspan x="${sidePadding + avatarSize + 15}" dy="${i === 0 ? 0 : '1.4em'}">${escapeXml(line)}</tspan>`).join('')}
                    </text>
                </svg>
            `;

            // 5. Konversi SVG ke stiker WebP
            const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();
            let webpBuffer = await sharp(pngBuffer)
                .resize(512, 512, {
                    fit: 'contain', // Menjaga proporsi asli, gak ditarik
                    background: { r: 0, g: 0, b: 0, alpha: 0 } // Ngasih ruang kosong transparan
                })
                .webp()
                .toBuffer();
            webpBuffer = addExifToWebp(webpBuffer, "Stiker Nio", "Nio");

            await sock.sendMessage(remoteJid, { sticker: webpBuffer }, { quoted: msg });
        } catch (err) {
            console.error("QC (Local) Error:", err);
            reply('❌ *cemberut* Nio gagal bikin stiker pesannya... Ada yang salah di dalam diri Nio. Rash, tolong periksa ya!');
        }
    }
};
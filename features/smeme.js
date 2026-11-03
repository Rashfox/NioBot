import sharp from 'sharp';
import { downloadContentFromMessage } from '@whiskeysockets/baileys';
import { exec } from 'child_process';
import fs from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

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

export default [
    // ─── SMEME STATIS (existing) ───
    {
        name: 'smeme',
        aliases: ['stickermeme', 'memesticker'],
        execute: async ({ sock, remoteJid, msg, reply, args, prefix, command }) => {
            const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            const imageMedia = msg.message?.imageMessage || (quoted && quoted.imageMessage);
            const stickerMedia = quoted?.stickerMessage;

            if (!imageMedia && !stickerMedia) {
                return reply(`❌ Kirim gambar dengan caption atau balas gambar/stiker dengan perintah:\n*${prefix}${command} teks atas | teks bawah*`);
            }
            if (stickerMedia && stickerMedia.isAnimated) return reply(`❌ Untuk stiker animasi, gunakan *${prefix}smemegif teks atas | teks bawah*`);

            const text = args.join(' ');
            if (!text) return reply(`❌ Masukkan teksnya juga dong!\nContoh: *${prefix}${command} teks atas | teks bawah*`);

            const [topText, bottomText] = text.split('|').map(t => (t ? t.trim().toUpperCase() : ''));

            await reply('⏳ _Nio lagi nempelin teksnya jadi meme..._');

            try {
                const mediaType = imageMedia ? 'image' : 'sticker';
                const mediaMessage = imageMedia || stickerMedia;
                
                const stream = await downloadContentFromMessage(mediaMessage, mediaType);
                const chunks = [];
                for await (const chunk of stream) chunks.push(chunk);
                const buffer = Buffer.concat(chunks);

                const width = 512;
                const height = 512;
                
                const escapeXml = (unsafe) => unsafe.replace(/[<>&'"]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','\'':'&apos;','"':'&quot;'}[c]));

                const svgText = (txt, y_pos) => `<text x="50%" y="${y_pos}" text-anchor="middle" style="font-family: Impact, sans-serif; font-size: 50px; fill: white; stroke: black; stroke-width: 3px; paint-order: stroke;">${escapeXml(txt)}</text>`;
                
                let svgElements = '';
                if (topText) svgElements += svgText(topText, '15%');
                if (bottomText) svgElements += svgText(bottomText, '90%');

                const svg = `<svg width="${width}" height="${height}">${svgElements}</svg>`;

                const finalBuffer = await sharp(buffer)
                    .resize(width, height, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
                    .composite([{ input: Buffer.from(svg), gravity: 'center' }])
                    .toBuffer();

                let webpBuffer = await sharp(finalBuffer).webp().toBuffer();
                webpBuffer = addExifToWebp(webpBuffer, "Meme by Nio", "Nio");
                
                await sock.sendMessage(remoteJid, { sticker: webpBuffer }, { quoted: msg });
            } catch (e) {
                console.error("smeme error:", e);
                reply('❌ *cemberut* Nio gagal bikin meme stikernya... Coba lagi ya!');
            }
        }
    },

    // ─── SMEME ANIMASI (GIF/Video → Stiker Meme Animasi) ───
    {
        name: 'smemegif',
        aliases: ['memeanimasi', 'gifmeme', 'ameme'],
        execute: async ({ sock, remoteJid, msg, reply, args, prefix, command }) => {
            const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            const videoMedia = msg.message?.videoMessage || (quoted && quoted.videoMessage);
            const stickerMedia = quoted?.stickerMessage;

            // Hanya terima video/GIF atau stiker animasi
            const animatedMedia = videoMedia || (stickerMedia && stickerMedia.isAnimated ? stickerMedia : null);

            if (!animatedMedia) {
                return reply(`❌ Balas *video/GIF* atau *stiker animasi* dengan perintah:\n*${prefix}${command} teks atas | teks bawah*\n\nContoh: *${prefix}${command} POV | Ketika kamu lupa PR*`);
            }

            const text = args.join(' ');
            if (!text) return reply(`❌ Masukkan teksnya juga dong!\nContoh: *${prefix}${command} teks atas | teks bawah*`);

            if (videoMedia && (videoMedia.seconds || 0) > 10) {
                return reply('❌ Video/GIF terlalu panjang! Maksimal 10 detik ya.');
            }

            const [topText, bottomText] = text.split('|').map(t => (t ? t.trim().toUpperCase() : ''));

            await reply('⏳ _Nio lagi bikin meme animasi... Sabar ya, agak lama~_');

            const tempId = Date.now();
            const tempInPath = join(tmpdir(), `memein_${tempId}.${videoMedia ? 'mp4' : 'webp'}`);
            const tempOutPath = join(tmpdir(), `memeout_${tempId}.webp`);

            try {
                // Download media
                const mediaType = videoMedia ? 'video' : 'sticker';
                const mediaMessage = videoMedia || stickerMedia;
                const stream = await downloadContentFromMessage(mediaMessage, mediaType);
                const chunks = [];
                for await (const chunk of stream) chunks.push(chunk);
                await fs.writeFile(tempInPath, Buffer.concat(chunks));

                // Bangun filter teks drawtext FFMPEG
                const escapeFFmpeg = (txt) => txt.replace(/'/g, "'\\''").replace(/:/g, '\\:').replace(/\\/g, '\\\\');
                
                let drawFilter = '';
                if (topText) {
                    drawFilter += `drawtext=text='${escapeFFmpeg(topText)}':fontsize=36:fontcolor=white:borderw=3:bordercolor=black:x=(w-text_w)/2:y=20`;
                }
                if (bottomText) {
                    if (drawFilter) drawFilter += ',';
                    drawFilter += `drawtext=text='${escapeFFmpeg(bottomText)}':fontsize=36:fontcolor=white:borderw=3:bordercolor=black:x=(w-text_w)/2:y=h-text_h-20`;
                }

                // Filter chain: scale + pad + fps + drawtext
                let filterChain = `scale=512:512:force_original_aspect_ratio=decrease,fps=15,pad=512:512:-1:-1:color=0x00000000`;
                if (drawFilter) filterChain += `,${drawFilter}`;

                const ffmpegCmd = `ffmpeg -y -i "${tempInPath}" -vcodec libwebp -filter:v "${filterChain}" -loop 0 -ss 00:00:00.0 -t 00:00:10.0 -preset default -an -vsync 0 -f webp "${tempOutPath}"`;

                await new Promise((resolve, reject) => {
                    exec(ffmpegCmd, (error) => {
                        if (error) reject(error);
                        else resolve();
                    });
                });

                let webpBuffer = await fs.readFile(tempOutPath);
                webpBuffer = addExifToWebp(webpBuffer, "Meme Animasi by Nio", "Nio");
                await sock.sendMessage(remoteJid, { sticker: webpBuffer }, { quoted: msg });

            } catch (e) {
                console.error("smemegif error:", e);
                reply('❌ *cemberut* Nio gagal bikin meme animasinya... Pastikan FFMPEG sudah terinstall ya!');
            } finally {
                await fs.unlink(tempInPath).catch(() => {});
                await fs.unlink(tempOutPath).catch(() => {});
            }
        }
    }
];
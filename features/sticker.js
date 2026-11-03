import sharp from 'sharp';
import { downloadContentFromMessage } from '@whiskeysockets/baileys';
import { exec } from 'child_process';
import fs from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

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

export default {
    name: 'stiker',
    aliases: ['s'],
    execute: async ({ sock, remoteJid, msg, reply, args, prefix, command }) => {
        const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const imageMedia = msg.message?.imageMessage || (quoted && quoted.imageMessage);
        const videoMedia = msg.message?.videoMessage || (quoted && quoted.videoMessage);

        if (!imageMedia && !videoMedia) {
            return reply(`❌ Kirim gambar/GIF dengan caption *${prefix}${command}* atau balas media dengan perintah tersebut.`);
        }
        
        await reply('⏳ _Nio lagi potong-potong medianya jadi stiker..._');

        if (imageMedia) {
            // Handle static image
            try {
                const stream = await downloadContentFromMessage(imageMedia, 'image');
                const chunks = [];
                for await (const chunk of stream) chunks.push(chunk);
                let sharpImg = sharp(Buffer.concat(chunks)).resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } });
                let webpBuffer = await sharpImg.webp().toBuffer();
                webpBuffer = addExifToWebp(webpBuffer, "Stiker Nio", "Nio");
                await sock.sendMessage(remoteJid, { sticker: webpBuffer }, { quoted: msg });
            } catch (e) {
                console.error("Sticker (image) error:", e);
                reply('❌ *cemberut* Nio gagal bikin stiker dari gambarnya... Maaf ya!');
            }
        } else if (videoMedia) {
            // Handle animated GIF/video
            if ((videoMedia.seconds || 0) > 10) {
                return reply('❌ Video/GIF terlalu panjang! Maksimal 10 detik ya.');
            }

            const tempInPath = join(tmpdir(), `temp_in_${Date.now()}.mp4`);
            const tempOutPath = join(tmpdir(), `temp_out_${Date.now()}.webp`);

            try {
                const stream = await downloadContentFromMessage(videoMedia, 'video');
                const chunks = [];
                for await (const chunk of stream) chunks.push(chunk);
                await fs.writeFile(tempInPath, Buffer.concat(chunks));

                const ffmpegCommand = `ffmpeg -i "${tempInPath}" -vcodec libwebp -filter:v "scale=512:512:force_original_aspect_ratio=decrease,fps=15,pad=512:512:-1:-1:color=0x00000000" -loop 0 -ss 00:00:00.0 -t 00:00:10.0 -preset default -an -vsync 0 -f webp "${tempOutPath}"`;

                exec(ffmpegCommand, async (error) => {
                    if (error) {
                        console.error("FFMPEG Error:", error);
                        reply('❌ Gagal konversi ke stiker animasi. Pastikan FFMPEG sudah terinstall di sistem ya, Rash!');
                        await fs.unlink(tempInPath).catch(e => console.error("Failed to delete temp input file:", e));
                        return;
                    }

                    let webpBuffer = await fs.readFile(tempOutPath);
                    webpBuffer = addExifToWebp(webpBuffer, "Stiker Animasi Nio", "Nio");
                    await sock.sendMessage(remoteJid, { sticker: webpBuffer }, { quoted: msg });

                    await fs.unlink(tempInPath).catch(e => console.error("Failed to delete temp input file:", e));
                    await fs.unlink(tempOutPath).catch(e => console.error("Failed to delete temp output file:", e));
                });
            } catch (e) {
                console.error("Sticker (video) error:", e);
                reply('❌ *cemberut* Nio gagal bikin stiker dari videonya... Maaf ya!');
                await fs.unlink(tempInPath).catch(() => {});
                await fs.unlink(tempOutPath).catch(() => {});
            }
        }
    }
};
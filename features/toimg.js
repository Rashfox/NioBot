import sharp from 'sharp';
import { downloadContentFromMessage } from '@whiskeysockets/baileys';
import { exec } from 'child_process';
import fs from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

export default [
    // ─── TOIMG: Stiker statis → Gambar PNG ───
    {
        name: 'toimg',
        aliases: ['toimage', 'stikertoimg'],
        execute: async ({ sock, remoteJid, msg, reply, prefix, command }) => {
            const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            const media = msg.message?.stickerMessage || (quoted && quoted.stickerMessage);
            
            if (!media) return reply(`❌ Balas stiker yang ingin diubah menjadi gambar dengan perintah *${prefix}${command}*`);
            
            // Jika stiker animasi, arahkan ke togif
            if (media.isAnimated) return reply(`❌ Ini stiker animasi! Gunakan *${prefix}togif* untuk mengubahnya menjadi GIF.`);

            await reply('⏳ _Nio lagi ubah stikernya jadi gambar..._');
            try {
                const stream = await downloadContentFromMessage(media, 'sticker');
                const chunks = [];
                for await (const chunk of stream) chunks.push(chunk);
                const buffer = Buffer.concat(chunks);
                
                // Konversi webp ke png menggunakan sharp agar background transparan tetap terjaga (opsional: bisa juga ke jpeg)
                const imgBuffer = await sharp(buffer).png().toBuffer();
                
                await sock.sendMessage(remoteJid, { image: imgBuffer, caption: '✨ Ini dia gambarnya! 🌸' }, { quoted: msg });
            } catch (e) { 
                console.error("toimg error:", e);
                reply('❌ *cemberut* Nio gagal ubah stikernya... Maaf ya!'); 
            }
        }
    },

    // ─── TOGIF: Stiker animasi → Video/GIF ───
    {
        name: 'togif',
        aliases: ['stikertogif', 'tovideo', 'tovid'],
        execute: async ({ sock, remoteJid, msg, reply, prefix, command }) => {
            const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            const media = msg.message?.stickerMessage || (quoted && quoted.stickerMessage);

            if (!media) return reply(`❌ Balas stiker animasi dengan perintah *${prefix}${command}*`);
            if (!media.isAnimated) return reply(`❌ Ini stiker statis! Gunakan *${prefix}toimg* untuk mengubahnya menjadi gambar.`);

            await reply('⏳ _Nio lagi ubah stiker animasinya jadi GIF..._');

            const tempId = Date.now();
            const tempInPath = join(tmpdir(), `togif_in_${tempId}.webp`);
            const tempOutPath = join(tmpdir(), `togif_out_${tempId}.mp4`);

            try {
                const stream = await downloadContentFromMessage(media, 'sticker');
                const chunks = [];
                for await (const chunk of stream) chunks.push(chunk);
                await fs.writeFile(tempInPath, Buffer.concat(chunks));

                // Konversi WebP animasi → MP4 (WhatsApp mengirim sebagai GIF jika gifPlayback: true)
                const ffmpegCmd = `ffmpeg -y -i "${tempInPath}" -movflags faststart -pix_fmt yuv420p -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" -an "${tempOutPath}"`;

                await new Promise((resolve, reject) => {
                    exec(ffmpegCmd, (error) => {
                        if (error) reject(error);
                        else resolve();
                    });
                });

                const mp4Buffer = await fs.readFile(tempOutPath);

                // Kirim sebagai video dengan gifPlayback: true agar WhatsApp tampilkan sebagai GIF
                await sock.sendMessage(remoteJid, {
                    video: mp4Buffer,
                    gifPlayback: true,
                    caption: '✨ Ini dia GIF-nya! 🎬'
                }, { quoted: msg });

            } catch (e) {
                console.error("togif error:", e);
                reply('❌ *cemberut* Nio gagal ubah stiker animasinya jadi GIF... Pastikan FFMPEG terinstall ya!');
            } finally {
                await fs.unlink(tempInPath).catch(() => {});
                await fs.unlink(tempOutPath).catch(() => {});
            }
        }
    },

    // ─── GIFTOSTIKER: GIF/Video → Stiker animasi ───
    {
        name: 'gifs',
        aliases: ['giftostiker', 'gifstiker', 'gif2s', 'vidstiker'],
        execute: async ({ sock, remoteJid, msg, reply, prefix, command }) => {
            const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            const videoMedia = msg.message?.videoMessage || (quoted && quoted.videoMessage);

            if (!videoMedia) {
                return reply(`❌ Kirim atau balas *GIF/video* dengan perintah *${prefix}${command}* untuk dijadikan stiker animasi.`);
            }

            if ((videoMedia.seconds || 0) > 10) {
                return reply('❌ Video/GIF terlalu panjang! Maksimal 10 detik ya.');
            }

            await reply('⏳ _Nio lagi ubah GIF/video-nya jadi stiker animasi..._');

            const tempId = Date.now();
            const tempInPath = join(tmpdir(), `gifs_in_${tempId}.mp4`);
            const tempOutPath = join(tmpdir(), `gifs_out_${tempId}.webp`);

            try {
                const stream = await downloadContentFromMessage(videoMedia, 'video');
                const chunks = [];
                for await (const chunk of stream) chunks.push(chunk);
                await fs.writeFile(tempInPath, Buffer.concat(chunks));

                const ffmpegCmd = `ffmpeg -y -i "${tempInPath}" -vcodec libwebp -filter:v "scale=512:512:force_original_aspect_ratio=decrease,fps=15,pad=512:512:-1:-1:color=0x00000000" -loop 0 -ss 00:00:00.0 -t 00:00:10.0 -preset default -an -vsync 0 -f webp "${tempOutPath}"`;

                await new Promise((resolve, reject) => {
                    exec(ffmpegCmd, (error) => {
                        if (error) reject(error);
                        else resolve();
                    });
                });

                let webpBuffer = await fs.readFile(tempOutPath);

                // Sematkan EXIF metadata
                const json = { "sticker-pack-id": "nio-bot", "sticker-pack-name": "Stiker Animasi Nio", "sticker-pack-publisher": "Nio", "emojis": ["✨"] };
                const exifAttr = Buffer.from([0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00]);
                const jsonBuf = Buffer.from(JSON.stringify(json), "utf-8");
                const exif = Buffer.concat([exifAttr, jsonBuf]);
                exif.writeUIntLE(jsonBuf.length, 14, 4);

                let chunksList = [];
                let pos = 0;
                chunksList.push(webpBuffer.subarray(0, 12));
                pos += 12;

                while (pos < webpBuffer.length) {
                    const chunkId = webpBuffer.subarray(pos, pos + 4).toString('ascii');
                    const chunkSize = webpBuffer.readUInt32LE(pos + 4);
                    const fullChunkSize = 8 + chunkSize + (chunkSize % 2);

                    if (chunkId === 'VP8X') {
                        const vp8x = Buffer.alloc(fullChunkSize);
                        webpBuffer.copy(vp8x, 0, pos, pos + fullChunkSize);
                        vp8x[8] |= 0x08;
                        chunksList.push(vp8x);
                        const exifChunkHeader = Buffer.alloc(8);
                        exifChunkHeader.write('EXIF', 0);
                        exifChunkHeader.writeUInt32LE(exif.length, 4);
                        chunksList.push(exifChunkHeader);
                        chunksList.push(exif);
                        if (exif.length % 2 !== 0) chunksList.push(Buffer.from([0]));
                    } else if (chunkId !== 'EXIF') {
                        chunksList.push(webpBuffer.subarray(pos, pos + fullChunkSize));
                    }
                    pos += fullChunkSize;
                }
                const finalBuffer = Buffer.concat(chunksList);
                finalBuffer.writeUInt32LE(finalBuffer.length - 8, 4);

                await sock.sendMessage(remoteJid, { sticker: finalBuffer }, { quoted: msg });

            } catch (e) {
                console.error("gifs error:", e);
                reply('❌ *cemberut* Nio gagal ubah GIF/video-nya jadi stiker animasi... Pastikan FFMPEG terinstall ya!');
            } finally {
                await fs.unlink(tempInPath).catch(() => {});
                await fs.unlink(tempOutPath).catch(() => {});
            }
        }
    }
];